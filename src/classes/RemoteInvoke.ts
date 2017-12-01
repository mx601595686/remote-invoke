import { EventSpace } from 'eventspace';
import log from 'log-formatter';

import { MessageType } from './../interfaces/MessageType';
import { ConnectionSocket } from "./ConnectionSocket";
import { InvokeReceivingData, ReceivingFile } from '../interfaces/InvokeReceivingData';
import { InvokeSendingData } from '../interfaces/InvokeSendingData';
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

    constructor(socket: typeof ConnectionSocket, moduleName: string) {
        this.moduleName = moduleName;

        this._socket = new socket(this, (header, body) => {
            try {
                const p_header = JSON.parse(header);

                switch (p_header[0]) {
                    case MessageType.invoke_request: {
                        const msg = InvokeRequestMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.path] as any, msg);

                        break;
                    }
                    case MessageType.invoke_response: {
                        const msg = InvokeResponseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_finish: {
                        const msg = InvokeFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.responseMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_failed: {
                        const msg = InvokeFailedMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_request: {
                        const msg = InvokeFileRequestMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_response: {
                        const msg = InvokeFileResponseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_failed: {
                        const msg = InvokeFileFailedMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_finish: {
                        const msg = InvokeFileFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.broadcast: {
                        const msg = BroadcastMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.path] as any, msg);

                        break;
                    }
                    case MessageType.broadcast_open: {
                        const msg = BroadcastOpenMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type] as any, msg);

                        break;
                    }
                    case MessageType.broadcast_open_finish: {
                        const msg = BroadcastOpenFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.messageID] as any, msg);

                        break;
                    }
                    case MessageType.broadcast_close: {
                        const msg = BroadcastCloseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type] as any, msg);

                        break;
                    }
                    case MessageType.broadcast_close_finish: {
                        const msg = BroadcastCloseFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.messageID] as any, msg);

                        break;
                    }
                    default:
                        throw new Error(`未知消息类型：${p_header}`);
                }
            } catch (error) {
                this._printError('接收到的消息格式错误：', error);
            }
        });
    }

    /**
     * 打印错误消息
     * @param desc 描述 
     * @param err 错误信息
     */
    private _printError(desc: string, err: Error) {
        if (this.printError)
            log.warn
                .location.white
                .title.yellow
                .content.yellow('remote-invoke', desc, err);
    }

    /**
     * 准备好下载回调。
     */
    private _prepare_InvokeReceivingData(msg: InvokeRequestMessage | InvokeResponseMessage) {
        const messageID = msg instanceof InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;

        const files = msg.files.map(item => {
            let start: boolean = false;             //是否已经开始获取了，主要是用于防止重复下载
            let index = -1;                         //现在接收到第几个文件片段了
            let downloadedSize = 0;                 //已下载大小
            let timeout: NodeJS.Timer;              //超时计时器

            const downloadNext = () => {            //下载下一个文件片段
                const result = InvokeFileRequestMessage.create(this, msg, item.id, ++index).pack();

                timeout = setTimeout(() => cb_error(new Error('请求超时')), this.timeout);  //设置超时

                this._socket.send(result[0], result[1]).catch(err => cb_error(new Error('网络连接异常：' + err)));
            };

            let cb_error: (err: Error) => void; //下载出错回调
            let cb_receive: (data: Buffer, isEnd: boolean) => void; //接收文件回调

            //监听下载到的文件
            this._messageListener.receive([MessageType.invoke_file_response, msg.sender, messageID, item.id] as any, (data: InvokeFileResponseMessage) => {
                clearTimeout(timeout);

                if (data.index !== index) {
                    cb_error(new Error('文件在传输过程中，顺序发生错乱'));
                    return;
                }

                downloadedSize += data.data.length;
                if (item.size != null && downloadedSize > item.size) {
                    cb_error(new Error('下载到的文件大小超出了发送者所描述的大小'));
                    return;
                }

                cb_receive(data.data, item.splitNumber != null && index + 1 >= item.splitNumber);
            });

            //监听下载文件失败
            this._messageListener.receive([MessageType.invoke_file_failed, msg.sender, messageID, item.id] as any, (data: InvokeFileFailedMessage) => {
                clearTimeout(timeout);
                cb_error(new Error(data.error));
            });

            //监听下载文件结束
            this._messageListener.receive([MessageType.invoke_file_finish, msg.sender, messageID, item.id] as any, (data: InvokeFileFinishMessage) => {
                clearTimeout(timeout);
                cb_receive(Buffer.alloc(0), true);
            });

            const result: ReceivingFile = {
                size: item.size,
                splitNumber: item.splitNumber,
                name: item.name,
                onData: (callback, startIndex = 0) => {
                    if (start)
                        (<any>callback)(new Error('不可重复下载文件'));
                    else {
                        start = true;
                        index = startIndex - 1;

                        cb_error = callback as any;
                        cb_receive = (data, isEnd) => {
                            callback(undefined, isEnd, index, data).then(result => result !== true && downloadNext());
                        };

                        downloadNext();
                    }
                },
                getFile: () => new Promise<Buffer>((resolve, reject) => {   //下载文件回调
                    if (start) {
                        reject(new Error('不可重复下载文件'));
                    } else {
                        start = true;
                        const filePieces: Buffer[] = [];    //下载到的文件片段

                        cb_error = reject;
                        cb_receive = (data, isEnd) => {
                            filePieces.push(data);
                            isEnd ? resolve(Buffer.concat(filePieces)) : downloadNext();
                        };

                        downloadNext();
                    }
                })
            }

            return result;
        });

        return {
            data: { data: msg.data, files },
            clear: () => { //清理资源
                this._messageListener.trigger([MessageType.invoke_file_failed, msg.sender, messageID] as any, { error: '下载终止' });

                this._messageListener.cancel([MessageType.invoke_file_response, msg.sender, messageID] as any);
                this._messageListener.cancel([MessageType.invoke_file_failed, msg.sender, messageID] as any);
                this._messageListener.cancel([MessageType.invoke_file_finish, msg.sender, messageID] as any);
            }
        };
    }

    /**
     * 准备发送数据
     */
    private _prepare_InvokeSendingData(msg: InvokeRequestMessage | InvokeResponseMessage) {
        return new Promise<void>((resolve, reject) => {
            const result = msg.pack();
            this._socket.send(result[0], result[1]);

            if (msg.files.length === 0)  //不带文件
      
        });
    }

    /**
     * 对外导出方法。     
     * 如果要向调用方反馈错误，直接 throw new Error() 即可
     * 
     * 注意：如果重复在同一path上导出，则后面的会覆盖掉前面的。    
     * 注意：方法一旦执行结束，相关的下载任务就会被立即取消。     
     * @param path 所导出的路径
     * @param func 导出的方法 
     */
    export<F extends (data: InvokeReceivingData) => Promise<void | InvokeSendingData>>(path: string, func: F): F {
        this.cancelExport(path);

        this._messageListener.receive([MessageType.invoke_request, path] as any, async (msg: InvokeRequestMessage) => {
            const { data, clear } = this._prepare_InvokeReceivingData(msg);

            try {
                const result = await func(data) || { data: null };
                const rm = InvokeResponseMessage.create(this, msg, this._messageID++, result);
                this._prepare_InvokeSendingData(rm).catch(err => {/* this._printError('发送InvokeResponseMessage失败', err) */ });
            } catch (error) {
                const result = InvokeFailedMessage.create(this, msg, error).pack();
                this._socket.send(result[0], result[1]).catch(err => {/* this._printError('发送InvokeFailedMessage失败', err) */ });
            } finally {
                clear();
            }
        });

        return func;
    }

    /**
     * 取消对外导出的方法
     * @param path 之前导出的路径
     */
    cancelExport(path: string) {
        this._messageListener.cancel([MessageType.invoke_request, path] as any);
    }

    /**
     * 注册广播监听器      
     * 
     * 注意：如果重复在同一path上注册，则后面的会覆盖掉前面的。    
     * @param sender 发送者
     * @param name 广播的路径
     * @param func 对应的回调方法
     */
    receive<F extends (arg: any) => void>(sender: string, path: string, func: F): F {
        this.cancelReceive(sender, path);

        this._messageListener.receive([MessageType.broadcast, sender, path] as any, (data: BroadcastMessage) => {

        });

        return func;
    }

    /**
     * 删除广播监听器    
     * @param sender 发送者
     * @param name 广播的路径
     */
    cancelReceive(sender: string, path: string) {
        this._messageListener.cancel([MessageType.broadcast, sender, path] as any);
    }
}