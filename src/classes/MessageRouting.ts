import { EventSpace } from "eventspace/bin/classes/EventSpace";
import { EventLevel } from 'eventspace/bin/classes/EventLevel';
import log from 'log-formatter';

import { MessageType } from '../interfaces/MessageType';
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { SendingFile } from "../interfaces/InvokeSendingData";
import {
    InvokeRequestMessage,
    InvokeResponseMessage,
    InvokeFinishMessage,
    InvokeFailedMessage,
    InvokeFileRequestMessage,
    InvokeFileResponseMessage,
    InvokeFileFailedMessage,
    InvokeFileFinishMessage,
    BroadcastMessage,
    BroadcastOpenMessage,
    BroadcastOpenFinishMessage,
    BroadcastCloseMessage,
    BroadcastCloseFinishMessage,
    MessageData
} from './MessageData';

/**
 * 消息路由中心，负责收发消息
 */
export abstract class MessageRouting {

    /**
     * 自增消息编号索引
     */
    private _messageID = 0;

    /**
     * 连接端口
     */
    protected readonly _socket: ConnectionSocket;

    /**
     * 注册的各类消息监听器
     */
    protected readonly _messageListener = new EventSpace();

    /**
     * 请求响应超时，默认3分钟
     */
    readonly timeout = 3 * 60 * 1000;

    /**
     * 默认文件片段大小 512kb
     */
    readonly filePieceSize = 512 * 1024;

    /**
     * 消息path的最大长度
     */
    readonly pathMaxLength = 256;

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

    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket: ConnectionSocket, moduleName: string) {
        this.moduleName = moduleName;
        this._socket = socket;

        this._socket.onMessage = (header: string, body: Buffer) => {
            try {
                const p_header = JSON.parse(header);

                switch (p_header[0]) {
                    case MessageType.invoke_request: {  //被调用者收到调用请求
                        const msg = InvokeRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        const eventName = [msg.type, msg.path] as any;

                        if (this._messageListener.has(eventName))
                            this._messageListener.trigger(eventName, msg);
                        else
                            this._send_InvokeFailedMessage(msg, new Error("调用的方法不存在"));

                        break;
                    }
                    case MessageType.invoke_response: { //调用者收到调用响应
                        const msg = InvokeResponseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_finish: {   //被调用者收到调用结束响应
                        const msg = InvokeFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.responseMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_failed: {   //调用者收到调用失败响应
                        const msg = InvokeFailedMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_request: {
                        const msg = InvokeFileRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_response: {
                        const msg = InvokeFileResponseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_failed: {
                        const msg = InvokeFileFailedMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_finish: {
                        const msg = InvokeFileFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.broadcast: {
                        const msg = BroadcastMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        const eventName = [msg.type, msg.sender, ...msg.path.split('.')] as any;

                        if (this._messageListener.hasAncestors(eventName)) {
                            this._messageListener.triggerAncestors(eventName, msg.data, true, true);
                        } else {  //如果没有注册过这个广播的监听器，就通知对方不要再发送了
                            this._send_BroadcastCloseMessage(msg.sender, msg.path);
                        }

                        break;
                    }
                    case MessageType.broadcast_open: {
                        const msg = BroadcastOpenMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        //记录对方要监听哪个路径上的广播
                        this._messageListener.receive([MessageType._broadcast_white_list, ...msg.path.split('.')] as any, msg.path as any);
                        this._send_BroadcastOpenFinishMessage(msg);

                        break;
                    }
                    case MessageType.broadcast_open_finish: {
                        const msg = BroadcastOpenFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.messageID] as any, msg);

                        break;
                    }
                    case MessageType.broadcast_close: {
                        const msg = BroadcastCloseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.cancel([MessageType._broadcast_white_list, ...msg.path.split('.')] as any);  //清除标记
                        this._send_BroadcastCloseFinishMessage(msg);

                        break;
                    }
                    case MessageType.broadcast_close_finish: {
                        const msg = BroadcastCloseFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.messageID] as any, msg);

                        break;
                    }
                    default:
                        throw new Error(`未知消息类型：${p_header}`);
                }
            } catch (error) {
                this._printError('接收到的消息格式错误：', error);
            }
        };

        this._socket.onOpen = () => this._messageListener.triggerDescendants([MessageType._onOpen] as any);

        this._socket.onClose = () => this._messageListener.triggerDescendants([MessageType._onClose] as any);

        //当端口打开之后立刻通知对方要监听哪些广播
        this._messageListener.receive([MessageType._onOpen] as any, () => {
            this._messageListener._eventLevel.getChildLevel([MessageType.broadcast] as any, true)
                .children.forEach((level, broadcastSender) => {
                    const forEachLevel = (level: EventLevel) => {
                        if (level.receivers.size > 0) {
                            this._send_BroadcastOpenMessage(broadcastSender, level.receivers.values().next().value as any);
                        }

                        level.children.forEach(forEachLevel);
                    };

                    level.children.forEach(forEachLevel);
                });
        });

        //当连接断开后立刻清理对方注册过的广播路径
        this._messageListener.receive([MessageType._onClose] as any, () => {
            this._messageListener.cancelDescendants([MessageType._broadcast_white_list] as any);
        });
    }

    protected _send_InvokeRequestMessage() {

    }

    protected _send_InvokeResponseMessage() {

    }

    /**
     * 方便_send_InvokeRequestMessage与_send_InvokeResponseMessage发送文件。
     * 发送超时后会自动清理资源，也可使用返回的clean方法提前清理资源
     */
    private _send_SendingFile(msg: InvokeRequestMessage | InvokeResponseMessage, onTimeout: Function): Function {
        const messageID = msg instanceof InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;
        const clean = () => {  //清理资源回调
            clearTimeout(timer);
            this._messageListener.cancelDescendants([MessageType.invoke_file_request, msg.receiver, messageID] as any);
        }
        const timeout = () => { clean(); onTimeout(); };

        let timer = setTimeout(timeout, this.timeout);

        msg.files.forEach(item => {
            let sendingData = item._data as SendingFile;
            let index = -1;    //记录用户请求到了第几个文件片段了

            const send_error = (msg: InvokeFileRequestMessage, err: Error) => {
                sendingData.onProgress && sendingData.onProgress(err, undefined as any);
                this._send_InvokeFileFailedMessage(msg, err);

                //不允许再下载该文件了
                this._messageListener.cancel([MessageType.invoke_file_request, msg.receiver, messageID, item.id] as any);
            }

            const send_finish = (msg: InvokeFileRequestMessage) => {
                this._send_InvokeFileFinishMessage(msg);

                //不允许再下载该文件了
                this._messageListener.cancel([MessageType.invoke_file_request, msg.receiver, messageID, item.id] as any);
            };

            this._messageListener.receive([MessageType.invoke_file_request, msg.receiver, messageID, item.id] as any, (msg: InvokeFileRequestMessage) => {
                clearTimeout(timer);
                timer = setTimeout(timeout, this.timeout);

                if (msg.index > index) {
                    index = msg.index;
                } else {
                    send_error(msg, new Error('重复下载文件片段')); return;
                }

                if (Buffer.isBuffer(sendingData.file)) {
                    if (index < (item.splitNumber as number))
                        this._send_InvokeFileResponseMessage(msg, sendingData.file.slice(index * this.filePieceSize, (index + 1) * this.filePieceSize))
                            .then(() => sendingData.onProgress && sendingData.onProgress(undefined, (index + 1) / (item.splitNumber as number)))
                            .catch(err => send_error(msg, err));
                    else
                        send_finish(msg);
                } else {
                    sendingData.file(index).then(data => {
                        if (Buffer.isBuffer(data)) 
                            this._send_InvokeFileResponseMessage(msg, data).catch(err => send_error(msg, err));
                         else 
                            send_finish(msg);
                    }).catch(err => {
                        send_error(msg, err);
                    });
                }
            });
        });

        return clean;
    }

    protected _send_InvokeFinishMessage() {

    }

    protected _send_InvokeFailedMessage(msg: InvokeRequestMessage, error: Error): void {
        this._send_MessageData(InvokeFailedMessage.create(this, msg, error))
            .catch(err => this._printError(`向对方发送"InvokeFailedMessage -> ${error.message}"失败`, err));
    }

    /**
     * 下载一个文件片段，如果返回void则表示下载完成了，超时或下载失败会抛出异常。
     */
    protected _send_InvokeFileRequestMessage(msg: InvokeRequestMessage | InvokeResponseMessage, fileID: number, index: number): Promise<Buffer | void> {
        return new Promise((resolve, reject) => {
            const splitNumber = msg.files[fileID].splitNumber;  //在该程序中fileID与数组编号是相同的
            if (splitNumber && index >= splitNumber) {          //判断给定的index是否已经超出了范围
                resolve();
            } else {
                const message = InvokeFileRequestMessage.create(this, msg, fileID, index);
                const timer = setTimeout(() => { clean(); reject(new Error('请求超时')); }, this.timeout);
                const clean = () => {
                    clearTimeout(timer);
                    this._messageListener.cancel([MessageType.invoke_file_response, msg.sender, message.messageID, fileID] as any);
                    this._messageListener.cancel([MessageType.invoke_file_failed, msg.sender, message.messageID, fileID] as any);
                    this._messageListener.cancel([MessageType.invoke_file_finish, msg.sender, message.messageID, fileID] as any);
                };

                this._send_MessageData(message).then(() => {
                    //监听下载到的文件
                    this._messageListener.receiveOnce([MessageType.invoke_file_response, msg.sender, message.messageID, fileID] as any, (msg: InvokeFileResponseMessage) => {
                        clean();
                        index !== msg.index ? reject(new Error('文件在传输过程中，顺序发生错乱')) : resolve(msg.data);
                    });

                    //监听下载文件失败
                    this._messageListener.receiveOnce([MessageType.invoke_file_failed, msg.sender, message.messageID, fileID] as any, (msg: InvokeFileFailedMessage) => {
                        clean();
                        reject(new Error(msg.error));
                    });

                    //监听下载文件结束
                    this._messageListener.receiveOnce([MessageType.invoke_file_finish, msg.sender, message.messageID, fileID] as any, (msg: InvokeFileFinishMessage) => {
                        clean();
                        resolve();
                    });
                }).catch(err => {
                    clean();
                    reject(err);
                });
            }
        });
    }

    private _send_InvokeFileResponseMessage(msg: InvokeFileRequestMessage, data: Buffer): Promise<void> {
        return this._send_MessageData(InvokeFileResponseMessage.create(this, msg, data));
    }

    private _send_InvokeFileFailedMessage(msg: InvokeFileRequestMessage, error: Error): void {
        this._send_MessageData(InvokeFileFailedMessage.create(this, msg, error))
            .catch(err => this._printError(`向对方发送"InvokeFileFailedMessage-> ${error.message}"失败`, err));
    }

    private _send_InvokeFileFinishMessage(msg: InvokeFileRequestMessage): void {
        this._send_MessageData(InvokeFileFinishMessage.create(this, msg))
            .catch(err => this._printError('向对方发送"InvokeFileFinishMessage"失败', err));
    }

    protected async _send_BroadcastMessage(path: string, data: any): Promise<void> {
        //判断对方是否注册的有关于这条广播的监听器
        if (this._messageListener.hasAncestors([MessageType._broadcast_white_list, ...path.split('.')] as any)) {
            await this._send_MessageData(BroadcastMessage.create(this, path, data));
        }
    }

    protected _send_BroadcastOpenMessage(broadcastSender: string, path: string): void {
        if (this._socket.connected) {    //加这个判断是为了确保"MessageType._onClose"能够触发
            const result = BroadcastOpenMessage.create(this, this._messageID++, broadcastSender, path);

            const interval = () => {
                this._send_MessageData(result)
                    .catch(err => this._printError(`向对方发送"BroadcastOpenMessage -> 通知对方现在要接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));
            }

            const timer = setInterval(interval, this.timeout);    //到了时间如果还没有收到对方响应就重新发送一次

            this._messageListener.receiveOnce([MessageType.broadcast_open_finish, result.messageID] as any, () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType._onClose, MessageType.broadcast_open_finish, result.messageID] as any);
            });

            this._messageListener.receiveOnce([MessageType._onClose, MessageType.broadcast_open_finish, result.messageID] as any, () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType.broadcast_open_finish, result.messageID] as any);
            });

            interval();
        } else {
            this._printError(`向对方发送"BroadcastOpenMessage -> 通知对方现在要接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, new Error('网络中断'));
        }
    }

    protected _send_BroadcastOpenFinishMessage(msg: BroadcastOpenMessage): void {
        this._send_MessageData(BroadcastOpenFinishMessage.create(this, msg))
            .catch(err => this._printError('向对方发送"BroadcastOpenFinishMessage"失败', err));
    }

    protected _send_BroadcastCloseMessage(broadcastSender: string, path: string): void {
        if (this._socket.connected) {    //加这个判断是为了确保"MessageType._onClose"能够触发
            const result = BroadcastCloseMessage.create(this, this._messageID++, broadcastSender, path);

            const interval = () => {
                this._send_MessageData(result)
                    .catch(err => this._printError(`向对方发送"BroadcastCloseMessage -> 通知对方现在不再接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));
            }

            const timer = setInterval(interval, this.timeout);    //到了时间如果还没有收到对方响应就重新发送一次

            this._messageListener.receiveOnce([MessageType.broadcast_close_finish, result.messageID] as any, () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType._onClose, MessageType.broadcast_close_finish, result.messageID] as any);
            });

            this._messageListener.receiveOnce([MessageType._onClose, MessageType.broadcast_close_finish, result.messageID] as any, () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType.broadcast_close_finish, result.messageID] as any);
            });

            interval();
        } else {
            this._printError(`向对方发送"BroadcastCloseMessage -> 通知对方现在不再接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, new Error('网络中断'));
        }
    }

    protected _send_BroadcastCloseFinishMessage(msg: BroadcastCloseMessage): void {
        this._send_MessageData(BroadcastCloseFinishMessage.create(this, msg))
            .catch(err => this._printError('向对方发送"BroadcastCloseFinishMessage"失败', err));
    }

    /**
     * 便于使用socket发送消息
     */
    private _send_MessageData(msg: MessageData): Promise<void> {
        const result = msg.pack();
        this._printMessage(true, msg);

        return this._socket.send(result[0], result[1]);
    }

    /**
     * 打印收到或发送的消息
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param msg 要打印的消息
     */
    private _printMessage(sendOrReceive: boolean, msg: MessageData): void {
        if (this.printMessage)
            if (sendOrReceive)
                log
                    .location
                    .location.bold
                    .text.cyan.bold.round
                    .content('remote-invoke', this.moduleName, '发送', msg.toString());
            else
                log
                    .location
                    .location.bold
                    .text.green.bold.round
                    .content('remote-invoke', this.moduleName, '收到', msg.toString());
    }

    /**
     * 打印错误消息
     * @param desc 描述 
     * @param err 错误信息
     */
    protected _printError(desc: string, err: Error): void {
        if (this.printError)
            log.warn
                .location.white
                .title.yellow
                .content.yellow('remote-invoke', desc, err);
    }
}