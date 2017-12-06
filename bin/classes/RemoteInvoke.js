"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const eventspace_1 = require("eventspace");
const log_formatter_1 = require("log-formatter");
const MessageType_1 = require("../interfaces/MessageType");
const MessageData_1 = require("./MessageData");
class RemoteInvoke {
    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket, moduleName) {
        this._messageListener = new eventspace_1.EventSpace(); //注册的各类消息监听器    
        this._messageID = 0; //自增消息索引编号
        /**
         * 请求响应超时，默认3分钟
         */
        this.timeout = 3 * 60 * 1000;
        /**
         * 默认文件片段大小 512kb
         */
        this.filePieceSize = 512 * 1024;
        /**
         * 是否打印收到和发送的消息（用于调试）。默认false
         */
        this.printMessage = false;
        /**
         * 是否打印系统错误，默认true
         */
        this.printError = true;
        this.moduleName = moduleName;
        const onMessage = (header, body) => {
            try {
                const p_header = JSON.parse(header);
                switch (p_header[0]) {
                    case MessageType_1.MessageType.invoke_request: {
                        const msg = MessageData_1.InvokeRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.path], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_response: {
                        const msg = MessageData_1.InvokeResponseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_finish: {
                        const msg = MessageData_1.InvokeFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.sender, msg.responseMessageID], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_failed: {
                        const msg = MessageData_1.InvokeFailedMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_request: {
                        const msg = MessageData_1.InvokeFileRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_response: {
                        const msg = MessageData_1.InvokeFileResponseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_failed: {
                        const msg = MessageData_1.InvokeFileFailedMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_finish: {
                        const msg = MessageData_1.InvokeFileFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id], msg);
                        break;
                    }
                    case MessageType_1.MessageType.broadcast: {
                        const msg = MessageData_1.BroadcastMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        const eventName = [msg.type, msg.sender, ...msg.path.split('.')];
                        if (!this._messageListener.hasAncestors(eventName)) {
                            this._send_BroadcastCloseMessage(msg.sender, msg.path);
                        }
                        else {
                            this._messageListener.triggerAncestors(eventName, msg.data, true, true);
                        }
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_open: {
                        const msg = MessageData_1.BroadcastOpenMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.receive([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')], msg.path);
                        this._sendMessage(MessageData_1.BroadcastOpenFinishMessage.create(this, msg))
                            .catch(err => this._printError('响应对方的broadcast_open请求失败', err));
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_open_finish: {
                        const msg = MessageData_1.BroadcastOpenFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.messageID], msg);
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_close: {
                        const msg = MessageData_1.BroadcastCloseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.cancel([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')]); //清除标记
                        this._sendMessage(MessageData_1.BroadcastCloseFinishMessage.create(this, msg))
                            .catch(err => this._printError('响应对方的broadcast_close请求失败', err));
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_close_finish: {
                        const msg = MessageData_1.BroadcastCloseFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.trigger([msg.type, msg.messageID], msg);
                        break;
                    }
                    default:
                        throw new Error(`未知消息类型：${p_header}`);
                }
            }
            catch (error) {
                this._printError('接收到的消息格式错误：', error);
            }
        };
        const onOpen = () => this._messageListener.triggerDescendants([MessageType_1.MessageType._onOpen]);
        const onClose = () => this._messageListener.triggerDescendants([MessageType_1.MessageType._onClose]);
        //当打开端口之后立刻通知对方要监听哪些广播
        this._messageListener.receive([MessageType_1.MessageType._onOpen, '_send_broadcast_open'], () => {
            this._messageListener._eventLevel.getChildLevel([MessageType_1.MessageType.broadcast], true)
                .children.forEach((level, broadcastSender) => {
                const forEachLevel = (level) => {
                    if (level.receivers.size > 0) {
                        this._send_BroadcastOpenMessage(broadcastSender, level.receivers.values().next().value);
                    }
                    level.children.forEach(forEachLevel);
                };
                level.children.forEach(forEachLevel);
            });
        });
        //当连接断开立刻清理对方注册过的广播路径
        this._messageListener.receive([MessageType_1.MessageType._onClose, '_clean_opened_broadcast'], () => {
            this._messageListener.cancelDescendants([MessageType_1.MessageType._broadcast_white_list]);
        });
        this.socket = new socket(this, onMessage, onOpen, onClose);
    }
    /**
     * 对外导出方法。
     * 如果要向调用方反馈错误，直接 throw new Error() 即可。
     * 注意：对于导出方法，当它执行完成，返回结果后就不可以再继续下载文件了。
     * 注意：一个path上只允许导出一个方法。如果重复导出则后面的应该覆盖掉前面的。
     * @param path 所导出的路径
     * @param func 导出的方法
     */
    export(path, func) {
        this.cancelExport(path);
        this._messageListener.receive([MessageType_1.MessageType.invoke_request, path], (msg) => __awaiter(this, void 0, void 0, function* () {
            const { data, clean } = this._prepare_InvokeReceivingData(msg);
            try {
                const result = (yield func(data)) || { data: null };
                const rm = MessageData_1.InvokeResponseMessage.create(this, msg, this._messageID++, result);
                try {
                    if (rm.files.length === 0) {
                        yield this._prepare_InvokeSendingData(rm);
                    }
                    else {
                        const clean = yield this._prepare_InvokeSendingData(rm, () => {
                            this._messageListener.cancel([MessageType_1.MessageType.invoke_finish, rm.receiver, rm.responseMessageID]);
                        });
                        this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_finish, rm.receiver, rm.responseMessageID], clean);
                    }
                }
                catch (error) {
                    this._printError('发送"调用响应"失败', error);
                }
            }
            catch (error) {
                this._sendMessage(MessageData_1.InvokeFailedMessage.create(this, msg, error))
                    .catch(err => this._printError('发送"调用失败响应"失败', err));
            }
            finally {
                clean();
            }
        }));
        return func;
    }
    /**
     * 取消对外导出的方法
     * @param path 之前导出的路径
     */
    cancelExport(path) {
        this._messageListener.cancel([MessageType_1.MessageType.invoke_request, path]);
    }
    invoke(receiver, path, data, callback) {
        const rm = MessageData_1.InvokeRequestMessage.create(this, this._messageID++, receiver, path, data);
        if (callback) {
            this._prepare_InvokeSendingData(rm, () => {
                this._messageListener.cancel([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID]);
            }).then(cleanRequest => {
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID], (msg) => {
                    cleanRequest();
                    const { data, clean } = this._prepare_InvokeReceivingData(msg);
                    callback(undefined, data).then(clean).catch(err => {
                        clean();
                        throw err;
                    });
                });
            }).catch(callback);
        }
        else {
            return new Promise((resolve, reject) => {
                this._prepare_InvokeSendingData(rm, () => {
                    this._messageListener.cancel([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID]);
                }).then(cleanRequest => {
                    this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID], (msg) => __awaiter(this, void 0, void 0, function* () {
                        cleanRequest();
                        const { data, clean } = this._prepare_InvokeReceivingData(msg);
                        try {
                            const result = [];
                            for (const item of data.files) {
                                result.push({ name: item.name, data: yield item.getFile() });
                            }
                            clean();
                            resolve({ data: data.data, files: result });
                        }
                        catch (error) {
                            clean();
                            reject(error);
                        }
                    }));
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
    receive(sender, path, func) {
        const eventName = [MessageType_1.MessageType.broadcast, sender, ...path.split('.')];
        if (!this._messageListener.has(eventName)) {
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
    cancelReceive(sender, path, listener) {
        const eventName = [MessageType_1.MessageType.broadcast, sender, ...path.split('.')];
        if (this._messageListener.has(eventName)) {
            this._messageListener.cancel(eventName, listener);
            if (!this._messageListener.has(eventName)) {
                this._send_BroadcastCloseMessage(sender, path);
            }
        }
    }
    /**
     * 对外广播数据
     * @param path 广播的路径
     * @param data 要发送的数据
     */
    broadcast(path, data = null) {
        return __awaiter(this, void 0, void 0, function* () {
            //判断对方是否注册的有关于这条广播的监听器
            if (this._messageListener.hasAncestors([MessageType_1.MessageType._broadcast_white_list, ...path.split('.')])) {
                yield this._sendMessage(MessageData_1.BroadcastMessage.create(this, path, data));
            }
        });
    }
    /**
     * 便于使用socket发送消息
     */
    _sendMessage(msg) {
        const result = msg.pack();
        this._printMessage(true, msg);
        return this.socket.send(result[0], result[1]);
    }
    /**
     * 打印错误消息
     * @param desc 描述
     * @param err 错误信息
     */
    _printError(desc, err) {
        if (this.printError)
            log_formatter_1.default.warn
                .location.white
                .title.yellow
                .content.yellow('remote-invoke', desc, err);
    }
    /**
     * 打印收到或发送的消息
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param desc 描述
     * @param data 要打印的数据
     */
    _printMessage(sendOrReceive, msg) {
        if (this.printMessage)
            if (sendOrReceive)
                log_formatter_1.default
                    .location
                    .location.cyan.bold
                    .title
                    .content('remote-invoke', '发送', MessageType_1.MessageType[msg.type], JSON.stringify(msg, undefined, 2));
            else
                log_formatter_1.default
                    .location
                    .location.green.bold
                    .title
                    .content('remote-invoke', '收到', MessageType_1.MessageType[msg.type], JSON.stringify(msg, undefined, 2));
    }
    /**
     * 准备好下载回调。返回InvokeReceivingData与清理资源回调
     */
    _prepare_InvokeReceivingData(msg) {
        const messageID = msg instanceof MessageData_1.InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;
        const files = msg.files.map(item => {
            let start = false; //是否已经开始获取了，主要是用于防止重复下载
            let index = -1; //现在接收到第几个文件片段了
            let downloadedSize = 0; //已下载大小
            let timer; //超时计时器
            const downloadNext = () => {
                timer = setTimeout(() => cb_error(new Error('请求超时')), this.timeout); //设置超时
                this._sendMessage(MessageData_1.InvokeFileRequestMessage.create(this, msg, item.id, ++index))
                    .catch(err => { clearTimeout(timer); cb_error(new Error('网络连接异常：' + err)); });
            };
            let cb_error; //下载出错回调
            let cb_receive; //接收文件回调
            //监听下载到的文件
            this._messageListener.receive([MessageType_1.MessageType.invoke_file_response, msg.sender, messageID, item.id], (msg) => {
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
            this._messageListener.receive([MessageType_1.MessageType.invoke_file_failed, msg.sender, messageID, item.id], (msg) => {
                clearTimeout(timer);
                cb_error(new Error(msg.error));
            });
            //监听下载文件结束
            this._messageListener.receive([MessageType_1.MessageType.invoke_file_finish, msg.sender, messageID, item.id], (msg) => {
                clearTimeout(timer);
                cb_receive(Buffer.alloc(0), true);
            });
            const result = {
                size: item.size,
                splitNumber: item.splitNumber,
                name: item.name,
                onData: (callback, startIndex = 0) => {
                    if (start) {
                        callback(new Error('不可重复下载文件'));
                    }
                    else {
                        start = true;
                        index = startIndex - 1;
                        cb_error = err => { callback(err); cb_error = () => { }; }; //确保只触发一次
                        cb_receive = (data, isEnd) => {
                            if (isEnd)
                                callback(undefined, isEnd, index, data);
                            else
                                callback(undefined, isEnd, index, data).then(result => result !== true && downloadNext());
                        };
                        downloadNext();
                    }
                },
                getFile: () => new Promise((resolve, reject) => {
                    if (start) {
                        reject(new Error('不可重复下载文件'));
                    }
                    else {
                        start = true;
                        const filePieces = []; //下载到的文件片段
                        cb_error = reject;
                        cb_receive = (data, isEnd) => {
                            filePieces.push(data);
                            isEnd ? resolve(Buffer.concat(filePieces)) : downloadNext();
                        };
                        downloadNext();
                    }
                })
            };
            return result;
        });
        return {
            data: { data: msg.data, files },
            clean: () => {
                this._messageListener.triggerDescendants([MessageType_1.MessageType.invoke_file_failed, msg.sender, messageID], { error: '下载终止' });
                this._messageListener.cancelDescendants([MessageType_1.MessageType.invoke_file_response, msg.sender, messageID]);
                this._messageListener.cancelDescendants([MessageType_1.MessageType.invoke_file_failed, msg.sender, messageID]);
                this._messageListener.cancelDescendants([MessageType_1.MessageType.invoke_file_finish, msg.sender, messageID]);
            }
        };
    }
    /**
     * 准备发送文件，返回清理资源回调。如果超时会自动清理资源
     * @param msg 要发送的数据
     * @param onTimeout 没有文件请求超时
     */
    _prepare_InvokeSendingData(msg, onTimeout) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._sendMessage(msg);
            if (msg.files.length > 0) {
                const messageID = msg instanceof MessageData_1.InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;
                const clean = () => {
                    clearTimeout(timer);
                    this._messageListener.cancelDescendants([MessageType_1.MessageType.invoke_file_request, msg.receiver, messageID]);
                };
                const timeout = () => { clean(); onTimeout && onTimeout(); };
                let timer = setTimeout(timeout, this.timeout); //超时计时器
                msg.files.forEach(item => {
                    let sendingData = item._data;
                    let index = 0; //记录用户请求到了第几个文件片段了
                    const send_error = (msg, err) => {
                        sendingData.onProgress && sendingData.onProgress(err, undefined);
                        this._sendMessage(MessageData_1.InvokeFileFailedMessage.create(this, msg, err))
                            .catch(err => this._printError('向对方发送"请求文件片段失败响应"失败', err));
                        //不允许再下载该文件了
                        this._messageListener.cancel([MessageType_1.MessageType.invoke_file_request, msg.receiver, messageID, item.id]);
                    };
                    const send_finish = (msg) => {
                        this._sendMessage(MessageData_1.InvokeFileFinishMessage.create(this, msg))
                            .catch(err => this._printError('向对方发送"请求文件片段结束响应"失败', err));
                        //不允许再下载该文件了
                        this._messageListener.cancel([MessageType_1.MessageType.invoke_file_request, msg.receiver, messageID, item.id]);
                    };
                    this._messageListener.receive([MessageType_1.MessageType.invoke_file_request, msg.receiver, messageID, item.id], (msg) => {
                        clearTimeout(timer);
                        timer = setTimeout(timeout, this.timeout);
                        if (msg.index > index) {
                            index = msg.index;
                        }
                        else {
                            send_error(msg, new Error('重复下载文件片段'));
                            return;
                        }
                        if (Buffer.isBuffer(sendingData.file)) {
                            if (index < item.splitNumber) {
                                sendingData.onProgress && sendingData.onProgress(undefined, (index + 1) / item.splitNumber);
                                const result = MessageData_1.InvokeFileResponseMessage
                                    .create(this, msg, sendingData.file.slice(index * this.filePieceSize, (index + 1) * this.filePieceSize));
                                this._sendMessage(result).catch(err => send_error(msg, err));
                            }
                            else {
                                send_finish(msg);
                            }
                        }
                        else {
                            sendingData.file(index)
                                .then(data => {
                                if (Buffer.isBuffer(data)) {
                                    this._sendMessage(MessageData_1.InvokeFileResponseMessage.create(this, msg, data)).catch(err => send_error(msg, err));
                                }
                                else {
                                    send_finish(msg);
                                }
                            }).catch(err => {
                                send_error(msg, err);
                            });
                        }
                    });
                });
                return clean;
            }
            else {
                return () => { };
            }
        });
    }
    /**
      * 发送BroadcastOpenMessage
      * @param broadcastSender 广播的发送者
      * @param path 广播路径
      */
    _send_BroadcastOpenMessage(broadcastSender, path) {
        if (this.socket.connected) {
            const messageID = this._messageID++;
            const result = MessageData_1.BroadcastOpenMessage.create(this, messageID, broadcastSender, path);
            const interval = () => this._sendMessage(result)
                .catch(err => this._printError(`通知对方"现在要接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));
            const timer = setInterval(interval, this.timeout); //到了时间如果还没有收到对方响应就重新发送一次
            this._messageListener.receiveOnce([MessageType_1.MessageType.broadcast_open_finish, messageID], () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_open_finish, messageID]);
            });
            this._messageListener.receiveOnce([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_open_finish, messageID], () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType_1.MessageType.broadcast_open_finish, messageID]);
            });
            interval();
        }
    }
    /**
     * 发送BroadcastCloseMessage
     * @param broadcastSender 广播的发送者
     * @param path 广播路径
     */
    _send_BroadcastCloseMessage(broadcastSender, path) {
        if (this.socket.connected) {
            const messageID = this._messageID++;
            const result = MessageData_1.BroadcastCloseMessage.create(this, messageID, broadcastSender, path);
            const interval = () => this._sendMessage(result)
                .catch(err => this._printError(`通知对方"现在不再接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));
            const timer = setInterval(interval, this.timeout); //到了时间如果还没有收到对方响应就重新发送一次
            this._messageListener.receiveOnce([MessageType_1.MessageType.broadcast_close_finish, messageID], () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_close_finish, messageID]);
            });
            this._messageListener.receiveOnce([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_close_finish, messageID], () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType_1.MessageType.broadcast_close_finish, messageID]);
            });
            interval();
        }
    }
}
exports.RemoteInvoke = RemoteInvoke;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsYXNzZXMvUmVtb3RlSW52b2tlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwyQ0FBd0M7QUFFeEMsaURBQWdDO0FBRWhDLDJEQUF3RDtBQUl4RCwrQ0FldUI7QUFFdkI7SUFvQ0k7OztPQUdHO0lBQ0gsWUFBWSxNQUErQixFQUFFLFVBQWtCO1FBdEM5QyxxQkFBZ0IsR0FBRyxJQUFJLHVCQUFVLEVBQUUsQ0FBQyxDQUFHLGdCQUFnQjtRQUVoRSxlQUFVLEdBQVcsQ0FBQyxDQUFDLENBQUMsVUFBVTtRQU8xQzs7V0FFRztRQUNNLFlBQU8sR0FBVyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztRQUV6Qzs7V0FFRztRQUNNLGtCQUFhLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQztRQU9wQzs7V0FFRztRQUNILGlCQUFZLEdBQVksS0FBSyxDQUFDO1FBRTlCOztXQUVHO1FBQ0gsZUFBVSxHQUFZLElBQUksQ0FBQztRQU92QixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUU3QixNQUFNLFNBQVMsR0FBRyxDQUFDLE1BQWMsRUFBRSxJQUFZO1lBQzNDLElBQUksQ0FBQztnQkFDRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUVwQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNsQixLQUFLLHlCQUFXLENBQUMsY0FBYyxFQUFFLENBQUM7d0JBQzlCLE1BQU0sR0FBRyxHQUFHLGtDQUFvQixDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUM3RCxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQzt3QkFFL0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLElB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b3J0IHsgRXZlbnRTcGFjZSB9IGZyb20gJ2V2ZW50c3BhY2UnO1xyXG5pbXBvcnQgeyBFdmVudExldmVsIH0gZnJvbSAnZXZlbnRzcGFjZS9iaW4vY2xhc3Nlcy9FdmVudExldmVsJztcclxuaW1wb3J0IGxvZyBmcm9tICdsb2ctZm9ybWF0dGVyJztcclxuXHJcbmltcG9ydCB7IE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9NZXNzYWdlVHlwZSc7XHJcbmltcG9ydCB7IENvbm5lY3Rpb25Tb2NrZXQgfSBmcm9tIFwiLi9Db25uZWN0aW9uU29ja2V0XCI7XHJcbmltcG9ydCB7IEludm9rZVJlY2VpdmluZ0RhdGEsIFJlY2VpdmluZ0ZpbGUgfSBmcm9tICcuLi9pbnRlcmZhY2VzL0ludm9rZVJlY2VpdmluZ0RhdGEnO1xyXG5pbXBvcnQgeyBJbnZva2VTZW5kaW5nRGF0YSwgU2VuZGluZ0ZpbGUgfSBmcm9tICcuLi9pbnRlcmZhY2VzL0ludm9rZVNlbmRpbmdEYXRhJztcclxuaW1wb3J0IHtcclxuICAgIEludm9rZVJlcXVlc3RNZXNzYWdlLFxyXG4gICAgSW52b2tlUmVzcG9uc2VNZXNzYWdlLFxyXG4gICAgSW52b2tlRmluaXNoTWVzc2FnZSxcclxuICAgIEludm9rZUZhaWxlZE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlRmluaXNoTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdE1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RPcGVuTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0Q2xvc2VGaW5pc2hNZXNzYWdlLFxyXG4gICAgTWVzc2FnZURhdGFcclxufSBmcm9tICcuL01lc3NhZ2VEYXRhJztcclxuXHJcbmV4cG9ydCBjbGFzcyBSZW1vdGVJbnZva2Uge1xyXG5cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VMaXN0ZW5lciA9IG5ldyBFdmVudFNwYWNlKCk7ICAgLy/ms6jlhoznmoTlkITnsbvmtojmga/nm5HlkKzlmaggICAgXHJcblxyXG4gICAgcHJpdmF0ZSBfbWVzc2FnZUlEOiBudW1iZXIgPSAwOyAvL+iHquWinua2iOaBr+e0ouW8lee8luWPt1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6L+e5o6l56uv5Y+jXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IHNvY2tldDogQ29ubmVjdGlvblNvY2tldDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOivt+axguWTjeW6lOi2heaXtu+8jOm7mOiupDPliIbpkp9cclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgdGltZW91dDogbnVtYmVyID0gMyAqIDYwICogMTAwMDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOm7mOiupOaWh+S7tueJh+auteWkp+WwjyA1MTJrYlxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBmaWxlUGllY2VTaXplID0gNTEyICogMTAyNDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOW9k+WJjeaooeWdl+WQjeensFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBtb2R1bGVOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKbmiZPljbDmlLbliLDlkozlj5HpgIHnmoTmtojmga/vvIjnlKjkuo7osIPor5XvvInjgILpu5jorqRmYWxzZVxyXG4gICAgICovXHJcbiAgICBwcmludE1lc3NhZ2U6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuaJk+WNsOezu+e7n+mUmeivr++8jOm7mOiupHRydWVcclxuICAgICAqL1xyXG4gICAgcHJpbnRFcnJvcjogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBAcGFyYW0gc29ja2V0IOi/nuaOpeerr+WPo1xyXG4gICAgICogQHBhcmFtIG1vZHVsZU5hbWUg5b2T5YmN5qih5Z2X55qE5ZCN56ewXHJcbiAgICAgKi9cclxuICAgIGNvbnN0cnVjdG9yKHNvY2tldDogdHlwZW9mIENvbm5lY3Rpb25Tb2NrZXQsIG1vZHVsZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMubW9kdWxlTmFtZSA9IG1vZHVsZU5hbWU7XHJcblxyXG4gICAgICAgIGNvbnN0IG9uTWVzc2FnZSA9IChoZWFkZXI6IHN0cmluZywgYm9keTogQnVmZmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwX2hlYWRlciA9IEpTT04ucGFyc2UoaGVhZGVyKTtcclxuXHJcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHBfaGVhZGVyWzBdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVxdWVzdDogeyAgLy/ooqvosIPnlKjogIXmlLbliLDosIPnlKjor7fmsYJcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlUmVxdWVzdE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5wYXRoXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2U6IHsgLy/osIPnlKjogIXmlLbliLDosIPnlKjlk43lupRcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlUmVzcG9uc2VNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaDogeyAgIC8v6KKr6LCD55So6ICF5pS25Yiw6LCD55So57uT5p2f5ZON5bqUXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbmlzaE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5yZXNwb25zZU1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZhaWxlZDogeyAgIC8v6LCD55So6ICF5pS25Yiw6LCD55So5aSx6LSl5ZON5bqUXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZhaWxlZE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXNwb25zZToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIC4uLm1zZy5wYXRoLnNwbGl0KCcuJyldIGFzIGFueTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhc0FuY2VzdG9ycyhldmVudE5hbWUpKSB7ICAgLy/lpoLmnpzmsqHmnInms6jlhozov4fov5nkuKrlub/mkq3nmoTnm5HlkKzlmajvvIzlsLHpgJrnn6Xlr7nmlrnkuI3opoHlho3lj5HpgIHkuoZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKG1zZy5zZW5kZXIsIG1zZy5wYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyQW5jZXN0b3JzKGV2ZW50TmFtZSwgbXNnLmRhdGEsIHRydWUsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RPcGVuTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3QsIC4uLm1zZy5wYXRoLnNwbGl0KCcuJyldIGFzIGFueSwgbXNnLnBhdGggYXMgYW55KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2cpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflk43lupTlr7nmlrnnmoRicm9hZGNhc3Rfb3Blbuivt+axguWksei0pScsIGVycikpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cubWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0Q2xvc2VNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0LCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnkpOyAgLy/muIXpmaTmoIforrBcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKEJyb2FkY2FzdENsb3NlRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcign5ZON5bqU5a+55pa555qEYnJvYWRjYXN0X2Nsb3Nl6K+35rGC5aSx6LSlJywgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdENsb3NlRmluaXNoTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLm1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pyq55+l5raI5oGv57G75Z6L77yaJHtwX2hlYWRlcn1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50RXJyb3IoJ+aOpeaUtuWIsOeahOa2iOaBr+agvOW8j+mUmeivr++8micsIGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IG9uT3BlbiA9ICgpID0+IHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLl9vbk9wZW5dIGFzIGFueSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG9uQ2xvc2UgPSAoKSA9PiB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5fb25DbG9zZV0gYXMgYW55KTtcclxuXHJcbiAgICAgICAgLy/lvZPmiZPlvIDnq6/lj6PkuYvlkI7nq4vliLvpgJrnn6Xlr7nmlrnopoHnm5HlkKzlk6rkupvlub/mkq1cclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuX29uT3BlbiwgJ19zZW5kX2Jyb2FkY2FzdF9vcGVuJ10gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5fZXZlbnRMZXZlbC5nZXRDaGlsZExldmVsKFtNZXNzYWdlVHlwZS5icm9hZGNhc3RdIGFzIGFueSwgdHJ1ZSlcclxuICAgICAgICAgICAgICAgIC5jaGlsZHJlbi5mb3JFYWNoKChsZXZlbCwgYnJvYWRjYXN0U2VuZGVyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9yRWFjaExldmVsID0gKGxldmVsOiBFdmVudExldmVsKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsZXZlbC5yZWNlaXZlcnMuc2l6ZSA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0T3Blbk1lc3NhZ2UoYnJvYWRjYXN0U2VuZGVyLCBsZXZlbC5yZWNlaXZlcnMudmFsdWVzKCkubmV4dCgpLnZhbHVlIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldmVsLmNoaWxkcmVuLmZvckVhY2goZm9yRWFjaExldmVsKTtcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBsZXZlbC5jaGlsZHJlbi5mb3JFYWNoKGZvckVhY2hMZXZlbCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy/lvZPov57mjqXmlq3lvIDnq4vliLvmuIXnkIblr7nmlrnms6jlhozov4fnmoTlub/mkq3ot6/lvoRcclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuX29uQ2xvc2UsICdfY2xlYW5fb3BlbmVkX2Jyb2FkY2FzdCddIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdF0gYXMgYW55KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5zb2NrZXQgPSBuZXcgc29ja2V0KHRoaXMsIG9uTWVzc2FnZSwgb25PcGVuLCBvbkNsb3NlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWvueWkluWvvOWHuuaWueazleOAgiAgICAgXHJcbiAgICAgKiDlpoLmnpzopoHlkJHosIPnlKjmlrnlj43ppojplJnor6/vvIznm7TmjqUgdGhyb3cgbmV3IEVycm9yKCkg5Y2z5Y+v44CCICAgICBcclxuICAgICAqIOazqOaEj++8muWvueS6juWvvOWHuuaWueazle+8jOW9k+Wug+aJp+ihjOWujOaIkO+8jOi/lOWbnue7k+aenOWQjuWwseS4jeWPr+S7peWGjee7p+e7reS4i+i9veaWh+S7tuS6huOAgiAgICAgXHJcbiAgICAgKiDms6jmhI/vvJrkuIDkuKpwYXRo5LiK5Y+q5YWB6K645a+85Ye65LiA5Liq5pa55rOV44CC5aaC5p6c6YeN5aSN5a+85Ye65YiZ5ZCO6Z2i55qE5bqU6K+l6KaG55uW5o6J5YmN6Z2i55qE44CCICAgICBcclxuICAgICAqIEBwYXJhbSBwYXRoIOaJgOWvvOWHuueahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGZ1bmMg5a+85Ye655qE5pa55rOVIFxyXG4gICAgICovXHJcbiAgICBleHBvcnQ8RiBleHRlbmRzIChkYXRhOiBJbnZva2VSZWNlaXZpbmdEYXRhKSA9PiBQcm9taXNlPHZvaWQgfCBJbnZva2VTZW5kaW5nRGF0YT4+KHBhdGg6IHN0cmluZywgZnVuYzogRik6IEYge1xyXG4gICAgICAgIHRoaXMuY2FuY2VsRXhwb3J0KHBhdGgpO1xyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVxdWVzdCwgcGF0aF0gYXMgYW55LCBhc3luYyAobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB7IGRhdGEsIGNsZWFuIH0gPSB0aGlzLl9wcmVwYXJlX0ludm9rZVJlY2VpdmluZ0RhdGEobXNnKTtcclxuXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmdW5jKGRhdGEpIHx8IHsgZGF0YTogbnVsbCB9O1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgcm0gPSBJbnZva2VSZXNwb25zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgdGhpcy5fbWVzc2FnZUlEKyssIHJlc3VsdCk7XHJcblxyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocm0uZmlsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuX3ByZXBhcmVfSW52b2tlU2VuZGluZ0RhdGEocm0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFuID0gYXdhaXQgdGhpcy5fcHJlcGFyZV9JbnZva2VTZW5kaW5nRGF0YShybSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaCwgcm0ucmVjZWl2ZXIsIHJtLnJlc3BvbnNlTWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaCwgcm0ucmVjZWl2ZXIsIHJtLnJlc3BvbnNlTWVzc2FnZUlEXSBhcyBhbnksIGNsZWFuKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50RXJyb3IoJ+WPkemAgVwi6LCD55So5ZON5bqUXCLlpLHotKUnLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShJbnZva2VGYWlsZWRNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2csIGVycm9yKSlcclxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WPkemAgVwi6LCD55So5aSx6LSl5ZON5bqUXCLlpLHotKUnLCBlcnIpKTtcclxuICAgICAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGZ1bmM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlj5bmtojlr7nlpJblr7zlh7rnmoTmlrnms5VcclxuICAgICAqIEBwYXJhbSBwYXRoIOS5i+WJjeWvvOWHuueahOi3r+W+hFxyXG4gICAgICovXHJcbiAgICBjYW5jZWxFeHBvcnQocGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX3JlcXVlc3QsIHBhdGhdIGFzIGFueSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjov5znq6/mqKHlnZflr7zlh7rnmoTmlrnms5XjgILnm7TmjqXov5Tlm57mlbDmja7kuI7mlofku7ZcclxuICAgICAqIEBwYXJhbSByZWNlaXZlciDov5znq6/mqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSBwYXRoIOaWueazleeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5Lyg6YCS55qE5pWw5o2uXHJcbiAgICAgKi9cclxuICAgIGludm9rZShyZWNlaXZlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhKTogUHJvbWlzZTx7IGRhdGE6IGFueSwgZmlsZXM6IHsgbmFtZTogc3RyaW5nLCBkYXRhOiBCdWZmZXIgfVtdIH0+XHJcbiAgICAvKipcclxuICAgICAqIOiwg+eUqOi/nOerr+aooeWdl+WvvOWHuueahOaWueazleOAglxyXG4gICAgICogQHBhcmFtIHJlY2VpdmVyIOi/nOerr+aooeWdl+eahOWQjeensFxyXG4gICAgICogQHBhcmFtIHBhdGgg5pa55rOV55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZGF0YSDopoHkvKDpgJLnmoTmlbDmja5cclxuICAgICAqIEBwYXJhbSBjYWxsYmFjayDmjqXmlLblk43lupTmlbDmja7nmoTlm57osIPjgILms6jmhI/vvJrkuIDml6blm57osIPmiafooYzlrozmiJDlsLHkuI3og73lho3kuIvovb3mlofku7bkuobjgIJcclxuICAgICAqL1xyXG4gICAgaW52b2tlKHJlY2VpdmVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEsIGNhbGxiYWNrOiAoZXJyOiBFcnJvciB8IHVuZGVmaW5lZCwgZGF0YTogSW52b2tlUmVjZWl2aW5nRGF0YSkgPT4gUHJvbWlzZTx2b2lkPik6IHZvaWRcclxuICAgIGludm9rZShyZWNlaXZlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhLCBjYWxsYmFjaz86IChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBkYXRhOiBJbnZva2VSZWNlaXZpbmdEYXRhKSA9PiBQcm9taXNlPHZvaWQ+KTogYW55IHtcclxuICAgICAgICBjb25zdCBybSA9IEludm9rZVJlcXVlc3RNZXNzYWdlLmNyZWF0ZSh0aGlzLCB0aGlzLl9tZXNzYWdlSUQrKywgcmVjZWl2ZXIsIHBhdGgsIGRhdGEpO1xyXG5cclxuICAgICAgICBpZiAoY2FsbGJhY2spIHsgICAvL+Wbnuiwg+WHveaVsOeJiOacrFxyXG4gICAgICAgICAgICB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2UsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KS50aGVuKGNsZWFuUmVxdWVzdCA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9yZXNwb25zZSwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgKG1zZzogSW52b2tlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYW5SZXF1ZXN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyBkYXRhLCBjbGVhbiB9ID0gdGhpcy5fcHJlcGFyZV9JbnZva2VSZWNlaXZpbmdEYXRhKG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgZGF0YSkudGhlbihjbGVhbikuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW4oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGNhbGxiYWNrIGFzIGFueSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3ByZXBhcmVfSW52b2tlU2VuZGluZ0RhdGEocm0sICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2UsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgfSkudGhlbihjbGVhblJlcXVlc3QgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCBhc3luYyAobXNnOiBJbnZva2VSZXNwb25zZU1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW5SZXF1ZXN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgZGF0YSwgY2xlYW4gfSA9IHRoaXMuX3ByZXBhcmVfSW52b2tlUmVjZWl2aW5nRGF0YShtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogeyBuYW1lOiBzdHJpbmcsIGRhdGE6IEJ1ZmZlciB9W10gPSBbXTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YS5maWxlcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHsgbmFtZTogaXRlbS5uYW1lLCBkYXRhOiBhd2FpdCBpdGVtLmdldEZpbGUoKSB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IGRhdGE6IGRhdGEuZGF0YSwgZmlsZXM6IHJlc3VsdCB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChyZWplY3QpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDms6jlhozlub/mkq3nm5HlkKzlmaggICAgICBcclxuICAgICAqIEBwYXJhbSBzZW5kZXIg5Y+R6YCB6ICFXHJcbiAgICAgKiBAcGFyYW0gbmFtZSDlub/mkq3nmoTot6/lvoRcclxuICAgICAqIEBwYXJhbSBmdW5jIOWvueW6lOeahOWbnuiwg+aWueazlVxyXG4gICAgICovXHJcbiAgICByZWNlaXZlPEYgZXh0ZW5kcyAoYXJnOiBhbnkpID0+IGFueT4oc2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgZnVuYzogRik6IEYge1xyXG4gICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9IFtNZXNzYWdlVHlwZS5icm9hZGNhc3QsIHNlbmRlciwgLi4ucGF0aC5zcGxpdCgnLicpXSBhcyBhbnk7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhcyhldmVudE5hbWUpKSB7ICAvL+WmguaenOi/mOayoeazqOWGjOi/h++8jOmAmuefpeWvueaWueeOsOWcqOimgeaOpeaUtuaMh+Wumui3r+W+hOW5v+aSrVxyXG4gICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKHNlbmRlciwgcGF0aCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShldmVudE5hbWUsIGZ1bmMpOyAvL+S4jeWMheijheS4gOS4i+ebkeWQrOWZqO+8jOaYr+S4uuS6huiAg+iZkeWIsGNhbmNlbFJlY2VpdmVcclxuICAgICAgICByZXR1cm4gZnVuYztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIoOmZpOaMh+Wumui3r+W+hOS4iueahOaJgOacieW5v+aSreebkeWQrOWZqO+8jOWPr+S7peS8oOmAkuS4gOS4qmxpc3RlbmVy5p2l5Y+q5Yig6Zmk5LiA5Liq54m55a6a55qE55uR5ZCs5ZmoXHJcbiAgICAgKiBAcGFyYW0gc2VuZGVyIOWPkemAgeiAhVxyXG4gICAgICogQHBhcmFtIG5hbWUg5bm/5pKt55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gbGlzdGVuZXIg6KaB5oyH5a6a5Yig6Zmk55qE55uR5ZCs5ZmoXHJcbiAgICAgKi9cclxuICAgIGNhbmNlbFJlY2VpdmUoc2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgbGlzdGVuZXI/OiAoYXJnOiBhbnkpID0+IGFueSkge1xyXG4gICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9IFtNZXNzYWdlVHlwZS5icm9hZGNhc3QsIHNlbmRlciwgLi4ucGF0aC5zcGxpdCgnLicpXSBhcyBhbnk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzKGV2ZW50TmFtZSkpIHsgIC8v56Gu5L+d55yf55qE5pyJ5rOo5YaM6L+H5YaN5omn6KGM5Yig6ZmkXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoZXZlbnROYW1lLCBsaXN0ZW5lcik7XHJcblxyXG4gICAgICAgICAgICBpZiAoIXRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXMoZXZlbnROYW1lKSkgeyAgICAvL+WmguaenOWIoOWFieS6hu+8jOWwsemAmuefpeWvueaWueS4jeWGjeaOpeaUtuS6hlxyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RDbG9zZU1lc3NhZ2Uoc2VuZGVyLCBwYXRoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWvueWkluW5v+aSreaVsOaNrlxyXG4gICAgICogQHBhcmFtIHBhdGgg5bm/5pKt55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZGF0YSDopoHlj5HpgIHnmoTmlbDmja5cclxuICAgICAqL1xyXG4gICAgYXN5bmMgYnJvYWRjYXN0KHBhdGg6IHN0cmluZywgZGF0YTogYW55ID0gbnVsbCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIC8v5Yik5pat5a+55pa55piv5ZCm5rOo5YaM55qE5pyJ5YWz5LqO6L+Z5p2h5bm/5pKt55qE55uR5ZCs5ZmoXHJcbiAgICAgICAgaWYgKHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXNBbmNlc3RvcnMoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ucGF0aC5zcGxpdCgnLicpXSBhcyBhbnkpKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX3NlbmRNZXNzYWdlKEJyb2FkY2FzdE1lc3NhZ2UuY3JlYXRlKHRoaXMsIHBhdGgsIGRhdGEpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkvr/kuo7kvb/nlKhzb2NrZXTlj5HpgIHmtojmga9cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZE1lc3NhZ2UobXNnOiBNZXNzYWdlRGF0YSkge1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IG1zZy5wYWNrKCk7XHJcbiAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKHRydWUsIG1zZyk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLnNvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaJk+WNsOmUmeivr+a2iOaBr1xyXG4gICAgICogQHBhcmFtIGRlc2Mg5o+P6L+wIFxyXG4gICAgICogQHBhcmFtIGVyciDplJnor6/kv6Hmga9cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfcHJpbnRFcnJvcihkZXNjOiBzdHJpbmcsIGVycjogRXJyb3IpIHtcclxuICAgICAgICBpZiAodGhpcy5wcmludEVycm9yKVxyXG4gICAgICAgICAgICBsb2cud2FyblxyXG4gICAgICAgICAgICAgICAgLmxvY2F0aW9uLndoaXRlXHJcbiAgICAgICAgICAgICAgICAudGl0bGUueWVsbG93XHJcbiAgICAgICAgICAgICAgICAuY29udGVudC55ZWxsb3coJ3JlbW90ZS1pbnZva2UnLCBkZXNjLCBlcnIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5omT5Y2w5pS25Yiw5oiW5Y+R6YCB55qE5raI5oGvXHJcbiAgICAgKiBAcGFyYW0gc2VuZE9yUmVjZWl2ZSDlpoLmnpzmmK/lj5HpgIHliJnkuLp0cnVl77yM5aaC5p6c5piv5o6l5pS25YiZ5Li6ZmFsc2VcclxuICAgICAqIEBwYXJhbSBkZXNjIOaPj+i/sFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5omT5Y2w55qE5pWw5o2uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3ByaW50TWVzc2FnZShzZW5kT3JSZWNlaXZlOiBib29sZWFuLCBtc2c6IE1lc3NhZ2VEYXRhKSB7XHJcbiAgICAgICAgaWYgKHRoaXMucHJpbnRNZXNzYWdlKVxyXG4gICAgICAgICAgICBpZiAoc2VuZE9yUmVjZWl2ZSlcclxuICAgICAgICAgICAgICAgIGxvZ1xyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi5jeWFuLmJvbGRcclxuICAgICAgICAgICAgICAgICAgICAudGl0bGVcclxuICAgICAgICAgICAgICAgICAgICAuY29udGVudCgncmVtb3RlLWludm9rZScsICflj5HpgIEnLCBNZXNzYWdlVHlwZVttc2cudHlwZV0sIEpTT04uc3RyaW5naWZ5KG1zZywgdW5kZWZpbmVkLCAyKSk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIGxvZ1xyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi5ncmVlbi5ib2xkXHJcbiAgICAgICAgICAgICAgICAgICAgLnRpdGxlXHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQoJ3JlbW90ZS1pbnZva2UnLCAn5pS25YiwJywgTWVzc2FnZVR5cGVbbXNnLnR5cGVdLCBKU09OLnN0cmluZ2lmeShtc2csIHVuZGVmaW5lZCwgMikpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5YeG5aSH5aW95LiL6L295Zue6LCD44CC6L+U5ZueSW52b2tlUmVjZWl2aW5nRGF0YeS4jua4heeQhui1hOa6kOWbnuiwg1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9wcmVwYXJlX0ludm9rZVJlY2VpdmluZ0RhdGEobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VJRCA9IG1zZyBpbnN0YW5jZW9mIEludm9rZVJlcXVlc3RNZXNzYWdlID8gbXNnLnJlcXVlc3RNZXNzYWdlSUQgOiBtc2cucmVzcG9uc2VNZXNzYWdlSUQ7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGVzID0gbXNnLmZpbGVzLm1hcChpdGVtID0+IHtcclxuICAgICAgICAgICAgbGV0IHN0YXJ0OiBib29sZWFuID0gZmFsc2U7ICAgICAgICAgICAgIC8v5piv5ZCm5bey57uP5byA5aeL6I635Y+W5LqG77yM5Li76KaB5piv55So5LqO6Ziy5q2i6YeN5aSN5LiL6L29XHJcbiAgICAgICAgICAgIGxldCBpbmRleCA9IC0xOyAgICAgICAgICAgICAgICAgICAgICAgICAvL+eOsOWcqOaOpeaUtuWIsOesrOWHoOS4quaWh+S7tueJh+auteS6hlxyXG4gICAgICAgICAgICBsZXQgZG93bmxvYWRlZFNpemUgPSAwOyAgICAgICAgICAgICAgICAgLy/lt7LkuIvovb3lpKflsI9cclxuICAgICAgICAgICAgbGV0IHRpbWVyOiBOb2RlSlMuVGltZXI7ICAgICAgICAgICAgICAgIC8v6LaF5pe26K6h5pe25ZmoXHJcblxyXG4gICAgICAgICAgICBjb25zdCBkb3dubG9hZE5leHQgPSAoKSA9PiB7ICAgICAgICAgICAgLy/kuIvovb3kuIvkuIDkuKrmlofku7bniYfmrrVcclxuICAgICAgICAgICAgICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiBjYl9lcnJvcihuZXcgRXJyb3IoJ+ivt+axgui2heaXticpKSwgdGhpcy50aW1lb3V0KTsgIC8v6K6+572u6LaF5pe2XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2csIGl0ZW0uaWQsICsraW5kZXgpKVxyXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyBjYl9lcnJvcihuZXcgRXJyb3IoJ+e9kee7nOi/nuaOpeW8guW4uO+8micgKyBlcnIpKTsgfSk7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBsZXQgY2JfZXJyb3I6IChlcnI6IEVycm9yKSA9PiB2b2lkOyAvL+S4i+i9veWHuumUmeWbnuiwg1xyXG4gICAgICAgICAgICBsZXQgY2JfcmVjZWl2ZTogKGRhdGE6IEJ1ZmZlciwgaXNFbmQ6IGJvb2xlYW4pID0+IHZvaWQ7IC8v5o6l5pS25paH5Lu25Zue6LCDXHJcblxyXG4gICAgICAgICAgICAvL+ebkeWQrOS4i+i9veWIsOeahOaWh+S7tlxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChtc2cuaW5kZXggIT09IGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2JfZXJyb3IobmV3IEVycm9yKCfmlofku7blnKjkvKDovpPov4fnqIvkuK3vvIzpobrluo/lj5HnlJ/plJnkubEnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGRvd25sb2FkZWRTaXplICs9IG1zZy5kYXRhLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLnNpemUgIT0gbnVsbCAmJiBkb3dubG9hZGVkU2l6ZSA+IGl0ZW0uc2l6ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yKG5ldyBFcnJvcign5LiL6L295Yiw55qE5paH5Lu25aSn5bCP6LaF5Ye65LqG5Y+R6YCB6ICF5omA5o+P6L+w55qE5aSn5bCPJykpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjYl9yZWNlaXZlKG1zZy5kYXRhLCBpdGVtLnNwbGl0TnVtYmVyICE9IG51bGwgJiYgaW5kZXggKyAxID49IGl0ZW0uc3BsaXROdW1iZXIpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8v55uR5ZCs5LiL6L295paH5Lu25aSx6LSlXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIGNiX2Vycm9yKG5ldyBFcnJvcihtc2cuZXJyb3IpKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvL+ebkeWQrOS4i+i9veaWh+S7tue7k+adn1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmluaXNoLCBtc2cuc2VuZGVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICBjYl9yZWNlaXZlKEJ1ZmZlci5hbGxvYygwKSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBSZWNlaXZpbmdGaWxlID0ge1xyXG4gICAgICAgICAgICAgICAgc2l6ZTogaXRlbS5zaXplLFxyXG4gICAgICAgICAgICAgICAgc3BsaXROdW1iZXI6IGl0ZW0uc3BsaXROdW1iZXIsXHJcbiAgICAgICAgICAgICAgICBuYW1lOiBpdGVtLm5hbWUsXHJcbiAgICAgICAgICAgICAgICBvbkRhdGE6IChjYWxsYmFjaywgc3RhcnRJbmRleCA9IDApID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgKDxhbnk+Y2FsbGJhY2spKG5ldyBFcnJvcign5LiN5Y+v6YeN5aSN5LiL6L295paH5Lu2JykpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBzdGFydEluZGV4IC0gMTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yID0gZXJyID0+IHsgKDxhbnk+Y2FsbGJhY2spKGVycik7IGNiX2Vycm9yID0gKCkgPT4geyB9IH07ICAgLy/noa7kv53lj6rop6blj5HkuIDmrKFcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2JfcmVjZWl2ZSA9IChkYXRhLCBpc0VuZCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzRW5kKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgaXNFbmQsIGluZGV4LCBkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIGlzRW5kLCBpbmRleCwgZGF0YSkudGhlbihyZXN1bHQgPT4gcmVzdWx0ICE9PSB0cnVlICYmIGRvd25sb2FkTmV4dCgpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvd25sb2FkTmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBnZXRGaWxlOiAoKSA9PiBuZXcgUHJvbWlzZTxCdWZmZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHsgICAvL+S4i+i9veaWh+S7tuWbnuiwg1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFydCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCfkuI3lj6/ph43lpI3kuIvovb3mlofku7YnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlUGllY2VzOiBCdWZmZXJbXSA9IFtdOyAgICAvL+S4i+i9veWIsOeahOaWh+S7tueJh+autVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY2JfZXJyb3IgPSByZWplY3Q7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX3JlY2VpdmUgPSAoZGF0YSwgaXNFbmQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbGVQaWVjZXMucHVzaChkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzRW5kID8gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGZpbGVQaWVjZXMpKSA6IGRvd25sb2FkTmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgZG93bmxvYWROZXh0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgZGF0YTogeyBkYXRhOiBtc2cuZGF0YSwgZmlsZXMgfSxcclxuICAgICAgICAgICAgY2xlYW46ICgpID0+IHsgLy/muIXnkIbotYTmupBcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZCwgbXNnLnNlbmRlciwgbWVzc2FnZUlEXSBhcyBhbnksIHsgZXJyb3I6ICfkuIvovb3nu4jmraInIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkLCBtc2cuc2VuZGVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaCwgbXNnLnNlbmRlciwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWHhuWkh+WPkemAgeaWh+S7tu+8jOi/lOWbnua4heeQhui1hOa6kOWbnuiwg+OAguWmguaenOi2heaXtuS8muiHquWKqOa4heeQhui1hOa6kFxyXG4gICAgICogQHBhcmFtIG1zZyDopoHlj5HpgIHnmoTmlbDmja5cclxuICAgICAqIEBwYXJhbSBvblRpbWVvdXQg5rKh5pyJ5paH5Lu26K+35rGC6LaF5pe2XHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgX3ByZXBhcmVfSW52b2tlU2VuZGluZ0RhdGEobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSwgb25UaW1lb3V0PzogKCkgPT4gdm9pZCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMuX3NlbmRNZXNzYWdlKG1zZyk7XHJcblxyXG4gICAgICAgIGlmIChtc2cuZmlsZXMubGVuZ3RoID4gMCkgeyAvL+WHhuWkh+aWh+S7tuWPkemAgVxyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlSUQgPSBtc2cgaW5zdGFuY2VvZiBJbnZva2VSZXF1ZXN0TWVzc2FnZSA/IG1zZy5yZXF1ZXN0TWVzc2FnZUlEIDogbXNnLnJlc3BvbnNlTWVzc2FnZUlEO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xlYW4gPSAoKSA9PiB7ICAvL+a4heeQhui1hOa6kOWbnuiwg1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiB7IGNsZWFuKCk7IG9uVGltZW91dCAmJiBvblRpbWVvdXQoKTsgfTtcclxuXHJcbiAgICAgICAgICAgIGxldCB0aW1lciA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy50aW1lb3V0KTsgICAgLy/otoXml7borqHml7blmahcclxuXHJcbiAgICAgICAgICAgIG1zZy5maWxlcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICAgICAgbGV0IHNlbmRpbmdEYXRhID0gaXRlbS5fZGF0YSBhcyBTZW5kaW5nRmlsZTtcclxuICAgICAgICAgICAgICAgIGxldCBpbmRleCA9IDA7ICAgIC8v6K6w5b2V55So5oi36K+35rGC5Yiw5LqG56ys5Yeg5Liq5paH5Lu254mH5q615LqGXHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VuZF9lcnJvciA9IChtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSwgZXJyOiBFcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyhlcnIsIHVuZGVmaW5lZCBhcyBhbnkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShJbnZva2VGaWxlRmFpbGVkTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBlcnIpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WQkeWvueaWueWPkemAgVwi6K+35rGC5paH5Lu254mH5q615aSx6LSl5ZON5bqUXCLlpLHotKUnLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy/kuI3lhYHorrjlho3kuIvovb3or6Xmlofku7bkuoZcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZW5kX2ZpbmlzaCA9IChtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2cpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WQkeWvueaWueWPkemAgVwi6K+35rGC5paH5Lu254mH5q6157uT5p2f5ZON5bqUXCLlpLHotKUnLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy/kuI3lhYHorrjlho3kuIvovb3or6Xmlofku7bkuoZcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbWVzc2FnZUlELCBpdGVtLmlkXSBhcyBhbnksIChtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICAgICAgdGltZXIgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMudGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cuaW5kZXggPiBpbmRleCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmRleCA9IG1zZy5pbmRleDtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kX2Vycm9yKG1zZywgbmV3IEVycm9yKCfph43lpI3kuIvovb3mlofku7bniYfmrrUnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc2VuZGluZ0RhdGEuZmlsZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4IDwgKGl0ZW0uc3BsaXROdW1iZXIgYXMgbnVtYmVyKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyAmJiBzZW5kaW5nRGF0YS5vblByb2dyZXNzKHVuZGVmaW5lZCwgKGluZGV4ICsgMSkgLyAoaXRlbS5zcGxpdE51bWJlciBhcyBudW1iZXIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNyZWF0ZSh0aGlzLCBtc2csIHNlbmRpbmdEYXRhLmZpbGUuc2xpY2UoaW5kZXggKiB0aGlzLmZpbGVQaWVjZVNpemUsIChpbmRleCArIDEpICogdGhpcy5maWxlUGllY2VTaXplKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UocmVzdWx0KS5jYXRjaChlcnIgPT4gc2VuZF9lcnJvcihtc2csIGVycikpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9maW5pc2gobXNnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLmZpbGUoaW5kZXgpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbihkYXRhID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKGRhdGEpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZGF0YSkpLmNhdGNoKGVyciA9PiBzZW5kX2Vycm9yKG1zZywgZXJyKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9maW5pc2gobXNnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaChlcnIgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRfZXJyb3IobXNnLCBlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIGNsZWFuO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiAoKSA9PiB7IH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICAqIOWPkemAgUJyb2FkY2FzdE9wZW5NZXNzYWdlXHJcbiAgICAgICogQHBhcmFtIGJyb2FkY2FzdFNlbmRlciDlub/mkq3nmoTlj5HpgIHogIVcclxuICAgICAgKiBAcGFyYW0gcGF0aCDlub/mkq3ot6/lvoRcclxuICAgICAgKi9cclxuICAgIHByaXZhdGUgX3NlbmRfQnJvYWRjYXN0T3Blbk1lc3NhZ2UoYnJvYWRjYXN0U2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZykge1xyXG4gICAgICAgIGlmICh0aGlzLnNvY2tldC5jb25uZWN0ZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZUlEID0gdGhpcy5fbWVzc2FnZUlEKys7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBCcm9hZGNhc3RPcGVuTWVzc2FnZS5jcmVhdGUodGhpcywgbWVzc2FnZUlELCBicm9hZGNhc3RTZW5kZXIsIHBhdGgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWwgPSAoKSA9PiB0aGlzLl9zZW5kTWVzc2FnZShyZXN1bHQpXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOmAmuefpeWvueaWuVwi546w5Zyo6KaB5o6l5pS25oyH5a6a6Lev5b6E55qE5bm/5pKtXCLlpLHotKXjgIJicm9hZGNhc3RTZW5kZXI6JHticm9hZGNhc3RTZW5kZXJ9IHBhdGg6JHtwYXRofWAsIGVycikpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGltZXIgPSBzZXRJbnRlcnZhbChpbnRlcnZhbCwgdGhpcy50aW1lb3V0KTsgICAgLy/liLDkuobml7bpl7TlpoLmnpzov5jmsqHmnInmlLbliLDlr7nmlrnlk43lupTlsLHph43mlrDlj5HpgIHkuIDmrKFcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBpbnRlcnZhbCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWPkemAgUJyb2FkY2FzdENsb3NlTWVzc2FnZVxyXG4gICAgICogQHBhcmFtIGJyb2FkY2FzdFNlbmRlciDlub/mkq3nmoTlj5HpgIHogIVcclxuICAgICAqIEBwYXJhbSBwYXRoIOW5v+aSrei3r+W+hFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kX0Jyb2FkY2FzdENsb3NlTWVzc2FnZShicm9hZGNhc3RTZW5kZXI6IHN0cmluZywgcGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc29ja2V0LmNvbm5lY3RlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlSUQgPSB0aGlzLl9tZXNzYWdlSUQrKztcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IEJyb2FkY2FzdENsb3NlTWVzc2FnZS5jcmVhdGUodGhpcywgbWVzc2FnZUlELCBicm9hZGNhc3RTZW5kZXIsIHBhdGgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWwgPSAoKSA9PiB0aGlzLl9zZW5kTWVzc2FnZShyZXN1bHQpXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOmAmuefpeWvueaWuVwi546w5Zyo5LiN5YaN5o6l5pS25oyH5a6a6Lev5b6E55qE5bm/5pKtXCLlpLHotKXjgIJicm9hZGNhc3RTZW5kZXI6JHticm9hZGNhc3RTZW5kZXJ9IHBhdGg6JHtwYXRofWAsIGVycikpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGltZXIgPSBzZXRJbnRlcnZhbChpbnRlcnZhbCwgdGhpcy50aW1lb3V0KTsgICAgLy/liLDkuobml7bpl7TlpoLmnpzov5jmsqHmnInmlLbliLDlr7nmlrnlk43lupTlsLHph43mlrDlj5HpgIHkuIDmrKFcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLl9vbkNsb3NlLCBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgaW50ZXJ2YWwoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iXX0=
