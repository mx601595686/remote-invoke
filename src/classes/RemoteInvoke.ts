import { EventSpace } from 'eventspace';
import log from 'log-formatter';

import { MessageType } from './../interfaces/MessageType';
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { ExportFunction, ExportFunctionFileArgument } from "../interfaces/ExportFunction";
import {
    parseMessageData,
    MessageData,
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
    BroadcastCloseFinishMessage
} from './MessageData';

export class RemoteInvoke {

    private readonly _socket: ConnectionSocket;   //连接端口

    private readonly _messageListener = new EventSpace();   //注册的各类消息监听器    

    /**
     * 自增消息索引编号（内部使用）
     */
    _messageID: number = 0;

    /**
     * 请求响应超时，默认3分钟
     */
    readonly timeout: number = 3 * 60 * 1000;

    /**
     * 默认文件片段大小 512kb
     */
    readonly filePieceSize = 512 * 1024;

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

    constructor(socket: ConnectionSocket, moduleName: string) {
        this.moduleName = moduleName;

        if (socket.onMessage !== undefined)
            throw new Error('传入的ConnectionSocket正在被其他的代码所使用');

        this._socket = socket;
        this._socket.onMessage = (header, body) => {
            try {
                var msg = parseMessageData(this, header, body);
            } catch (error) {
                this._printError('接收到消息格式错误：', error);
                return;
            }

            switch (msg.type) {
                case MessageType.invoke_request:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<InvokeRequestMessage>msg).path    //调用地址
                    ], msg);
                    break;

                case MessageType.invoke_response:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<InvokeResponseMessage>msg).requestMessageID,
                        (<InvokeResponseMessage>msg).sender //这里多加一个sender是为了防冒充
                    ], msg);
                    break;

                case MessageType.invoke_finish:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<InvokeFinishMessage>msg).responseMessageID,
                        (<InvokeFinishMessage>msg).sender
                    ], msg);
                    break;

                case MessageType.invoke_failed:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<InvokeFailedMessage>msg).requestMessageID,
                        (<InvokeFailedMessage>msg).sender
                    ], msg);
                    break;

                case MessageType.invoke_file_request:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<InvokeFileRequestMessage>msg).messageID,
                        (<InvokeFileRequestMessage>msg).sender,
                        (<InvokeFileRequestMessage>msg).id
                    ], msg);
                    break;

                case MessageType.invoke_file_response:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<InvokeFileResponseMessage>msg).messageID,
                        (<InvokeFileResponseMessage>msg).sender,
                        (<InvokeFileResponseMessage>msg).id
                    ], msg);
                    break;

                case MessageType.invoke_file_failed:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<InvokeFileFailedMessage>msg).messageID,
                        (<InvokeFileFailedMessage>msg).sender,
                        (<InvokeFileFailedMessage>msg).id
                    ], msg);
                    break;

                case MessageType.invoke_file_finish:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<InvokeFileFinishMessage>msg).messageID,
                        (<InvokeFileFinishMessage>msg).sender,
                        (<InvokeFileFinishMessage>msg).id
                    ], msg);
                    break;

                case MessageType.broadcast:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<BroadcastMessage>msg).sender,
                        (<BroadcastMessage>msg).path
                    ], msg);
                    break;

                case MessageType.broadcast_open:
                    this._messageListener.trigger([
                        msg.type as any
                    ], msg);
                    break;

                case MessageType.broadcast_open_finish:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<BroadcastOpenFinishMessage>msg).messageID
                    ], msg);
                    break;

                case MessageType.broadcast_close:
                    this._messageListener.trigger([
                        msg.type as any
                    ], msg);
                    break;

                case MessageType.broadcast_close_finish:
                    this._messageListener.trigger([
                        msg.type as any,
                        (<BroadcastCloseFinishMessage>msg).messageID
                    ], msg);
                    break;
            }
        };
    }

    /**
     * 打印错误消息
     * @param desc 描述 
     * @param err 错误信息
     */
    private _printError(desc: string, err: Error) {
        if (this.printError)
            log.error
                .location.white
                .title.red
                .content.red('remote-invoke', desc, err);
    }

    /**
     * 对外导出方法。注意：如果重复在同一path上导出，则后面的会覆盖掉前面的。    
     * @param path 所导出的路径
     * @param func 导出的方法 
     */
    export<F extends ExportFunction>(path: string, func: F) {
        this._messageListener.receive([MessageType.invoke_request as any, path], async (msg: InvokeRequestMessage) => {
            try {
                var files = msg.files.map(item => {
                    let start: boolean = false;  //是否已经开始获取了，主要是用于防止重复注册回调函数

                    const fileArg: ExportFunctionFileArgument = {
                        size: item.size,
                        splitNumber: item.splitNumber,
                        name: item.name,
                        onData: (cb, startIndex) => {
                            start = true;
                        },
                        getFile: () => new Promise<Buffer>((resolve, reject) => {   //下载文件回调
                            if (start) reject(new Error('不可重复下载文件')); else start = true;

                            let index = 0;  //现在接收到第几个文件片段了
                            let downloadedSize = 0;  //下载到的大小
                            const filePieces: Buffer[] = [];    //下载到的文件片段

                            this._messageListener.receive([
                                MessageType.invoke_file_response as any,
                                msg.requestMessageID as any,
                                msg.sender,
                                item.id as any
                            ], (data: InvokeFileResponseMessage) => {
                                if (data.index !== index)
                                    reject('下载文件在传输过程中顺序发生错乱');

                                filePieces.push(data.data);
                                downloadedSize += data.data.length;

                                if (item.size !== 0 && downloadedSize > item.size)
                                    reject(new Error('下载到的真实文件大小超出了描述的大小'));

                                if (item.splitNumber !== 0) {
                                    if (index < item.splitNumber) {
                                        const ifr = InvokeFileRequestMessage.create(this, msg, item.id, ++index);
                                        const [header, body] = ifr.pack();
                                        this._socket.send(header, body);
                                    } else {
                                        resolve(Buffer.concat(filePieces));
                                        this._messageListener.cancel([
                                            MessageType.invoke_file_response as any,
                                            msg.requestMessageID as any,
                                            msg.sender,
                                            item.id as any
                                        ]);
                                    }
                                } else {
                                    const ifr = InvokeFileRequestMessage.create(this, msg, item.id, ++index);
                                    const [header, body] = ifr.pack();
                                    this._socket.send(header, body);
                                }
                            });
                        })
                    }

                    return fileArg;
                });
            } catch (err) {
                this._printError('接收到消息格式错误：解析消息文件异常', err);
                return;
            }

            const result = await func(msg.data, files);
        });

        return func;
    }

    /**
     * 取消对外导出的方法
     * @param path 之前导出的路径
     */
    cancelExport(path: string) {
        this._messageListener.cancel([MessageType.invoke_request as any, path]);
    }
}