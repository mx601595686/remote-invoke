import { EventSpace } from 'eventspace';
import log from 'log-formatter';

import { MessageType } from '../interfaces/MessageType';
import { ConnectionSocket } from "./ConnectionSocket";
import { InvokeReceivingData, ReceivingFile } from '../interfaces/InvokeReceivingData';
import { InvokeSendingData, SendingFile } from '../interfaces/InvokeSendingData';
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

    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket: typeof ConnectionSocket, moduleName: string) {
        this.moduleName = moduleName;

        this._socket = new socket(this, (header, body) => {
            try {
                const p_header = JSON.parse(header);

                switch (p_header[0]) {
                    case MessageType.invoke_request: {  //被调用者收到调用请求
                        const msg = InvokeRequestMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.path] as any, msg);

                        break;
                    }
                    case MessageType.invoke_response: { //调用者收到调用响应
                        const msg = InvokeResponseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_finish: {   //被调用者收到调用结束响应
                        const msg = InvokeFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.responseMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_failed: {   //调用者收到调用失败响应
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
                        this._messageListener.triggerAncestors([msg.type, msg.sender, ...msg.path.split('.')] as any, msg, true, true);

                        break;
                    }
                    case MessageType.broadcast_open: {
                        const msg = BroadcastOpenMessage.parse(this, p_header, body);

                        //仅仅是作为一个标记,表示对方正在对某条路径的广播展开监听
                        this._messageListener.receive([MessageType.broadcast_open, ...msg.path.split('.')] as any, true as any);

                        const result = BroadcastOpenFinishMessage.create(this, msg).pack();

                        this._socket.send(result[0], result[1])
                            .catch(err => this._printError('响应对方的broadcast_open请求失败', err));

                        break;
                    }
                    case MessageType.broadcast_open_finish: {
                        const msg = BroadcastOpenFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.messageID] as any, msg);

                        break;
                    }
                    case MessageType.broadcast_close: {
                        const msg = BroadcastCloseMessage.parse(this, p_header, body);

                        this._messageListener.cancel([MessageType.broadcast_open, ...msg.path.split('.')] as any);  //清除标记

                        const result = BroadcastCloseFinishMessage.create(this, msg).pack();

                        this._socket.send(result[0], result[1])
                            .catch(err => this._printError('响应对方的broadcast_close请求失败', err));

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

                this._socket.send(result[0], result[1])
                    .catch(err => { clearTimeout(timeout); cb_error(new Error('网络连接异常：' + err)); });
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
                    if (start) {
                        (<any>callback)(new Error('不可重复下载文件'));
                    } else {
                        start = true;
                        index = startIndex - 1;

                        cb_error = err => { (<any>callback)(err); cb_error = () => { } };   //确保只触发一次
                        cb_receive = (data, isEnd) => {
                            if (isEnd)
                                callback(undefined, isEnd, index, data);
                            else
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
                this._messageListener.triggerDescendants([MessageType.invoke_file_failed, msg.sender, messageID] as any, { error: '下载终止' });

                this._messageListener.cancelDescendants([MessageType.invoke_file_response, msg.sender, messageID] as any);
                this._messageListener.cancelDescendants([MessageType.invoke_file_failed, msg.sender, messageID] as any);
                this._messageListener.cancelDescendants([MessageType.invoke_file_finish, msg.sender, messageID] as any);
            }
        };
    }

    /**
     * 准备发送文件
     * @param msg 要发送的数据
     * @param onRequest 对方请求时的回调
     */
    private _prepare_InvokeSendingData(msg: InvokeRequestMessage | InvokeResponseMessage, onRequest: () => void) {
        const messageID = msg instanceof InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;

        msg.files.forEach(item => {
            let sendingData = item._data as SendingFile;
            let index = 0;    //记录用户请求到了第几个文件片段了

            this._messageListener.receive([MessageType.invoke_file_request, msg.receiver, messageID, item.id] as any, (data: InvokeFileRequestMessage) => {
                onRequest();

                if (data.index < index) {
                    index = data.index;

                }

                if (Buffer.isBuffer(sendingData.file)) {
                    if (index < (item.splitNumber as number)) {

                    }
                } else {

                }
                const result = InvokeFileFinishMessage.create(this, data, ).pack();

                this._socket.send(result[0], result[1])
                    .catch(err => this._printError('向对方发送文件失败', err));
                const result = InvokeFileResponseMessage.create(this, data, ).pack();

                this._socket.send(result[0], result[1])
                    .catch(err => this._printError('向对方发送文件失败', err));
            });
        });


        return new Promise<void>((resolve, reject) => {
            let timeout = setTimeout(() => reject('响应超时'), this.timeout);

            const result = msg.pack();
            this._socket.send(result[0], result[1]).catch(err => { clearTimeout(timeout); reject(err); });



            if (msg.files.length === 0)  //不带文件
      
        });
    }

    /**
     * 对外导出方法。     
     * 如果要向调用方反馈错误，直接 throw new Error() 即可。     
     * 注意：对于导出方法，当它执行完后就不可以再继续下载文件了。     
     * 注意：一个path上只允许导出一个方法。如果重复导出则后面的应该覆盖掉前面的。     
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
                this._prepare_InvokeSendingData(rm).catch(err => this._printError('发送调用响应失败', err));
            } catch (error) {
                const result = InvokeFailedMessage.create(this, msg, error).pack();
                this._socket.send(result[0], result[1]).catch(err => this._printError('发送调用失败响应失败', err));
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
     * 调用远端模块导出的方法。直接返回被调用者返回的数据与文件
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     */
    invoke(receiver: string, path: string, data: InvokeSendingData): Promise<{ data: any, files: { name: string, data: Buffer }[] }>
    /**
     * 调用远端模块导出的方法。
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     * @param callback 接收响应数据的回调。注意：一旦回调执行完成就不能再下载文件了。
     */
    invoke(receiver: string, path: string, data: InvokeSendingData, callback: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): void
    invoke(receiver: string, path: string, data: InvokeSendingData, callback?: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): any {
        const rm = InvokeRequestMessage.create(this, this._messageID++, receiver, path, data);
        const sr = this._prepare_InvokeSendingData(rm);

        if (callback) {   //回调函数版本
            sr.catch(callback as any);

        } else {
            return new Promise((resolve, reject) => {
                sr.catch(reject);

            });
        }
    }

    /**
     * 注册广播监听器      
     * @param sender 发送者
     * @param name 广播的路径
     * @param func 对应的回调方法
     */
    receive<F extends (arg: any) => any>(sender: string, path: string, func: F): F {
        const eventName = [MessageType.broadcast, sender, ...path.split('.')] as any;

        if (!this._messageListener.has(eventName)) {  //如果还没注册过，通知对方现在要接收指定路径广播
            const messageID = this._messageID++;

            const result = BroadcastOpenMessage.create(this, messageID, sender, path).pack();

            const interval = () => this._socket.send(result[0], result[1])  //发送通知消息
                .catch(err => this._printError(`通知对方现在要接收指定路径的广播失败。broadcastSender:${sender} path:${path}`, err));

            const timer = setInterval(interval, this.timeout);    //到了时间如果还没有收到对方响应就重新发送一次

            this._messageListener.receiveOnce([MessageType.broadcast_open_finish, messageID] as any, () => clearInterval(timer));

            interval();
        }

        this._messageListener.receive(eventName, (data: BroadcastMessage) => func(data.data));
        return func;
    }

    /**
     * 删除指定路径上的所有广播监听器，可以传递一个listener来只删除一个特定的监听器
     * @param sender 发送者
     * @param name 广播的路径
     * @param listener 要指定删除的监听器
     */
    cancelReceive(sender: string, path: string, listener?: (arg: any) => any) {
        const eventName = [MessageType.broadcast, sender, ...path.split('.')] as any;

        if (this._messageListener.has(eventName)) {  //确保真的有注册过再执行删除
            this._messageListener.cancel(eventName, listener);

            if (!this._messageListener.has(eventName)) {    //如果删光了，就通知对方不再接收了
                const messageID = this._messageID++;

                const result = BroadcastCloseMessage.create(this, messageID, sender, path).pack();

                const interval = () => this._socket.send(result[0], result[1])  //发送通知消息
                    .catch(err => this._printError(`通知对方现在不再接收指定路径的广播失败。broadcastSender:${sender} path:${path}`, err));

                const timer = setInterval(interval, this.timeout);    //到了时间如果还没有收到对方响应就重新发送一次

                this._messageListener.receiveOnce([MessageType.broadcast_close_finish, messageID] as any, () => clearInterval(timer));

                interval();
            }
        }
    }

    /**
     * 对外广播数据
     * @param path 广播的路径
     * @param data 要发送的数据
     */
    async broadcast(path: string, data: any = null): Promise<void> {
        //判断对方是否注册的有关于这条广播的监听器
        if (this._messageListener.hasAncestors([MessageType.broadcast_open, ...path.split('.')] as any)) {
            const result = BroadcastMessage.create(this, path, data).pack();
            await this._socket.send(result[0], result[1]);
        }
    }
}