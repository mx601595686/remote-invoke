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
        this.socket = socket;
        if (this.socket.ri != null)
            throw new Error('传入的ConnectionSocket已在其他地方被使用');
        this.socket.ri = this;
        this.socket.onMessage = (header, body) => {
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
        this.socket.onOpen = () => this._messageListener.triggerDescendants([MessageType_1.MessageType._onOpen]);
        this.socket.onClose = () => this._messageListener.triggerDescendants([MessageType_1.MessageType._onClose]);
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUMsQ0FBQztZQUN6RixDQUFDLENBQUMsQ0FBQztZQUVILFFBQVEsRUFBRSxDQUFDO1FBQ2YsQ0FBQztJQUNMLENBQUM7Q0FDSjtBQWhwQkQsb0NBZ3BCQyIsImZpbGUiOiJjbGFzc2VzL1JlbW90ZUludm9rZS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEV2ZW50U3BhY2UgfSBmcm9tICdldmVudHNwYWNlJztcclxuaW1wb3J0IHsgRXZlbnRMZXZlbCB9IGZyb20gJ2V2ZW50c3BhY2UvYmluL2NsYXNzZXMvRXZlbnRMZXZlbCc7XHJcbmltcG9ydCBsb2cgZnJvbSAnbG9nLWZvcm1hdHRlcic7XHJcblxyXG5pbXBvcnQgeyBNZXNzYWdlVHlwZSB9IGZyb20gJy4uL2ludGVyZmFjZXMvTWVzc2FnZVR5cGUnO1xyXG5pbXBvcnQgeyBDb25uZWN0aW9uU29ja2V0IH0gZnJvbSBcIi4uL2ludGVyZmFjZXMvQ29ubmVjdGlvblNvY2tldFwiO1xyXG5pbXBvcnQgeyBJbnZva2VSZWNlaXZpbmdEYXRhLCBSZWNlaXZpbmdGaWxlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9JbnZva2VSZWNlaXZpbmdEYXRhJztcclxuaW1wb3J0IHsgSW52b2tlU2VuZGluZ0RhdGEsIFNlbmRpbmdGaWxlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9JbnZva2VTZW5kaW5nRGF0YSc7XHJcbmltcG9ydCB7XHJcbiAgICBJbnZva2VSZXF1ZXN0TWVzc2FnZSxcclxuICAgIEludm9rZVJlc3BvbnNlTWVzc2FnZSxcclxuICAgIEludm9rZUZpbmlzaE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGYWlsZWRNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVGYWlsZWRNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0T3Blbk1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdENsb3NlTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdENsb3NlRmluaXNoTWVzc2FnZSxcclxuICAgIE1lc3NhZ2VEYXRhXHJcbn0gZnJvbSAnLi9NZXNzYWdlRGF0YSc7XHJcblxyXG5leHBvcnQgY2xhc3MgUmVtb3RlSW52b2tlIHtcclxuXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlTGlzdGVuZXIgPSBuZXcgRXZlbnRTcGFjZSgpOyAgIC8v5rOo5YaM55qE5ZCE57G75raI5oGv55uR5ZCs5ZmoICAgIFxyXG5cclxuICAgIHByaXZhdGUgX21lc3NhZ2VJRDogbnVtYmVyID0gMDsgLy/oh6rlop7mtojmga/ntKLlvJXnvJblj7dcclxuXHJcbiAgICAvKipcclxuICAgICAqIOi/nuaOpeerr+WPo1xyXG4gICAgICovXHJcbiAgICByZWFkb25seSBzb2NrZXQ6IENvbm5lY3Rpb25Tb2NrZXQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor7fmsYLlk43lupTotoXml7bvvIzpu5jorqQz5YiG6ZKfXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IHRpbWVvdXQ6IG51bWJlciA9IDMgKiA2MCAqIDEwMDA7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDpu5jorqTmlofku7bniYfmrrXlpKflsI8gNTEya2JcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgZmlsZVBpZWNlU2l6ZSA9IDUxMiAqIDEwMjQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPliY3mqKHlnZflkI3np7BcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgbW9kdWxlTmFtZTogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5omT5Y2w5pS25Yiw5ZKM5Y+R6YCB55qE5raI5oGv77yI55So5LqO6LCD6K+V77yJ44CC6buY6K6kZmFsc2VcclxuICAgICAqL1xyXG4gICAgcHJpbnRNZXNzYWdlOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKbmiZPljbDns7vnu5/plJnor6/vvIzpu5jorqR0cnVlXHJcbiAgICAgKi9cclxuICAgIHByaW50RXJyb3I6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHBhcmFtIHNvY2tldCDov57mjqXnq6/lj6NcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOW9k+WJjeaooeWdl+eahOWQjeensFxyXG4gICAgICovXHJcbiAgICBjb25zdHJ1Y3Rvcihzb2NrZXQ6IENvbm5lY3Rpb25Tb2NrZXQsIG1vZHVsZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMubW9kdWxlTmFtZSA9IG1vZHVsZU5hbWU7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQgPSBzb2NrZXQ7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNvY2tldC5yaSAhPSBudWxsKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+S8oOWFpeeahENvbm5lY3Rpb25Tb2NrZXTlt7LlnKjlhbbku5blnLDmlrnooqvkvb/nlKgnKTtcclxuXHJcbiAgICAgICAgdGhpcy5zb2NrZXQucmkgPSB0aGlzO1xyXG5cclxuICAgICAgICB0aGlzLnNvY2tldC5vbk1lc3NhZ2UgPSAoaGVhZGVyOiBzdHJpbmcsIGJvZHk6IEJ1ZmZlcikgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcF9oZWFkZXIgPSBKU09OLnBhcnNlKGhlYWRlcik7XHJcblxyXG4gICAgICAgICAgICAgICAgc3dpdGNoIChwX2hlYWRlclswXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3JlcXVlc3Q6IHsgIC8v6KKr6LCD55So6ICF5pS25Yiw6LCD55So6K+35rGCXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZVJlcXVlc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cucGF0aF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlOiB7IC8v6LCD55So6ICF5pS25Yiw6LCD55So5ZON5bqUXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maW5pc2g6IHsgICAvL+iiq+iwg+eUqOiAheaUtuWIsOiwg+eUqOe7k+adn+WTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQ6IHsgICAvL+iwg+eUqOiAheaUtuWIsOiwg+eUqOWksei0peWTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGYWlsZWRNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQ6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXZlbnROYW1lID0gW21zZy50eXBlLCBtc2cuc2VuZGVyLCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXNBbmNlc3RvcnMoZXZlbnROYW1lKSkgeyAgIC8v5aaC5p6c5rKh5pyJ5rOo5YaM6L+H6L+Z5Liq5bm/5pKt55qE55uR5ZCs5Zmo77yM5bCx6YCa55+l5a+55pa55LiN6KaB5YaN5Y+R6YCB5LqGXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdENsb3NlTWVzc2FnZShtc2cuc2VuZGVyLCBtc2cucGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckFuY2VzdG9ycyhldmVudE5hbWUsIG1zZy5kYXRhLCB0cnVlLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW46IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0LCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnksIG1zZy5wYXRoIGFzIGFueSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcign5ZON5bqU5a+55pa555qEYnJvYWRjYXN0X29wZW7or7fmsYLlpLHotKUnLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLm1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdENsb3NlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KTsgIC8v5riF6Zmk5qCH6K6wXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZykpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WTjeW6lOWvueaWueeahGJyb2FkY2FzdF9jbG9zZeivt+axguWksei0pScsIGVycikpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5tZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOacquefpea2iOaBr+exu+Wei++8miR7cF9oZWFkZXJ9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmludEVycm9yKCfmjqXmlLbliLDnmoTmtojmga/moLzlvI/plJnor6/vvJonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnNvY2tldC5vbk9wZW4gPSAoKSA9PiB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5fb25PcGVuXSBhcyBhbnkpO1xyXG5cclxuICAgICAgICB0aGlzLnNvY2tldC5vbkNsb3NlID0gKCkgPT4gdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXJEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuX29uQ2xvc2VdIGFzIGFueSk7XHJcblxyXG4gICAgICAgIC8v5b2T5omT5byA56uv5Y+j5LmL5ZCO56uL5Yi76YCa55+l5a+55pa56KaB55uR5ZCs5ZOq5Lqb5bm/5pKtXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLl9vbk9wZW4sICdfc2VuZF9icm9hZGNhc3Rfb3BlbiddIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuX2V2ZW50TGV2ZWwuZ2V0Q2hpbGRMZXZlbChbTWVzc2FnZVR5cGUuYnJvYWRjYXN0XSBhcyBhbnksIHRydWUpXHJcbiAgICAgICAgICAgICAgICAuY2hpbGRyZW4uZm9yRWFjaCgobGV2ZWwsIGJyb2FkY2FzdFNlbmRlcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvckVhY2hMZXZlbCA9IChsZXZlbDogRXZlbnRMZXZlbCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGV2ZWwucmVjZWl2ZXJzLnNpemUgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKGJyb2FkY2FzdFNlbmRlciwgbGV2ZWwucmVjZWl2ZXJzLnZhbHVlcygpLm5leHQoKS52YWx1ZSBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXZlbC5jaGlsZHJlbi5mb3JFYWNoKGZvckVhY2hMZXZlbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWwuY2hpbGRyZW4uZm9yRWFjaChmb3JFYWNoTGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8v5b2T6L+e5o6l5pat5byA56uL5Yi75riF55CG5a+55pa55rOo5YaM6L+H55qE5bm/5pKt6Lev5b6EXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLl9vbkNsb3NlLCAnX2NsZWFuX29wZW5lZF9icm9hZGNhc3QnXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbERlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3RdIGFzIGFueSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlr7nlpJblr7zlh7rmlrnms5XjgIIgICAgIFxyXG4gICAgICog5aaC5p6c6KaB5ZCR6LCD55So5pa55Y+N6aaI6ZSZ6K+v77yM55u05o6lIHRocm93IG5ldyBFcnJvcigpIOWNs+WPr+OAgiAgICAgXHJcbiAgICAgKiDms6jmhI/vvJrlr7nkuo7lr7zlh7rmlrnms5XvvIzlvZPlroPmiafooYzlrozmiJDvvIzov5Tlm57nu5PmnpzlkI7lsLHkuI3lj6/ku6Xlho3nu6fnu63kuIvovb3mlofku7bkuobjgIIgICAgIFxyXG4gICAgICog5rOo5oSP77ya5LiA5LiqcGF0aOS4iuWPquWFgeiuuOWvvOWHuuS4gOS4quaWueazleOAguWmguaenOmHjeWkjeWvvOWHuuWImeWQjumdoueahOW6lOivpeimhuebluaOieWJjemdoueahOOAgiAgICAgXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDmiYDlr7zlh7rnmoTot6/lvoRcclxuICAgICAqIEBwYXJhbSBmdW5jIOWvvOWHuueahOaWueazlSBcclxuICAgICAqL1xyXG4gICAgZXhwb3J0PEYgZXh0ZW5kcyAoZGF0YTogSW52b2tlUmVjZWl2aW5nRGF0YSkgPT4gUHJvbWlzZTx2b2lkIHwgSW52b2tlU2VuZGluZ0RhdGE+PihwYXRoOiBzdHJpbmcsIGZ1bmM6IEYpOiBGIHtcclxuICAgICAgICB0aGlzLmNhbmNlbEV4cG9ydChwYXRoKTtcclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX3JlcXVlc3QsIHBhdGhdIGFzIGFueSwgYXN5bmMgKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeyBkYXRhLCBjbGVhbiB9ID0gdGhpcy5fcHJlcGFyZV9JbnZva2VSZWNlaXZpbmdEYXRhKG1zZyk7XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZnVuYyhkYXRhKSB8fCB7IGRhdGE6IG51bGwgfTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJtID0gSW52b2tlUmVzcG9uc2VNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2csIHRoaXMuX21lc3NhZ2VJRCsrLCByZXN1bHQpO1xyXG5cclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJtLmZpbGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbGVhbiA9IGF3YWl0IHRoaXMuX3ByZXBhcmVfSW52b2tlU2VuZGluZ0RhdGEocm0sICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9maW5pc2gsIHJtLnJlY2VpdmVyLCBybS5yZXNwb25zZU1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9maW5pc2gsIHJtLnJlY2VpdmVyLCBybS5yZXNwb25zZU1lc3NhZ2VJRF0gYXMgYW55LCBjbGVhbik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludEVycm9yKCflj5HpgIFcIuiwg+eUqOWTjeW6lFwi5aSx6LSlJywgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoSW52b2tlRmFpbGVkTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBlcnJvcikpXHJcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflj5HpgIFcIuiwg+eUqOWksei0peWTjeW6lFwi5aSx6LSlJywgZXJyKSk7XHJcbiAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICBjbGVhbigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBmdW5jO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+W5raI5a+55aSW5a+85Ye655qE5pa55rOVXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDkuYvliY3lr7zlh7rnmoTot6/lvoRcclxuICAgICAqL1xyXG4gICAgY2FuY2VsRXhwb3J0KHBhdGg6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9yZXF1ZXN0LCBwYXRoXSBhcyBhbnkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6LCD55So6L+c56uv5qih5Z2X5a+85Ye655qE5pa55rOV44CC55u05o6l6L+U5Zue5pWw5o2u5LiO5paH5Lu2XHJcbiAgICAgKiBAcGFyYW0gcmVjZWl2ZXIg6L+c56uv5qih5Z2X55qE5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDmlrnms5XnmoTot6/lvoRcclxuICAgICAqIEBwYXJhbSBkYXRhIOimgeS8oOmAkueahOaVsOaNrlxyXG4gICAgICovXHJcbiAgICBpbnZva2UocmVjZWl2ZXI6IHN0cmluZywgcGF0aDogc3RyaW5nLCBkYXRhOiBJbnZva2VTZW5kaW5nRGF0YSk6IFByb21pc2U8eyBkYXRhOiBhbnksIGZpbGVzOiB7IG5hbWU6IHN0cmluZywgZGF0YTogQnVmZmVyIH1bXSB9PlxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjov5znq6/mqKHlnZflr7zlh7rnmoTmlrnms5XjgIJcclxuICAgICAqIEBwYXJhbSByZWNlaXZlciDov5znq6/mqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSBwYXRoIOaWueazleeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5Lyg6YCS55qE5pWw5o2uXHJcbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sg5o6l5pS25ZON5bqU5pWw5o2u55qE5Zue6LCD44CC5rOo5oSP77ya5LiA5pem5Zue6LCD5omn6KGM5a6M5oiQ5bCx5LiN6IO95YaN5LiL6L295paH5Lu25LqG44CCXHJcbiAgICAgKi9cclxuICAgIGludm9rZShyZWNlaXZlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhLCBjYWxsYmFjazogKGVycjogRXJyb3IgfCB1bmRlZmluZWQsIGRhdGE6IEludm9rZVJlY2VpdmluZ0RhdGEpID0+IFByb21pc2U8dm9pZD4pOiB2b2lkXHJcbiAgICBpbnZva2UocmVjZWl2ZXI6IHN0cmluZywgcGF0aDogc3RyaW5nLCBkYXRhOiBJbnZva2VTZW5kaW5nRGF0YSwgY2FsbGJhY2s/OiAoZXJyOiBFcnJvciB8IHVuZGVmaW5lZCwgZGF0YTogSW52b2tlUmVjZWl2aW5nRGF0YSkgPT4gUHJvbWlzZTx2b2lkPik6IGFueSB7XHJcbiAgICAgICAgY29uc3Qgcm0gPSBJbnZva2VSZXF1ZXN0TWVzc2FnZS5jcmVhdGUodGhpcywgdGhpcy5fbWVzc2FnZUlEKyssIHJlY2VpdmVyLCBwYXRoLCBkYXRhKTtcclxuXHJcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB7ICAgLy/lm57osIPlh73mlbDniYjmnKxcclxuICAgICAgICAgICAgdGhpcy5fcHJlcGFyZV9JbnZva2VTZW5kaW5nRGF0YShybSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSkudGhlbihjbGVhblJlcXVlc3QgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2UsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnksIChtc2c6IEludm9rZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgZGF0YSwgY2xlYW4gfSA9IHRoaXMuX3ByZXBhcmVfSW52b2tlUmVjZWl2aW5nRGF0YShtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIGRhdGEpLnRoZW4oY2xlYW4pLmNhdGNoKGVyciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGVycjtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KS5jYXRjaChjYWxsYmFjayBhcyBhbnkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oY2xlYW5SZXF1ZXN0ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9yZXNwb25zZSwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgYXN5bmMgKG1zZzogSW52b2tlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB7IGRhdGEsIGNsZWFuIH0gPSB0aGlzLl9wcmVwYXJlX0ludm9rZVJlY2VpdmluZ0RhdGEobXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQ6IHsgbmFtZTogc3RyaW5nLCBkYXRhOiBCdWZmZXIgfVtdID0gW107XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEuZmlsZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh7IG5hbWU6IGl0ZW0ubmFtZSwgZGF0YTogYXdhaXQgaXRlbS5nZXRGaWxlKCkgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW4oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBkYXRhOiBkYXRhLmRhdGEsIGZpbGVzOiByZXN1bHQgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2gocmVqZWN0KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM5bm/5pKt55uR5ZCs5ZmoICAgICAgXHJcbiAgICAgKiBAcGFyYW0gc2VuZGVyIOWPkemAgeiAhVxyXG4gICAgICogQHBhcmFtIG5hbWUg5bm/5pKt55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZnVuYyDlr7nlupTnmoTlm57osIPmlrnms5VcclxuICAgICAqL1xyXG4gICAgcmVjZWl2ZTxGIGV4dGVuZHMgKGFyZzogYW55KSA9PiBhbnk+KHNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGZ1bmM6IEYpOiBGIHtcclxuICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbTWVzc2FnZVR5cGUuYnJvYWRjYXN0LCBzZW5kZXIsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55O1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXMoZXZlbnROYW1lKSkgeyAgLy/lpoLmnpzov5jmsqHms6jlhozov4fvvIzpgJrnn6Xlr7nmlrnnjrDlnKjopoHmjqXmlLbmjIflrprot6/lvoTlub/mkq1cclxuICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShzZW5kZXIsIHBhdGgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoZXZlbnROYW1lLCBmdW5jKTsgLy/kuI3ljIXoo4XkuIDkuIvnm5HlkKzlmajvvIzmmK/kuLrkuobogIPomZHliLBjYW5jZWxSZWNlaXZlXHJcbiAgICAgICAgcmV0dXJuIGZ1bmM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTmjIflrprot6/lvoTkuIrnmoTmiYDmnInlub/mkq3nm5HlkKzlmajvvIzlj6/ku6XkvKDpgJLkuIDkuKpsaXN0ZW5lcuadpeWPquWIoOmZpOS4gOS4queJueWumueahOebkeWQrOWZqFxyXG4gICAgICogQHBhcmFtIHNlbmRlciDlj5HpgIHogIVcclxuICAgICAqIEBwYXJhbSBuYW1lIOW5v+aSreeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGxpc3RlbmVyIOimgeaMh+WumuWIoOmZpOeahOebkeWQrOWZqFxyXG4gICAgICovXHJcbiAgICBjYW5jZWxSZWNlaXZlKHNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGxpc3RlbmVyPzogKGFyZzogYW55KSA9PiBhbnkpIHtcclxuICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbTWVzc2FnZVR5cGUuYnJvYWRjYXN0LCBzZW5kZXIsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55O1xyXG5cclxuICAgICAgICBpZiAodGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhcyhldmVudE5hbWUpKSB7ICAvL+ehruS/neecn+eahOacieazqOWGjOi/h+WGjeaJp+ihjOWIoOmZpFxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKGV2ZW50TmFtZSwgbGlzdGVuZXIpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCF0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzKGV2ZW50TmFtZSkpIHsgICAgLy/lpoLmnpzliKDlhYnkuobvvIzlsLHpgJrnn6Xlr7nmlrnkuI3lho3mjqXmlLbkuoZcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKHNlbmRlciwgcGF0aCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlr7nlpJblub/mkq3mlbDmja5cclxuICAgICAqIEBwYXJhbSBwYXRoIOW5v+aSreeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5Y+R6YCB55qE5pWw5o2uXHJcbiAgICAgKi9cclxuICAgIGFzeW5jIGJyb2FkY2FzdChwYXRoOiBzdHJpbmcsIGRhdGE6IGFueSA9IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICAvL+WIpOaWreWvueaWueaYr+WQpuazqOWGjOeahOacieWFs+S6jui/meadoeW5v+aSreeahOebkeWQrOWZqFxyXG4gICAgICAgIGlmICh0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzQW5jZXN0b3JzKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3QsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KSkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9zZW5kTWVzc2FnZShCcm9hZGNhc3RNZXNzYWdlLmNyZWF0ZSh0aGlzLCBwYXRoLCBkYXRhKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5L6/5LqO5L2/55Soc29ja2V05Y+R6YCB5raI5oGvXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3NlbmRNZXNzYWdlKG1zZzogTWVzc2FnZURhdGEpIHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBtc2cucGFjaygpO1xyXG4gICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZSh0cnVlLCBtc2cpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5zb2NrZXQuc2VuZChyZXN1bHRbMF0sIHJlc3VsdFsxXSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmiZPljbDplJnor6/mtojmga9cclxuICAgICAqIEBwYXJhbSBkZXNjIOaPj+i/sCBcclxuICAgICAqIEBwYXJhbSBlcnIg6ZSZ6K+v5L+h5oGvXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3ByaW50RXJyb3IoZGVzYzogc3RyaW5nLCBlcnI6IEVycm9yKSB7XHJcbiAgICAgICAgaWYgKHRoaXMucHJpbnRFcnJvcilcclxuICAgICAgICAgICAgbG9nLndhcm5cclxuICAgICAgICAgICAgICAgIC5sb2NhdGlvbi53aGl0ZVxyXG4gICAgICAgICAgICAgICAgLnRpdGxlLnllbGxvd1xyXG4gICAgICAgICAgICAgICAgLmNvbnRlbnQueWVsbG93KCdyZW1vdGUtaW52b2tlJywgZGVzYywgZXJyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaJk+WNsOaUtuWIsOaIluWPkemAgeeahOa2iOaBr1xyXG4gICAgICogQHBhcmFtIHNlbmRPclJlY2VpdmUg5aaC5p6c5piv5Y+R6YCB5YiZ5Li6dHJ1Ze+8jOWmguaenOaYr+aOpeaUtuWImeS4umZhbHNlXHJcbiAgICAgKiBAcGFyYW0gZGVzYyDmj4/ov7BcclxuICAgICAqIEBwYXJhbSBkYXRhIOimgeaJk+WNsOeahOaVsOaNrlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9wcmludE1lc3NhZ2Uoc2VuZE9yUmVjZWl2ZTogYm9vbGVhbiwgbXNnOiBNZXNzYWdlRGF0YSkge1xyXG4gICAgICAgIGlmICh0aGlzLnByaW50TWVzc2FnZSlcclxuICAgICAgICAgICAgaWYgKHNlbmRPclJlY2VpdmUpXHJcbiAgICAgICAgICAgICAgICBsb2dcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uY3lhbi5ib2xkXHJcbiAgICAgICAgICAgICAgICAgICAgLnRpdGxlXHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQoJ3JlbW90ZS1pbnZva2UnLCAn5Y+R6YCBJywgTWVzc2FnZVR5cGVbbXNnLnR5cGVdLCBKU09OLnN0cmluZ2lmeShtc2csIHVuZGVmaW5lZCwgMikpO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBsb2dcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uZ3JlZW4uYm9sZFxyXG4gICAgICAgICAgICAgICAgICAgIC50aXRsZVxyXG4gICAgICAgICAgICAgICAgICAgIC5jb250ZW50KCdyZW1vdGUtaW52b2tlJywgJ+aUtuWIsCcsIE1lc3NhZ2VUeXBlW21zZy50eXBlXSwgSlNPTi5zdHJpbmdpZnkobXNnLCB1bmRlZmluZWQsIDIpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWHhuWkh+WlveS4i+i9veWbnuiwg+OAgui/lOWbnkludm9rZVJlY2VpdmluZ0RhdGHkuI7muIXnkIbotYTmupDlm57osINcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfcHJlcGFyZV9JbnZva2VSZWNlaXZpbmdEYXRhKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UgfCBJbnZva2VSZXNwb25zZU1lc3NhZ2UpIHtcclxuICAgICAgICBjb25zdCBtZXNzYWdlSUQgPSBtc2cgaW5zdGFuY2VvZiBJbnZva2VSZXF1ZXN0TWVzc2FnZSA/IG1zZy5yZXF1ZXN0TWVzc2FnZUlEIDogbXNnLnJlc3BvbnNlTWVzc2FnZUlEO1xyXG5cclxuICAgICAgICBjb25zdCBmaWxlcyA9IG1zZy5maWxlcy5tYXAoaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBzdGFydDogYm9vbGVhbiA9IGZhbHNlOyAgICAgICAgICAgICAvL+aYr+WQpuW3sue7j+W8gOWni+iOt+WPluS6hu+8jOS4u+imgeaYr+eUqOS6jumYsuatoumHjeWkjeS4i+i9vVxyXG4gICAgICAgICAgICBsZXQgaW5kZXggPSAtMTsgICAgICAgICAgICAgICAgICAgICAgICAgLy/njrDlnKjmjqXmlLbliLDnrKzlh6DkuKrmlofku7bniYfmrrXkuoZcclxuICAgICAgICAgICAgbGV0IGRvd25sb2FkZWRTaXplID0gMDsgICAgICAgICAgICAgICAgIC8v5bey5LiL6L295aSn5bCPXHJcbiAgICAgICAgICAgIGxldCB0aW1lcjogTm9kZUpTLlRpbWVyOyAgICAgICAgICAgICAgICAvL+i2heaXtuiuoeaXtuWZqFxyXG5cclxuICAgICAgICAgICAgY29uc3QgZG93bmxvYWROZXh0ID0gKCkgPT4geyAgICAgICAgICAgIC8v5LiL6L295LiL5LiA5Liq5paH5Lu254mH5q61XHJcbiAgICAgICAgICAgICAgICB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4gY2JfZXJyb3IobmV3IEVycm9yKCfor7fmsYLotoXml7YnKSksIHRoaXMudGltZW91dCk7ICAvL+iuvue9rui2heaXtlxyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBpdGVtLmlkLCArK2luZGV4KSlcclxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHsgY2xlYXJUaW1lb3V0KHRpbWVyKTsgY2JfZXJyb3IobmV3IEVycm9yKCfnvZHnu5zov57mjqXlvILluLjvvJonICsgZXJyKSk7IH0pO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgbGV0IGNiX2Vycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZDsgLy/kuIvovb3lh7rplJnlm57osINcclxuICAgICAgICAgICAgbGV0IGNiX3JlY2VpdmU6IChkYXRhOiBCdWZmZXIsIGlzRW5kOiBib29sZWFuKSA9PiB2b2lkOyAvL+aOpeaUtuaWh+S7tuWbnuiwg1xyXG5cclxuICAgICAgICAgICAgLy/nm5HlkKzkuIvovb3liLDnmoTmlofku7ZcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3Jlc3BvbnNlLCBtc2cuc2VuZGVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAobXNnLmluZGV4ICE9PSBpbmRleCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yKG5ldyBFcnJvcign5paH5Lu25Zyo5Lyg6L6T6L+H56iL5Lit77yM6aG65bqP5Y+R55Sf6ZSZ5LmxJykpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBkb3dubG9hZGVkU2l6ZSArPSBtc2cuZGF0YS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5zaXplICE9IG51bGwgJiYgZG93bmxvYWRlZFNpemUgPiBpdGVtLnNpemUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjYl9lcnJvcihuZXcgRXJyb3IoJ+S4i+i9veWIsOeahOaWh+S7tuWkp+Wwj+i2heWHuuS6huWPkemAgeiAheaJgOaPj+i/sOeahOWkp+WwjycpKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY2JfcmVjZWl2ZShtc2cuZGF0YSwgaXRlbS5zcGxpdE51bWJlciAhPSBudWxsICYmIGluZGV4ICsgMSA+PSBpdGVtLnNwbGl0TnVtYmVyKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvL+ebkeWQrOS4i+i9veaWh+S7tuWksei0pVxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkLCBtc2cuc2VuZGVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICBjYl9lcnJvcihuZXcgRXJyb3IobXNnLmVycm9yKSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy/nm5HlkKzkuIvovb3mlofku7bnu5PmnZ9cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaCwgbXNnLnNlbmRlciwgbWVzc2FnZUlELCBpdGVtLmlkXSBhcyBhbnksIChtc2c6IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgY2JfcmVjZWl2ZShCdWZmZXIuYWxsb2MoMCksIHRydWUpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogUmVjZWl2aW5nRmlsZSA9IHtcclxuICAgICAgICAgICAgICAgIHNpemU6IGl0ZW0uc2l6ZSxcclxuICAgICAgICAgICAgICAgIHNwbGl0TnVtYmVyOiBpdGVtLnNwbGl0TnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgbmFtZTogaXRlbS5uYW1lLFxyXG4gICAgICAgICAgICAgICAgb25EYXRhOiAoY2FsbGJhY2ssIHN0YXJ0SW5kZXggPSAwKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXJ0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICg8YW55PmNhbGxiYWNrKShuZXcgRXJyb3IoJ+S4jeWPr+mHjeWkjeS4i+i9veaWh+S7ticpKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4ID0gc3RhcnRJbmRleCAtIDE7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYl9lcnJvciA9IGVyciA9PiB7ICg8YW55PmNhbGxiYWNrKShlcnIpOyBjYl9lcnJvciA9ICgpID0+IHsgfSB9OyAgIC8v56Gu5L+d5Y+q6Kem5Y+R5LiA5qyhXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX3JlY2VpdmUgPSAoZGF0YSwgaXNFbmQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0VuZClcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIGlzRW5kLCBpbmRleCwgZGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCBpc0VuZCwgaW5kZXgsIGRhdGEpLnRoZW4ocmVzdWx0ID0+IHJlc3VsdCAhPT0gdHJ1ZSAmJiBkb3dubG9hZE5leHQoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkb3dubG9hZE5leHQoKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0RmlsZTogKCkgPT4gbmV3IFByb21pc2U8QnVmZmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7ICAgLy/kuIvovb3mlofku7blm57osINcclxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcign5LiN5Y+v6YeN5aSN5LiL6L295paH5Lu2JykpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZVBpZWNlczogQnVmZmVyW10gPSBbXTsgICAgLy/kuIvovb3liLDnmoTmlofku7bniYfmrrVcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yID0gcmVqZWN0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYl9yZWNlaXZlID0gKGRhdGEsIGlzRW5kKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWxlUGllY2VzLnB1c2goZGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0VuZCA/IHJlc29sdmUoQnVmZmVyLmNvbmNhdChmaWxlUGllY2VzKSkgOiBkb3dubG9hZE5leHQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvd25sb2FkTmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGRhdGE6IHsgZGF0YTogbXNnLmRhdGEsIGZpbGVzIH0sXHJcbiAgICAgICAgICAgIGNsZWFuOiAoKSA9PiB7IC8v5riF55CG6LWE5rqQXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRF0gYXMgYW55LCB7IGVycm9yOiAn5LiL6L2957uI5q2iJyB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3Jlc3BvbnNlLCBtc2cuc2VuZGVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZCwgbXNnLnNlbmRlciwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbERlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2gsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlh4blpIflj5HpgIHmlofku7bvvIzov5Tlm57muIXnkIbotYTmupDlm57osIPjgILlpoLmnpzotoXml7bkvJroh6rliqjmuIXnkIbotYTmupBcclxuICAgICAqIEBwYXJhbSBtc2cg6KaB5Y+R6YCB55qE5pWw5o2uXHJcbiAgICAgKiBAcGFyYW0gb25UaW1lb3V0IOayoeacieaWh+S7tuivt+axgui2heaXtlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIF9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UgfCBJbnZva2VSZXNwb25zZU1lc3NhZ2UsIG9uVGltZW91dD86ICgpID0+IHZvaWQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLl9zZW5kTWVzc2FnZShtc2cpO1xyXG5cclxuICAgICAgICBpZiAobXNnLmZpbGVzLmxlbmd0aCA+IDApIHsgLy/lh4blpIfmlofku7blj5HpgIFcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZUlEID0gbXNnIGluc3RhbmNlb2YgSW52b2tlUmVxdWVzdE1lc3NhZ2UgPyBtc2cucmVxdWVzdE1lc3NhZ2VJRCA6IG1zZy5yZXNwb25zZU1lc3NhZ2VJRDtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuID0gKCkgPT4geyAgLy/muIXnkIbotYTmupDlm57osINcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4geyBjbGVhbigpOyBvblRpbWVvdXQgJiYgb25UaW1lb3V0KCk7IH07XHJcblxyXG4gICAgICAgICAgICBsZXQgdGltZXIgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMudGltZW91dCk7ICAgIC8v6LaF5pe26K6h5pe25ZmoXHJcblxyXG4gICAgICAgICAgICBtc2cuZmlsZXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgICAgIGxldCBzZW5kaW5nRGF0YSA9IGl0ZW0uX2RhdGEgYXMgU2VuZGluZ0ZpbGU7XHJcbiAgICAgICAgICAgICAgICBsZXQgaW5kZXggPSAwOyAgICAvL+iusOW9leeUqOaIt+ivt+axguWIsOS6huesrOWHoOS4quaWh+S7tueJh+auteS6hlxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlbmRfZXJyb3IgPSAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsIGVycjogRXJyb3IpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBzZW5kaW5nRGF0YS5vblByb2dyZXNzICYmIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MoZXJyLCB1bmRlZmluZWQgYXMgYW55KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZXJyKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflkJHlr7nmlrnlj5HpgIFcIuivt+axguaWh+S7tueJh+auteWksei0peWTjeW6lFwi5aSx6LSlJywgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8v5LiN5YWB6K645YaN5LiL6L296K+l5paH5Lu25LqGXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VuZF9maW5pc2ggPSAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShJbnZva2VGaWxlRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflkJHlr7nmlrnlj5HpgIFcIuivt+axguaWh+S7tueJh+autee7k+adn+WTjeW6lFwi5aSx6LSlJywgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8v5LiN5YWB6K645YaN5LiL6L296K+l5paH5Lu25LqGXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRpbWVyID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLnRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLmluZGV4ID4gaW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBtc2cuaW5kZXg7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9lcnJvcihtc2csIG5ldyBFcnJvcign6YeN5aSN5LiL6L295paH5Lu254mH5q61JykpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHNlbmRpbmdEYXRhLmZpbGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA8IChpdGVtLnNwbGl0TnVtYmVyIGFzIG51bWJlcikpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyh1bmRlZmluZWQsIChpbmRleCArIDEpIC8gKGl0ZW0uc3BsaXROdW1iZXIgYXMgbnVtYmVyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jcmVhdGUodGhpcywgbXNnLCBzZW5kaW5nRGF0YS5maWxlLnNsaWNlKGluZGV4ICogdGhpcy5maWxlUGllY2VTaXplLCAoaW5kZXggKyAxKSAqIHRoaXMuZmlsZVBpZWNlU2l6ZSkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKHJlc3VsdCkuY2F0Y2goZXJyID0+IHNlbmRfZXJyb3IobXNnLCBlcnIpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRfZmluaXNoKG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kaW5nRGF0YS5maWxlKGluZGV4KVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4oZGF0YSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2csIGRhdGEpKS5jYXRjaChlcnIgPT4gc2VuZF9lcnJvcihtc2csIGVycikpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRfZmluaXNoKG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kX2Vycm9yKG1zZywgZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBjbGVhbjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gKCkgPT4geyB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAgKiDlj5HpgIFCcm9hZGNhc3RPcGVuTWVzc2FnZVxyXG4gICAgICAqIEBwYXJhbSBicm9hZGNhc3RTZW5kZXIg5bm/5pKt55qE5Y+R6YCB6ICFXHJcbiAgICAgICogQHBhcmFtIHBhdGgg5bm/5pKt6Lev5b6EXHJcbiAgICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5zb2NrZXQuY29ubmVjdGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VJRCA9IHRoaXMuX21lc3NhZ2VJRCsrO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1lc3NhZ2VJRCwgYnJvYWRjYXN0U2VuZGVyLCBwYXRoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGludGVydmFsID0gKCkgPT4gdGhpcy5fc2VuZE1lc3NhZ2UocmVzdWx0KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDpgJrnn6Xlr7nmlrlcIueOsOWcqOimgeaOpeaUtuaMh+Wumui3r+W+hOeahOW5v+aSrVwi5aSx6LSl44CCYnJvYWRjYXN0U2VuZGVyOiR7YnJvYWRjYXN0U2VuZGVyfSBwYXRoOiR7cGF0aH1gLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0SW50ZXJ2YWwoaW50ZXJ2YWwsIHRoaXMudGltZW91dCk7ICAgIC8v5Yiw5LqG5pe26Ze05aaC5p6c6L+Y5rKh5pyJ5pS25Yiw5a+55pa55ZON5bqU5bCx6YeN5paw5Y+R6YCB5LiA5qyhXHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgaW50ZXJ2YWwoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlj5HpgIFCcm9hZGNhc3RDbG9zZU1lc3NhZ2VcclxuICAgICAqIEBwYXJhbSBicm9hZGNhc3RTZW5kZXIg5bm/5pKt55qE5Y+R6YCB6ICFXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDlub/mkq3ot6/lvoRcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZF9Ccm9hZGNhc3RDbG9zZU1lc3NhZ2UoYnJvYWRjYXN0U2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZykge1xyXG4gICAgICAgIGlmICh0aGlzLnNvY2tldC5jb25uZWN0ZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZUlEID0gdGhpcy5fbWVzc2FnZUlEKys7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1lc3NhZ2VJRCwgYnJvYWRjYXN0U2VuZGVyLCBwYXRoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGludGVydmFsID0gKCkgPT4gdGhpcy5fc2VuZE1lc3NhZ2UocmVzdWx0KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDpgJrnn6Xlr7nmlrlcIueOsOWcqOS4jeWGjeaOpeaUtuaMh+Wumui3r+W+hOeahOW5v+aSrVwi5aSx6LSl44CCYnJvYWRjYXN0U2VuZGVyOiR7YnJvYWRjYXN0U2VuZGVyfSBwYXRoOiR7cGF0aH1gLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0SW50ZXJ2YWwoaW50ZXJ2YWwsIHRoaXMudGltZW91dCk7ICAgIC8v5Yiw5LqG5pe26Ze05aaC5p6c6L+Y5rKh5pyJ5pS25Yiw5a+55pa55ZON5bqU5bCx6YeN5paw5Y+R6YCB5LiA5qyhXHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLl9vbkNsb3NlLCBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGludGVydmFsKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59Il19
