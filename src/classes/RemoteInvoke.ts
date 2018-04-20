import EventSpace from "eventspace";
import log from 'log-formatter';

import * as MessageData from './MessageData';
import { MessageType } from "../interfaces/MessageType";
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { InternalMessageType } from './../interfaces/InternalMessageType';
import { InvokeReceivingData } from "../interfaces/InvokeReceivingData";
import { InvokeSendingData } from "../interfaces/InvokeSendingData";

export class RemoteInvoke {

    //#region 属性

    /**
     * 请求响应超时，默认3分钟
     */
    static readonly timeout = 3 * 60 * 1000;

    /**
     * 默认文件片段大小 512kb
     */
    static readonly filePieceSize = 512 * 1024;

    /**
     * 消息path的最大长度
     */
    static readonly pathMaxLength = 256;

    /**
     * 自增消息编号索引
     */
    private _messageID = 0;

    /**
     * 连接端口
     */
    private readonly _socket: ConnectionSocket;

    /**
     * 处理接收消息栈
     */
    private readonly _inStack = new EventSpace();

    /**
     * 处理发送消息栈
     */
    private readonly _outStack = new EventSpace();

    /**
     * 处理系统内消息栈
     */
    private readonly _systemStack = new EventSpace();

    /**
     * 当前模块名称
     */
    readonly moduleName: string;

    /**
     * 是否打印收到和发送的消息（用于调试）。默认false
     */
    printMessage: boolean = false;

    /**
     * 是否打印系统错误，默认true
     */
    printError: boolean = true;

    //#endregion

    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket: ConnectionSocket, moduleName: string) {
        //#region 类属性配置

        if (socket.ri != null)
            throw new Error('传入的ConnectionSocket已在其他地方被使用');

        this._socket = socket;
        this.moduleName = moduleName;

        this._socket.ri = this;
        this._socket.onOpen = () => this._systemStack.get([InternalMessageType.onConnectionOpen] as any).triggerDescendants();
        this._socket.onClose = () => this._systemStack.get([InternalMessageType.onConnectionClose] as any).triggerDescendants();
        this._socket.onMessage = (header, body) => {
            try {
                const p_header = JSON.parse(header);
                this._inStack.get([p_header[0]]).trigger([p_header, body]);
            } catch (error) {
                this._printError(error);
            }
        }

        //#endregion

        //#region 入栈配置

        this._inStack.get([MessageType.invoke_request] as any).on(([header, body]: [any[], Buffer]) => {
            const msg = MessageData.InvokeRequestMessage.parse(this, header, body);
            this._printMessage(false, msg);

            const layer = this._inStack.get([msg.type, msg.path] as any);

            if (layer.has()) {
                const result: InvokeReceivingData = {
                    remoteName: msg.sender,
                    data: msg.data,
                    files: msg.files.map(item => ({
                        size: item.size,
                        splitNumber: item.splitNumber,
                        name: item.name,
                        onData: (callback,startIndex) => {

                        },
                        getFile: async () => {
                            return Buffer.alloc(0);
                        }
                    }))
                };

            } else {
                this._outStack.get([MessageType.invoke_failed] as any).trigger([msg, new Error("调用的方法不存在")]);
            }
        });

        //#endregion

        //#region 出栈配置

        //#endregion

        //#region 系统栈配置

        //#endregion
    }

    //#region API

    /**
     * 对外导出方法。     
     * 如果要向调用方反馈错误，直接 throw new Error() 即可。     
     * 注意：对于导出方法，当它执行完成，返回结果后就不可以再继续下载文件了。     
     * 注意：一个path上只允许导出一个方法。如果重复导出则后面的应该覆盖掉前面的。     
     * @param path 所导出的路径
     * @param func 导出的方法 
     */
    export<F extends (data: InvokeReceivingData) => Promise<void | InvokeSendingData>>(path: string, func: F): F {
        this.cancelExport(path);
        this._inStack.get([MessageType.invoke_request, path] as any).on(async ([data, msg]: [InvokeReceivingData, MessageData.InvokeRequestMessage]) => {
            try {
                const result = await func(data) || { data: null };
                this._outStack.get([MessageType.invoke_response] as any).trigger([msg, result]);
            } catch (error) {
                this._outStack.get([MessageType.invoke_failed] as any).trigger([msg, error]);
            }
        });

        return func;
    }

    /**
     * 取消对外导出的方法
     * @param path 之前导出的路径
     */
    cancelExport(path: string) {
        this._inStack.get([MessageType.invoke_request, path] as any).off();
    }

    /**
     * 调用远端模块导出的方法。返回数据和所有下载到的文件
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     */
    invoke(receiver: string, path: string, data?: InvokeSendingData): Promise<{ data: any, files: { name: string, data: Buffer }[] }>
    /**
     * 调用远端模块导出的方法。
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     * @param callback 接收响应的回调。注意：一旦回调执行完成就不能再下载文件了。
     */
    invoke(receiver: string, path: string, data: InvokeSendingData | undefined, callback: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): void
    invoke(receiver: string, path: string, data: InvokeSendingData = { data: null }, callback?: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): any {

    }
    //#endregion

    //#region 工具方法

    private _prepare_InvokeReceivingData(msg: MessageData.InvokeRequestMessage | MessageData.InvokeResponseMessage): InvokeReceivingData {
        const messageID = msg instanceof MessageData.InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;

        return {
            remoteName: msg.sender,
            data: msg.data,
            files: msg.files.map(item => ({
                size: item.size,
                splitNumber: item.splitNumber,
                name: item.name,
                onData: async () => {

                },
                getFile: async () => {
                    return Buffer.alloc(0);
                }
            }))
        };
    }

    /**
     * 打印收到或发送的消息
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param msg 要打印的消息
     */
    private _printMessage(sendOrReceive: boolean, msg: MessageData.MessageData): void {
        if (this.printMessage)
            if (sendOrReceive)
                log
                    .location
                    .location.bold
                    .text.cyan.bold.round
                    .content.cyan('remote-invoke', this.moduleName, '发送', msg.toString());
            else
                log
                    .location
                    .location.bold
                    .text.green.bold.round
                    .content.green('remote-invoke', this.moduleName, '收到', msg.toString());
    }

    /**
     * 打印错误消息
     * @param err 错误信息
     */
    private _printError(err: Error): void {
        if (this.printError)
            log.warn
                .location.white
                .location.white.bold
                .content.yellow('remote-invoke', this.moduleName, err);
    }

    //#endregion
}