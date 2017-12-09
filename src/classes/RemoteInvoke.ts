import { EventSpace } from 'eventspace';
import { EventLevel } from 'eventspace/bin/classes/EventLevel';
import log from 'log-formatter';

import { MessageType } from '../interfaces/MessageType';
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
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
    BroadcastCloseFinishMessage,
    MessageData
} from './MessageData';

export class RemoteInvoke {

    private readonly _messageListener = new EventSpace();   //注册的各类消息监听器    

    private _messageID: number = 0; //自增消息索引编号

    /**
     * 连接端口
     */
    readonly socket: ConnectionSocket;

    /**
     * 请求响应超时，默认3分钟
     */
    readonly timeout: number = 3 * 60 * 1000;

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
        this.socket = socket;

        if (this.socket.ri != null)
            throw new Error('传入的ConnectionSocket已在其他地方被使用');

        this.socket.ri = this;

        this.socket.onMessage = (header: string, body: Buffer) => {
            try {
                const p_header = JSON.parse(header);

                switch (p_header[0]) {
                    case MessageType.invoke_request: {  //被调用者收到调用请求
                        const msg = InvokeRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        const eventName = [msg.type, msg.path] as any;

                        if (this._messageListener.has(eventName))
                            this._messageListener.trigger([msg.type, msg.path] as any, msg);
                        else
                            this._sendMessage(InvokeFailedMessage.create(this, msg, new Error("调用的方法不存在")))
                                .catch(err => this._printError('响应对方"调用的方法不存在"失败', err));

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

                        if (!this._messageListener.hasAncestors(eventName)) {   //如果没有注册过这个广播的监听器，就通知对方不要再发送了
                            this._send_BroadcastCloseMessage(msg.sender, msg.path);
                        } else {
                            this._messageListener.triggerAncestors(eventName, msg.data, true, true);
                        }

                        break;
                    }
                    case MessageType.broadcast_open: {
                        const msg = BroadcastOpenMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.receive([MessageType._broadcast_white_list, ...msg.path.split('.')] as any, msg.path as any);

                        this._sendMessage(BroadcastOpenFinishMessage.create(this, msg))
                            .catch(err => this._printError('响应对方的broadcast_open请求失败', err));

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

                        this._sendMessage(BroadcastCloseFinishMessage.create(this, msg))
                            .catch(err => this._printError('响应对方的broadcast_close请求失败', err));

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

        this.socket.onOpen = () => this._messageListener.triggerDescendants([MessageType._onOpen] as any);

        this.socket.onClose = () => this._messageListener.triggerDescendants([MessageType._onClose] as any);

        //当打开端口之后立刻通知对方要监听哪些广播
        this._messageListener.receive([MessageType._onOpen, '_send_broadcast_open'] as any, () => {
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

        //当连接断开立刻清理对方注册过的广播路径
        this._messageListener.receive([MessageType._onClose, '_clean_opened_broadcast'] as any, () => {
            this._messageListener.cancelDescendants([MessageType._broadcast_white_list] as any);
        });
    }

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
        this._messageListener.receive([MessageType.invoke_request, path] as any, async (msg: InvokeRequestMessage) => {
            const { data, clean } = this._prepare_InvokeReceivingData(msg);

            try {
                const result = await func(data) || { data: null };
                const rm = InvokeResponseMessage.create(this, msg, this._messageID++, result);

                try {
                    if (rm.files.length === 0) {
                        const clean = await this._prepare_InvokeSendingData(rm);
                        clean();
                    } else {
                        const clean = await this._prepare_InvokeSendingData(rm, () => {
                            this._messageListener.cancel([MessageType.invoke_finish, rm.receiver, rm.responseMessageID] as any);
                        });

                        this._messageListener.receiveOnce([MessageType.invoke_finish, rm.receiver, rm.responseMessageID] as any, clean);
                    }
                } catch (error) {
                    this._printError('发送"调用响应"失败', error);
                }
            } catch (error) {
                this._sendMessage(InvokeFailedMessage.create(this, msg, error))
                    .catch(err => this._printError('发送"调用失败响应"失败', err));
            } finally {
                clean();
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
     * 调用远端模块导出的方法。直接返回数据与文件
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     */
    invoke(receiver: string, path: string, data?: InvokeSendingData | undefined): Promise<{ data: any, files: { name: string, data: Buffer }[] }>
    /**
     * 调用远端模块导出的方法。
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     * @param callback 接收响应数据的回调。注意：一旦回调执行完成就不能再下载文件了。
     */
    invoke(receiver: string, path: string, data: InvokeSendingData | undefined, callback: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): void
    invoke(receiver: string, path: string, data: InvokeSendingData = { data: null }, callback?: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): any {
        const rm = InvokeRequestMessage.create(this, this._messageID++, receiver, path, data);
        const cleanMessageListener = () => {   //清理注册的消息监听器
            this._messageListener.cancel([MessageType.invoke_response, rm.receiver, rm.requestMessageID] as any);
            this._messageListener.cancel([MessageType.invoke_failed, rm.receiver, rm.requestMessageID] as any);
        };
        const sendInvokeFinish = (msg: InvokeResponseMessage) => {  //响应被调用者，调用结束
            if (msg.files.length > 0)
                this._sendMessage(InvokeFinishMessage.create(this, msg));
        }

        if (callback) {   //回调函数版本
            this._prepare_InvokeSendingData(rm, () => {
                cleanMessageListener();
                (callback as any)(new Error('请求超时'));
            }).then(cleanSendRequest => {
                this._messageListener.receiveOnce([MessageType.invoke_response, rm.receiver, rm.requestMessageID] as any, (msg: InvokeResponseMessage) => {
                    cleanSendRequest();
                    cleanMessageListener();

                    const { data, clean } = this._prepare_InvokeReceivingData(msg);

                    callback(undefined, data).then(() => {
                        clean();
                        sendInvokeFinish(msg);
                    }).catch(err => {
                        clean();
                        sendInvokeFinish(msg);
                        throw err;
                    });
                });

                this._messageListener.receiveOnce([MessageType.invoke_failed, rm.receiver, rm.requestMessageID] as any, (msg: InvokeFailedMessage) => {
                    cleanSendRequest();
                    cleanMessageListener();

                    (callback as any)(new Error(msg.error));
                });
            }).catch(callback as any);
        } else {
            return new Promise((resolve, reject) => {
                this._prepare_InvokeSendingData(rm, () => {
                    cleanMessageListener();
                    reject(new Error('请求超时'));
                }).then(cleanSendRequest => {
                    this._messageListener.receiveOnce([MessageType.invoke_response, rm.receiver, rm.requestMessageID] as any, async (msg: InvokeResponseMessage) => {
                        cleanSendRequest();
                        cleanMessageListener();

                        const { data, clean } = this._prepare_InvokeReceivingData(msg);

                        try {
                            const result: { name: string, data: Buffer }[] = [];

                            for (const item of data.files) {
                                result.push({ name: item.name, data: await item.getFile() });
                            }

                            resolve({ data: data.data, files: result });
                        } catch (error) {
                            reject(error);
                        } finally {
                            clean();
                            sendInvokeFinish(msg);
                        }
                    });

                    this._messageListener.receiveOnce([MessageType.invoke_failed, rm.receiver, rm.requestMessageID] as any, (msg: InvokeFailedMessage) => {
                        cleanSendRequest();
                        cleanMessageListener();

                        reject(new Error(msg.error));
                    });
                }).catch(reject);
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
            this._send_BroadcastOpenMessage(sender, path);
        }

        this._messageListener.receive(eventName, func); //不包装一下监听器，是为了考虑到cancelReceive
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
                this._send_BroadcastCloseMessage(sender, path);
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
        if (this._messageListener.hasAncestors([MessageType._broadcast_white_list, ...path.split('.')] as any)) {
            await this._sendMessage(BroadcastMessage.create(this, path, data));
        }
    }

    /**
     * 便于使用socket发送消息
     */
    private _sendMessage(msg: MessageData) {
        const result = msg.pack();
        this._printMessage(true, msg);

        return this.socket.send(result[0], result[1]);
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
     * 打印收到或发送的消息
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param msg 要打印的消息
     */
    private _printMessage(sendOrReceive: boolean, msg: MessageData) {
        if (this.printMessage)
            if (sendOrReceive)
                log
                    .location
                    .location.cyan.bold
                    .content('remote-invoke', '发送', msg.toString());
            else
                log
                    .location
                    .location.green.bold
                    .content('remote-invoke', '收到', msg.toString());
    }

    /**
     * 准备好下载回调。返回InvokeReceivingData与清理资源回调
     */
    private _prepare_InvokeReceivingData(msg: InvokeRequestMessage | InvokeResponseMessage) {
        const messageID = msg instanceof InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;

        const files = msg.files.map(item => {
            let start: boolean = false;             //是否已经开始获取了，主要是用于防止重复下载
            let index = -1;                         //现在接收到第几个文件片段了
            let downloadedSize = 0;                 //已下载大小
            let timer: NodeJS.Timer;                //超时计时器

            const downloadNext = () => {            //下载下一个文件片段
                timer = setTimeout(() => cb_error(new Error('请求超时')), this.timeout);  //设置超时

                this._sendMessage(InvokeFileRequestMessage.create(this, msg, item.id, ++index))
                    .catch(err => { clearTimeout(timer); cb_error(new Error('网络连接异常：' + err)); });
            };

            let cb_error: (err: Error) => void; //下载出错回调
            let cb_receive: (data: Buffer, isEnd: boolean) => void; //接收文件回调

            //监听下载到的文件
            this._messageListener.receive([MessageType.invoke_file_response, msg.sender, messageID, item.id] as any, (msg: InvokeFileResponseMessage) => {
                clearTimeout(timer);

                if (msg.index !== index) {
                    cb_error(new Error('文件在传输过程中，顺序发生错乱'));
                    return;
                }

                downloadedSize += msg.data.length;
                if (item.size != null && downloadedSize > item.size) {
                    cb_error(new Error('下载到的文件大小超出了发送者所描述的大小'));
                    return;
                }

                cb_receive(msg.data, item.splitNumber != null && index + 1 >= item.splitNumber);
            });

            //监听下载文件失败
            this._messageListener.receive([MessageType.invoke_file_failed, msg.sender, messageID, item.id] as any, (msg: InvokeFileFailedMessage) => {
                clearTimeout(timer);
                cb_error(new Error(msg.error));
            });

            //监听下载文件结束
            this._messageListener.receive([MessageType.invoke_file_finish, msg.sender, messageID, item.id] as any, (msg: InvokeFileFinishMessage) => {
                clearTimeout(timer);
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

                        cb_error = err => {    //确保发生错误后就不允许触发其他操作了
                            (<any>callback)(err);
                            cb_receive = cb_error = () => { };
                        };
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
            clean: () => { //清理资源
                this._messageListener.triggerDescendants([MessageType.invoke_file_failed, msg.sender, messageID] as any, { error: '下载终止' });

                this._messageListener.cancelDescendants([MessageType.invoke_file_response, msg.sender, messageID] as any);
                this._messageListener.cancelDescendants([MessageType.invoke_file_failed, msg.sender, messageID] as any);
                this._messageListener.cancelDescendants([MessageType.invoke_file_finish, msg.sender, messageID] as any);
            }
        };
    }

    /**
     * 准备发送文件，返回清理资源回调。如果超时或发送错误会自动清理资源
     * @param msg 要发送的数据
     * @param onTimeout 没有文件请求超时
     */
    private async _prepare_InvokeSendingData(msg: InvokeRequestMessage | InvokeResponseMessage, onTimeout?: () => void) {
        const messageID = msg instanceof InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;
        const timeout = () => { clean(); onTimeout && onTimeout(); };
        const clean = () => {  //清理资源回调
            clearTimeout(timer);
            if (msg.files.length > 0)
                this._messageListener.cancelDescendants([MessageType.invoke_file_request, msg.receiver, messageID] as any);
        }

        let timer = setTimeout(timeout, this.timeout);    //超时计时器

        try {
            await this._sendMessage(msg);
        } catch (error) {
            clean(); throw error;
        }

        if (msg.files.length > 0) { //准备文件发送
            msg.files.forEach(item => {
                let sendingData = item._data as SendingFile;
                let index = -1;    //记录用户请求到了第几个文件片段了

                const send_error = (msg: InvokeFileRequestMessage, err: Error) => {
                    sendingData.onProgress && sendingData.onProgress(err, undefined as any);

                    this._sendMessage(InvokeFileFailedMessage.create(this, msg, err))
                        .catch(err => this._printError('向对方发送"请求文件片段失败响应"失败', err));

                    //不允许再下载该文件了
                    this._messageListener.cancel([MessageType.invoke_file_request, msg.receiver, messageID, item.id] as any);
                }

                const send_finish = (msg: InvokeFileRequestMessage) => {
                    this._sendMessage(InvokeFileFinishMessage.create(this, msg))
                        .catch(err => this._printError('向对方发送"请求文件片段结束响应"失败', err));

                    //不允许再下载该文件了
                    this._messageListener.cancel([MessageType.invoke_file_request, msg.receiver, messageID, item.id] as any);
                };

                this._messageListener.receive([MessageType.invoke_file_request, msg.receiver, messageID, item.id] as any, (msg: InvokeFileRequestMessage) => {
                    clearTimeout(timer);
                    timer = setTimeout(timeout, this.timeout);

                    if (msg.index > index) {
                        index = msg.index;
                    } else {
                        send_error(msg, new Error('重复下载文件片段'));
                        return;
                    }

                    if (Buffer.isBuffer(sendingData.file)) {
                        if (index < (item.splitNumber as number)) {
                            sendingData.onProgress && sendingData.onProgress(undefined, (index + 1) / (item.splitNumber as number));

                            const result = InvokeFileResponseMessage
                                .create(this, msg, sendingData.file.slice(index * this.filePieceSize, (index + 1) * this.filePieceSize));

                            this._sendMessage(result).catch(err => send_error(msg, err));
                        } else {
                            send_finish(msg);
                        }
                    } else {
                        sendingData.file(index).then(data => {
                            if (Buffer.isBuffer(data)) {
                                this._sendMessage(InvokeFileResponseMessage.create(this, msg, data)).catch(err => send_error(msg, err));
                            } else {
                                send_finish(msg);
                            }
                        }).catch(err => {
                            send_error(msg, err);
                        });
                    }
                });
            });
        }

        return clean;
    }

    /**
      * 发送BroadcastOpenMessage
      * @param broadcastSender 广播的发送者
      * @param path 广播路径
      */
    private _send_BroadcastOpenMessage(broadcastSender: string, path: string) {
        if (this.socket.connected) {
            const messageID = this._messageID++;

            const result = BroadcastOpenMessage.create(this, messageID, broadcastSender, path);

            const interval = () => this._sendMessage(result)
                .catch(err => this._printError(`通知对方"现在要接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));

            const timer = setInterval(interval, this.timeout);    //到了时间如果还没有收到对方响应就重新发送一次

            this._messageListener.receiveOnce([MessageType.broadcast_open_finish, messageID] as any, () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType._onClose, MessageType.broadcast_open_finish, messageID] as any);
            });

            this._messageListener.receiveOnce([MessageType._onClose, MessageType.broadcast_open_finish, messageID] as any, () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType.broadcast_open_finish, messageID] as any);
            });

            interval();
        }
    }

    /**
     * 发送BroadcastCloseMessage
     * @param broadcastSender 广播的发送者
     * @param path 广播路径
     */
    private _send_BroadcastCloseMessage(broadcastSender: string, path: string) {
        if (this.socket.connected) {
            const messageID = this._messageID++;

            const result = BroadcastCloseMessage.create(this, messageID, broadcastSender, path);

            const interval = () => this._sendMessage(result)
                .catch(err => this._printError(`通知对方"现在不再接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));

            const timer = setInterval(interval, this.timeout);    //到了时间如果还没有收到对方响应就重新发送一次

            this._messageListener.receiveOnce([MessageType.broadcast_close_finish, messageID] as any, () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType._onClose, MessageType.broadcast_close_finish, messageID] as any);
            });

            this._messageListener.receiveOnce([MessageType._onClose, MessageType.broadcast_close_finish, messageID] as any, () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType.broadcast_close_finish, messageID] as any);
            });

            interval();
        }
    }
}