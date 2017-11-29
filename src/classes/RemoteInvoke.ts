import { EventSpace } from 'eventspace';
import log from 'log-formatter';

import { MessageType } from './../interfaces/MessageType';
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { InvokeReceivingData } from '../interfaces/InvokeReceivingData';
import { InvokeSendingData } from '../interfaces/InvokeSendingData';
import {
    Message,
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

    private _messageID: number = 0; //自增消息索引编号

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
        this._socket = socket;

        if (socket.onMessage !== undefined)
            throw new Error('传入的ConnectionSocket的onMessage已经被占用');

        this._socket.onMessage = (header, body) => {
            try {
                const p_header = JSON.parse(header);

                switch (p_header[0]) {
                    case MessageType.invoke_request: {
                        const msg = InvokeRequestMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.path], msg);

                        break;
                    }
                    case MessageType.invoke_response: {
                        const msg = InvokeResponseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.sender, msg.requestMessageID], msg);

                        break;
                    }
                    case MessageType.invoke_finish: {
                        const msg = InvokeFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.sender, msg.responseMessageID], msg);

                        break;
                    }
                    case MessageType.invoke_failed: {
                        const msg = InvokeFailedMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.sender, msg.requestMessageID], msg);

                        break;
                    }
                    case MessageType.invoke_file_request: {
                        const msg = InvokeFileRequestMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.sender, msg.messageID, msg.id], msg);

                        break;
                    }
                    case MessageType.invoke_file_response: {
                        const msg = InvokeFileResponseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.sender, msg.messageID, msg.id], msg);

                        break;
                    }
                    case MessageType.invoke_file_failed: {
                        const msg = InvokeFileFailedMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.sender, msg.messageID, msg.id], msg);

                        break;
                    }
                    case MessageType.invoke_file_finish: {
                        const msg = InvokeFileFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.sender, msg.messageID, msg.id], msg);

                        break;
                    }
                    case MessageType.broadcast: {
                        const msg = BroadcastMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.sender, msg.path], msg);

                        break;
                    }
                    case MessageType.broadcast_open: {
                        const msg = BroadcastOpenMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any], msg);

                        break;
                    }
                    case MessageType.broadcast_open_finish: {
                        const msg = BroadcastOpenFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.messageID], msg);

                        break;
                    }
                    case MessageType.broadcast_close: {
                        const msg = BroadcastCloseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any], msg);

                        break;
                    }
                    case MessageType.broadcast_close_finish: {
                        const msg = BroadcastCloseFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type as any, msg.messageID], msg);

                        break;
                    }
                    default:
                        throw new Error(`未知消息类型：${p_header}`);
                }
            } catch (error) {
                this._printError('接收到消息格式错误：', error);
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
     * 对外导出方法。     
     * 注意：如果重复在同一path上导出，则后面的会覆盖掉前面的。    
     * 注意：方法一旦执行结束（返回了promise）那么就不能再获取客户端发来的文件了。     
     * @param path 所导出的路径
     * @param func 导出的方法 
     */
    export<F extends (data: InvokeReceivingData) => Promise<void | InvokeSendingData>>(path: string, func: F) {
        this.cancelExport(path);

        this._messageListener.receive([MessageType.invoke_request as any, path], async (msg: InvokeRequestMessage) => {
            try {
                var files = msg.files.map(item => {
                    let start: boolean = false;  //是否已经开始获取了，主要是用于防止重复注册回调函数

                    const fileArg: InvokeReceivingData['files'] = {
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