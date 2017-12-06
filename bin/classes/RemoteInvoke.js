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
        this.printMessage = false; //todo asdasd
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
                        this._messageListener.trigger([msg.type, msg.path], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_response: {
                        const msg = MessageData_1.InvokeResponseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_finish: {
                        const msg = MessageData_1.InvokeFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.responseMessageID], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_failed: {
                        const msg = MessageData_1.InvokeFailedMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_request: {
                        const msg = MessageData_1.InvokeFileRequestMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_response: {
                        const msg = MessageData_1.InvokeFileResponseMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_failed: {
                        const msg = MessageData_1.InvokeFileFailedMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id], msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_finish: {
                        const msg = MessageData_1.InvokeFileFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id], msg);
                        break;
                    }
                    case MessageType_1.MessageType.broadcast: {
                        const msg = MessageData_1.BroadcastMessage.parse(this, p_header, body);
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
                        this._messageListener.receive([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')], msg.path);
                        const result = MessageData_1.BroadcastOpenFinishMessage.create(this, msg).pack();
                        this.socket.send(result[0], result[1])
                            .catch(err => this._printError('响应对方的broadcast_open请求失败', err));
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_open_finish: {
                        const msg = MessageData_1.BroadcastOpenFinishMessage.parse(this, p_header, body);
                        this._messageListener.trigger([msg.type, msg.messageID], msg);
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_close: {
                        const msg = MessageData_1.BroadcastCloseMessage.parse(this, p_header, body);
                        this._messageListener.cancel([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')]); //清除标记
                        const result = MessageData_1.BroadcastCloseFinishMessage.create(this, msg).pack();
                        this.socket.send(result[0], result[1])
                            .catch(err => this._printError('响应对方的broadcast_close请求失败', err));
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_close_finish: {
                        const msg = MessageData_1.BroadcastCloseFinishMessage.parse(this, p_header, body);
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
                const result = MessageData_1.InvokeFailedMessage.create(this, msg, error).pack();
                this.socket.send(result[0], result[1]).catch(err => this._printError('发送"调用失败响应"失败', err));
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
                const result = MessageData_1.BroadcastMessage.create(this, path, data).pack();
                yield this.socket.send(result[0], result[1]);
            }
        });
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
                const result = MessageData_1.InvokeFileRequestMessage.create(this, msg, item.id, ++index).pack();
                timer = setTimeout(() => cb_error(new Error('请求超时')), this.timeout); //设置超时
                this.socket.send(result[0], result[1]).catch(err => { clearTimeout(timer); cb_error(new Error('网络连接异常：' + err)); });
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
            const result = msg.pack();
            yield this.socket.send(result[0], result[1]);
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
                        const result = MessageData_1.InvokeFileFailedMessage.create(this, msg, err).pack();
                        this.socket.send(result[0], result[1]).catch(err => this._printError('向对方发送"请求文件片段失败响应"失败', err));
                        //不允许再下载该文件了
                        this._messageListener.cancel([MessageType_1.MessageType.invoke_file_request, msg.receiver, messageID, item.id]);
                    };
                    const send_finish = (msg) => {
                        const result = MessageData_1.InvokeFileFinishMessage.create(this, msg).pack();
                        this.socket.send(result[0], result[1]).catch(err => this._printError('向对方发送"请求文件片段结束响应"失败', err));
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
                                    .create(this, msg, sendingData.file.slice(index * this.filePieceSize, (index + 1) * this.filePieceSize)).pack();
                                this.socket.send(result[0], result[1]).catch(err => send_error(msg, err));
                            }
                            else {
                                send_finish(msg);
                            }
                        }
                        else {
                            sendingData.file(index)
                                .then(data => {
                                if (Buffer.isBuffer(data)) {
                                    const result = MessageData_1.InvokeFileResponseMessage.create(this, msg, data).pack();
                                    this.socket.send(result[0], result[1]).catch(err => send_error(msg, err));
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
            const result = MessageData_1.BroadcastOpenMessage.create(this, messageID, broadcastSender, path).pack();
            const interval = () => this.socket.send(result[0], result[1])
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
            const result = MessageData_1.BroadcastCloseMessage.create(this, messageID, broadcastSender, path).pack();
            const interval = () => this.socket.send(result[0], result[1])
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsYXNzZXMvUmVtb3RlSW52b2tlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwyQ0FBd0M7QUFFeEMsaURBQWdDO0FBRWhDLDJEQUF3RDtBQUl4RCwrQ0FjdUI7QUFFdkI7SUFvQ0k7OztPQUdHO0lBQ0gsWUFBWSxNQUErQixFQUFFLFVBQWtCO1FBdEM5QyxxQkFBZ0IsR0FBRyxJQUFJLHVCQUFVLEVBQUUsQ0FBQyxDQUFHLGdCQUFnQjtRQUVoRSxlQUFVLEdBQVcsQ0FBQyxDQUFDLENBQUMsVUFBVTtRQU8xQzs7V0FFRztRQUNNLFlBQU8sR0FBVyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztRQUV6Qzs7V0FFRztRQUNNLGtCQUFhLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQztRQU9wQzs7V0FFRztRQUNILGlCQUFZLEdBQVksS0FBSyxDQUFDLENBQUUsYUFBYTtRQUU3Qzs7V0FFRztRQUNILGVBQVUsR0FBWSxJQUFJLENBQUM7UUFPdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFFN0IsTUFBTSxTQUFTLEdBQUcsQ0FBQyxNQUFjLEVBQUUsSUFBWTtZQUMzQyxJQUFJLENBQUM7Z0JBQ0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFcEMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEIsS0FBSyx5QkFBVyxDQUFDLGNBQWMsRUFBRSxDQUFDO3dCQUM5QixNQUFNLEdBQUcsR0FBRyxrQ0FBb0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDN0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO3dCQUVoRSxLQUFLLENB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QUN0RixhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3JCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyx5QkFBVyxDQUFDLFFBQVEsRUFBRSx5QkFBVyxDQUFDLHNCQUFzQixFQUFFLFNBQVMsQ0FBUSxDQUFDLENBQUM7WUFDL0csQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLENBQUMseUJBQVcsQ0FBQyxRQUFRLEVBQUUseUJBQVcsQ0FBQyxzQkFBc0IsRUFBRSxTQUFTLENBQVEsRUFBRTtnQkFDNUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNyQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUMseUJBQVcsQ0FBQyxzQkFBc0IsRUFBRSxTQUFTLENBQVEsQ0FBQyxDQUFDO1lBQ3pGLENBQUMsQ0FBQyxDQUFDO1lBRUgsUUFBUSxFQUFFLENBQUM7UUFDZixDQUFDO0lBQ0wsQ0FBQztDQUNKO0FBMWxCRCxvQ0EwbEJDIiwiZmlsZSI6ImNsYXNzZXMvUmVtb3RlSW52b2tlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRXZlbnRTcGFjZSB9IGZyb20gJ2V2ZW50c3BhY2UnO1xyXG5pbXBvcnQgeyBFdmVudExldmVsIH0gZnJvbSAnZXZlbnRzcGFjZS9iaW4vY2xhc3Nlcy9FdmVudExldmVsJztcclxuaW1wb3J0IGxvZyBmcm9tICdsb2ctZm9ybWF0dGVyJztcclxuXHJcbmltcG9ydCB7IE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9NZXNzYWdlVHlwZSc7XHJcbmltcG9ydCB7IENvbm5lY3Rpb25Tb2NrZXQgfSBmcm9tIFwiLi9Db25uZWN0aW9uU29ja2V0XCI7XHJcbmltcG9ydCB7IEludm9rZVJlY2VpdmluZ0RhdGEsIFJlY2VpdmluZ0ZpbGUgfSBmcm9tICcuLi9pbnRlcmZhY2VzL0ludm9rZVJlY2VpdmluZ0RhdGEnO1xyXG5pbXBvcnQgeyBJbnZva2VTZW5kaW5nRGF0YSwgU2VuZGluZ0ZpbGUgfSBmcm9tICcuLi9pbnRlcmZhY2VzL0ludm9rZVNlbmRpbmdEYXRhJztcclxuaW1wb3J0IHtcclxuICAgIEludm9rZVJlcXVlc3RNZXNzYWdlLFxyXG4gICAgSW52b2tlUmVzcG9uc2VNZXNzYWdlLFxyXG4gICAgSW52b2tlRmluaXNoTWVzc2FnZSxcclxuICAgIEludm9rZUZhaWxlZE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlRmluaXNoTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdE1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RPcGVuTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0Q2xvc2VGaW5pc2hNZXNzYWdlXHJcbn0gZnJvbSAnLi9NZXNzYWdlRGF0YSc7XHJcblxyXG5leHBvcnQgY2xhc3MgUmVtb3RlSW52b2tlIHtcclxuXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlTGlzdGVuZXIgPSBuZXcgRXZlbnRTcGFjZSgpOyAgIC8v5rOo5YaM55qE5ZCE57G75raI5oGv55uR5ZCs5ZmoICAgIFxyXG5cclxuICAgIHByaXZhdGUgX21lc3NhZ2VJRDogbnVtYmVyID0gMDsgLy/oh6rlop7mtojmga/ntKLlvJXnvJblj7dcclxuXHJcbiAgICAvKipcclxuICAgICAqIOi/nuaOpeerr+WPo1xyXG4gICAgICovXHJcbiAgICByZWFkb25seSBzb2NrZXQ6IENvbm5lY3Rpb25Tb2NrZXQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor7fmsYLlk43lupTotoXml7bvvIzpu5jorqQz5YiG6ZKfXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IHRpbWVvdXQ6IG51bWJlciA9IDMgKiA2MCAqIDEwMDA7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDpu5jorqTmlofku7bniYfmrrXlpKflsI8gNTEya2JcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgZmlsZVBpZWNlU2l6ZSA9IDUxMiAqIDEwMjQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPliY3mqKHlnZflkI3np7BcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgbW9kdWxlTmFtZTogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5omT5Y2w5pS25Yiw5ZKM5Y+R6YCB55qE5raI5oGv77yI55So5LqO6LCD6K+V77yJ44CC6buY6K6kZmFsc2VcclxuICAgICAqL1xyXG4gICAgcHJpbnRNZXNzYWdlOiBib29sZWFuID0gZmFsc2U7ICAvL3RvZG8gYXNkYXNkXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKbmiZPljbDns7vnu5/plJnor6/vvIzpu5jorqR0cnVlXHJcbiAgICAgKi9cclxuICAgIHByaW50RXJyb3I6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHBhcmFtIHNvY2tldCDov57mjqXnq6/lj6NcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOW9k+WJjeaooeWdl+eahOWQjeensFxyXG4gICAgICovXHJcbiAgICBjb25zdHJ1Y3Rvcihzb2NrZXQ6IHR5cGVvZiBDb25uZWN0aW9uU29ja2V0LCBtb2R1bGVOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLm1vZHVsZU5hbWUgPSBtb2R1bGVOYW1lO1xyXG5cclxuICAgICAgICBjb25zdCBvbk1lc3NhZ2UgPSAoaGVhZGVyOiBzdHJpbmcsIGJvZHk6IEJ1ZmZlcikgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcF9oZWFkZXIgPSBKU09OLnBhcnNlKGhlYWRlcik7XHJcblxyXG4gICAgICAgICAgICAgICAgc3dpdGNoIChwX2hlYWRlclswXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3JlcXVlc3Q6IHsgIC8v6KKr6LCD55So6ICF5pS25Yiw6LCD55So6K+35rGCXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZVJlcXVlc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cucGF0aF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlOiB7IC8v6LCD55So6ICF5pS25Yiw6LCD55So5ZON5bqUXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maW5pc2g6IHsgICAvL+iiq+iwg+eUqOiAheaUtuWIsOiwg+eUqOe7k+adn+WTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQ6IHsgICAvL+iwg+eUqOiAheaUtuWIsOiwg+eUqOWksei0peWTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGYWlsZWRNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQ6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXZlbnROYW1lID0gW21zZy50eXBlLCBtc2cuc2VuZGVyLCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXNBbmNlc3RvcnMoZXZlbnROYW1lKSkgeyAgIC8v5aaC5p6c5rKh5pyJ5rOo5YaM6L+H6L+Z5Liq5bm/5pKt55qE55uR5ZCs5Zmo77yM5bCx6YCa55+l5a+55pa55LiN6KaB5YaN5Y+R6YCB5LqGXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdENsb3NlTWVzc2FnZShtc2cuc2VuZGVyLCBtc2cucGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckFuY2VzdG9ycyhldmVudE5hbWUsIG1zZy5kYXRhLCB0cnVlLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW46IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55LCBtc2cucGF0aCBhcyBhbnkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZykucGFjaygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflk43lupTlr7nmlrnnmoRicm9hZGNhc3Rfb3Blbuivt+axguWksei0pScsIGVycikpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cubWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0Q2xvc2VNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KTsgIC8v5riF6Zmk5qCH6K6wXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZykucGFjaygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflk43lupTlr7nmlrnnmoRicm9hZGNhc3RfY2xvc2Xor7fmsYLlpLHotKUnLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0Q2xvc2VGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cubWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmnKrnn6Xmtojmga/nsbvlnovvvJoke3BfaGVhZGVyfWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRFcnJvcign5o6l5pS25Yiw55qE5raI5oGv5qC85byP6ZSZ6K+v77yaJywgZXJyb3IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3Qgb25PcGVuID0gKCkgPT4gdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXJEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuX29uT3Blbl0gYXMgYW55KTtcclxuXHJcbiAgICAgICAgY29uc3Qgb25DbG9zZSA9ICgpID0+IHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLl9vbkNsb3NlXSBhcyBhbnkpO1xyXG5cclxuICAgICAgICAvL+W9k+aJk+W8gOerr+WPo+S5i+WQjueri+WIu+mAmuefpeWvueaWueimgeebkeWQrOWTquS6m+W5v+aSrVxyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5fb25PcGVuLCAnX3NlbmRfYnJvYWRjYXN0X29wZW4nXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLl9ldmVudExldmVsLmdldENoaWxkTGV2ZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF0gYXMgYW55LCB0cnVlKVxyXG4gICAgICAgICAgICAgICAgLmNoaWxkcmVuLmZvckVhY2goKGxldmVsLCBicm9hZGNhc3RTZW5kZXIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3JFYWNoTGV2ZWwgPSAobGV2ZWw6IEV2ZW50TGV2ZWwpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxldmVsLnJlY2VpdmVycy5zaXplID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShicm9hZGNhc3RTZW5kZXIsIGxldmVsLnJlY2VpdmVycy52YWx1ZXMoKS5uZXh0KCkudmFsdWUgYXMgYW55KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV2ZWwuY2hpbGRyZW4uZm9yRWFjaChmb3JFYWNoTGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsLmNoaWxkcmVuLmZvckVhY2goZm9yRWFjaExldmVsKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvL+W9k+i/nuaOpeaWreW8gOeri+WIu+a4heeQhuWvueaWueazqOWGjOi/h+eahOW5v+aSrei3r+W+hFxyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgJ19jbGVhbl9vcGVuZWRfYnJvYWRjYXN0J10gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0XSBhcyBhbnkpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLnNvY2tldCA9IG5ldyBzb2NrZXQodGhpcywgb25NZXNzYWdlLCBvbk9wZW4sIG9uQ2xvc2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5a+55aSW5a+85Ye65pa55rOV44CCICAgICBcclxuICAgICAqIOWmguaenOimgeWQkeiwg+eUqOaWueWPjemmiOmUmeivr++8jOebtOaOpSB0aHJvdyBuZXcgRXJyb3IoKSDljbPlj6/jgIIgICAgIFxyXG4gICAgICog5rOo5oSP77ya5a+55LqO5a+85Ye65pa55rOV77yM5b2T5a6D5omn6KGM5a6M5oiQ77yM6L+U5Zue57uT5p6c5ZCO5bCx5LiN5Y+v5Lul5YaN57un57ut5LiL6L295paH5Lu25LqG44CCICAgICBcclxuICAgICAqIOazqOaEj++8muS4gOS4qnBhdGjkuIrlj6rlhYHorrjlr7zlh7rkuIDkuKrmlrnms5XjgILlpoLmnpzph43lpI3lr7zlh7rliJnlkI7pnaLnmoTlupTor6Xopobnm5bmjonliY3pnaLnmoTjgIIgICAgIFxyXG4gICAgICogQHBhcmFtIHBhdGgg5omA5a+85Ye655qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZnVuYyDlr7zlh7rnmoTmlrnms5UgXHJcbiAgICAgKi9cclxuICAgIGV4cG9ydDxGIGV4dGVuZHMgKGRhdGE6IEludm9rZVJlY2VpdmluZ0RhdGEpID0+IFByb21pc2U8dm9pZCB8IEludm9rZVNlbmRpbmdEYXRhPj4ocGF0aDogc3RyaW5nLCBmdW5jOiBGKTogRiB7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxFeHBvcnQocGF0aCk7XHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLmludm9rZV9yZXF1ZXN0LCBwYXRoXSBhcyBhbnksIGFzeW5jIChtc2c6IEludm9rZVJlcXVlc3RNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgZGF0YSwgY2xlYW4gfSA9IHRoaXMuX3ByZXBhcmVfSW52b2tlUmVjZWl2aW5nRGF0YShtc2cpO1xyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZ1bmMoZGF0YSkgfHwgeyBkYXRhOiBudWxsIH07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBybSA9IEludm9rZVJlc3BvbnNlTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCB0aGlzLl9tZXNzYWdlSUQrKywgcmVzdWx0KTtcclxuXHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChybS5maWxlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5fcHJlcGFyZV9JbnZva2VTZW5kaW5nRGF0YShybSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xlYW4gPSBhd2FpdCB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoLCBybS5yZWNlaXZlciwgcm0ucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoLCBybS5yZWNlaXZlciwgcm0ucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSwgY2xlYW4pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRFcnJvcign5Y+R6YCBXCLosIPnlKjlk43lupRcIuWksei0pScsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IEludm9rZUZhaWxlZE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZXJyb3IpLnBhY2soKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc29ja2V0LnNlbmQocmVzdWx0WzBdLCByZXN1bHRbMV0pLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflj5HpgIFcIuiwg+eUqOWksei0peWTjeW6lFwi5aSx6LSlJywgZXJyKSk7XHJcbiAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICBjbGVhbigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBmdW5jO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+W5raI5a+55aSW5a+85Ye655qE5pa55rOVXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDkuYvliY3lr7zlh7rnmoTot6/lvoRcclxuICAgICAqL1xyXG4gICAgY2FuY2VsRXhwb3J0KHBhdGg6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9yZXF1ZXN0LCBwYXRoXSBhcyBhbnkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6LCD55So6L+c56uv5qih5Z2X5a+85Ye655qE5pa55rOV44CC55u05o6l6L+U5Zue5pWw5o2u5LiO5paH5Lu2XHJcbiAgICAgKiBAcGFyYW0gcmVjZWl2ZXIg6L+c56uv5qih5Z2X55qE5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDmlrnms5XnmoTot6/lvoRcclxuICAgICAqIEBwYXJhbSBkYXRhIOimgeS8oOmAkueahOaVsOaNrlxyXG4gICAgICovXHJcbiAgICBpbnZva2UocmVjZWl2ZXI6IHN0cmluZywgcGF0aDogc3RyaW5nLCBkYXRhOiBJbnZva2VTZW5kaW5nRGF0YSk6IFByb21pc2U8eyBkYXRhOiBhbnksIGZpbGVzOiB7IG5hbWU6IHN0cmluZywgZGF0YTogQnVmZmVyIH1bXSB9PlxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjov5znq6/mqKHlnZflr7zlh7rnmoTmlrnms5XjgIJcclxuICAgICAqIEBwYXJhbSByZWNlaXZlciDov5znq6/mqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSBwYXRoIOaWueazleeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5Lyg6YCS55qE5pWw5o2uXHJcbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sg5o6l5pS25ZON5bqU5pWw5o2u55qE5Zue6LCD44CC5rOo5oSP77ya5LiA5pem5Zue6LCD5omn6KGM5a6M5oiQ5bCx5LiN6IO95YaN5LiL6L295paH5Lu25LqG44CCXHJcbiAgICAgKi9cclxuICAgIGludm9rZShyZWNlaXZlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhLCBjYWxsYmFjazogKGVycjogRXJyb3IgfCB1bmRlZmluZWQsIGRhdGE6IEludm9rZVJlY2VpdmluZ0RhdGEpID0+IFByb21pc2U8dm9pZD4pOiB2b2lkXHJcbiAgICBpbnZva2UocmVjZWl2ZXI6IHN0cmluZywgcGF0aDogc3RyaW5nLCBkYXRhOiBJbnZva2VTZW5kaW5nRGF0YSwgY2FsbGJhY2s/OiAoZXJyOiBFcnJvciB8IHVuZGVmaW5lZCwgZGF0YTogSW52b2tlUmVjZWl2aW5nRGF0YSkgPT4gUHJvbWlzZTx2b2lkPik6IGFueSB7XHJcbiAgICAgICAgY29uc3Qgcm0gPSBJbnZva2VSZXF1ZXN0TWVzc2FnZS5jcmVhdGUodGhpcywgdGhpcy5fbWVzc2FnZUlEKyssIHJlY2VpdmVyLCBwYXRoLCBkYXRhKTtcclxuXHJcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB7ICAgLy/lm57osIPlh73mlbDniYjmnKxcclxuICAgICAgICAgICAgdGhpcy5fcHJlcGFyZV9JbnZva2VTZW5kaW5nRGF0YShybSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSkudGhlbihjbGVhblJlcXVlc3QgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2UsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnksIChtc2c6IEludm9rZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgZGF0YSwgY2xlYW4gfSA9IHRoaXMuX3ByZXBhcmVfSW52b2tlUmVjZWl2aW5nRGF0YShtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIGRhdGEpLnRoZW4oY2xlYW4pLmNhdGNoKGVyciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGVycjtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KS5jYXRjaChjYWxsYmFjayBhcyBhbnkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oY2xlYW5SZXF1ZXN0ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9yZXNwb25zZSwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgYXN5bmMgKG1zZzogSW52b2tlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB7IGRhdGEsIGNsZWFuIH0gPSB0aGlzLl9wcmVwYXJlX0ludm9rZVJlY2VpdmluZ0RhdGEobXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQ6IHsgbmFtZTogc3RyaW5nLCBkYXRhOiBCdWZmZXIgfVtdID0gW107XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEuZmlsZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh7IG5hbWU6IGl0ZW0ubmFtZSwgZGF0YTogYXdhaXQgaXRlbS5nZXRGaWxlKCkgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW4oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBkYXRhOiBkYXRhLmRhdGEsIGZpbGVzOiByZXN1bHQgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2gocmVqZWN0KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM5bm/5pKt55uR5ZCs5ZmoICAgICAgXHJcbiAgICAgKiBAcGFyYW0gc2VuZGVyIOWPkemAgeiAhVxyXG4gICAgICogQHBhcmFtIG5hbWUg5bm/5pKt55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZnVuYyDlr7nlupTnmoTlm57osIPmlrnms5VcclxuICAgICAqL1xyXG4gICAgcmVjZWl2ZTxGIGV4dGVuZHMgKGFyZzogYW55KSA9PiBhbnk+KHNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGZ1bmM6IEYpOiBGIHtcclxuICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbTWVzc2FnZVR5cGUuYnJvYWRjYXN0LCBzZW5kZXIsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55O1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXMoZXZlbnROYW1lKSkgeyAgLy/lpoLmnpzov5jmsqHms6jlhozov4fvvIzpgJrnn6Xlr7nmlrnnjrDlnKjopoHmjqXmlLbmjIflrprot6/lvoTlub/mkq1cclxuICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShzZW5kZXIsIHBhdGgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoZXZlbnROYW1lLCBmdW5jKTsgLy/kuI3ljIXoo4XkuIDkuIvnm5HlkKzlmajvvIzmmK/kuLrkuobogIPomZHliLBjYW5jZWxSZWNlaXZlXHJcbiAgICAgICAgcmV0dXJuIGZ1bmM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTmjIflrprot6/lvoTkuIrnmoTmiYDmnInlub/mkq3nm5HlkKzlmajvvIzlj6/ku6XkvKDpgJLkuIDkuKpsaXN0ZW5lcuadpeWPquWIoOmZpOS4gOS4queJueWumueahOebkeWQrOWZqFxyXG4gICAgICogQHBhcmFtIHNlbmRlciDlj5HpgIHogIVcclxuICAgICAqIEBwYXJhbSBuYW1lIOW5v+aSreeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGxpc3RlbmVyIOimgeaMh+WumuWIoOmZpOeahOebkeWQrOWZqFxyXG4gICAgICovXHJcbiAgICBjYW5jZWxSZWNlaXZlKHNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGxpc3RlbmVyPzogKGFyZzogYW55KSA9PiBhbnkpIHtcclxuICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbTWVzc2FnZVR5cGUuYnJvYWRjYXN0LCBzZW5kZXIsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55O1xyXG5cclxuICAgICAgICBpZiAodGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhcyhldmVudE5hbWUpKSB7ICAvL+ehruS/neecn+eahOacieazqOWGjOi/h+WGjeaJp+ihjOWIoOmZpFxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKGV2ZW50TmFtZSwgbGlzdGVuZXIpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCF0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzKGV2ZW50TmFtZSkpIHsgICAgLy/lpoLmnpzliKDlhYnkuobvvIzlsLHpgJrnn6Xlr7nmlrnkuI3lho3mjqXmlLbkuoZcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKHNlbmRlciwgcGF0aCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlr7nlpJblub/mkq3mlbDmja5cclxuICAgICAqIEBwYXJhbSBwYXRoIOW5v+aSreeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5Y+R6YCB55qE5pWw5o2uXHJcbiAgICAgKi9cclxuICAgIGFzeW5jIGJyb2FkY2FzdChwYXRoOiBzdHJpbmcsIGRhdGE6IGFueSA9IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICAvL+WIpOaWreWvueaWueaYr+WQpuazqOWGjOeahOacieWFs+S6jui/meadoeW5v+aSreeahOebkeWQrOWZqFxyXG4gICAgICAgIGlmICh0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzQW5jZXN0b3JzKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3QsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KSkge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBCcm9hZGNhc3RNZXNzYWdlLmNyZWF0ZSh0aGlzLCBwYXRoLCBkYXRhKS5wYWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc29ja2V0LnNlbmQocmVzdWx0WzBdLCByZXN1bHRbMV0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaJk+WNsOmUmeivr+a2iOaBr1xyXG4gICAgICogQHBhcmFtIGRlc2Mg5o+P6L+wIFxyXG4gICAgICogQHBhcmFtIGVyciDplJnor6/kv6Hmga9cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfcHJpbnRFcnJvcihkZXNjOiBzdHJpbmcsIGVycjogRXJyb3IpIHtcclxuICAgICAgICBpZiAodGhpcy5wcmludEVycm9yKVxyXG4gICAgICAgICAgICBsb2cud2FyblxyXG4gICAgICAgICAgICAgICAgLmxvY2F0aW9uLndoaXRlXHJcbiAgICAgICAgICAgICAgICAudGl0bGUueWVsbG93XHJcbiAgICAgICAgICAgICAgICAuY29udGVudC55ZWxsb3coJ3JlbW90ZS1pbnZva2UnLCBkZXNjLCBlcnIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5YeG5aSH5aW95LiL6L295Zue6LCD44CC6L+U5ZueSW52b2tlUmVjZWl2aW5nRGF0YeS4jua4heeQhui1hOa6kOWbnuiwg1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9wcmVwYXJlX0ludm9rZVJlY2VpdmluZ0RhdGEobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VJRCA9IG1zZyBpbnN0YW5jZW9mIEludm9rZVJlcXVlc3RNZXNzYWdlID8gbXNnLnJlcXVlc3RNZXNzYWdlSUQgOiBtc2cucmVzcG9uc2VNZXNzYWdlSUQ7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGVzID0gbXNnLmZpbGVzLm1hcChpdGVtID0+IHtcclxuICAgICAgICAgICAgbGV0IHN0YXJ0OiBib29sZWFuID0gZmFsc2U7ICAgICAgICAgICAgIC8v5piv5ZCm5bey57uP5byA5aeL6I635Y+W5LqG77yM5Li76KaB5piv55So5LqO6Ziy5q2i6YeN5aSN5LiL6L29XHJcbiAgICAgICAgICAgIGxldCBpbmRleCA9IC0xOyAgICAgICAgICAgICAgICAgICAgICAgICAvL+eOsOWcqOaOpeaUtuWIsOesrOWHoOS4quaWh+S7tueJh+auteS6hlxyXG4gICAgICAgICAgICBsZXQgZG93bmxvYWRlZFNpemUgPSAwOyAgICAgICAgICAgICAgICAgLy/lt7LkuIvovb3lpKflsI9cclxuICAgICAgICAgICAgbGV0IHRpbWVyOiBOb2RlSlMuVGltZXI7ICAgICAgICAgICAgICAgIC8v6LaF5pe26K6h5pe25ZmoXHJcblxyXG4gICAgICAgICAgICBjb25zdCBkb3dubG9hZE5leHQgPSAoKSA9PiB7ICAgICAgICAgICAgLy/kuIvovb3kuIvkuIDkuKrmlofku7bniYfmrrVcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBpdGVtLmlkLCArK2luZGV4KS5wYWNrKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IGNiX2Vycm9yKG5ldyBFcnJvcign6K+35rGC6LaF5pe2JykpLCB0aGlzLnRpbWVvdXQpOyAgLy/orr7nva7otoXml7ZcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKS5jYXRjaChlcnIgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyBjYl9lcnJvcihuZXcgRXJyb3IoJ+e9kee7nOi/nuaOpeW8guW4uO+8micgKyBlcnIpKTsgfSk7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBsZXQgY2JfZXJyb3I6IChlcnI6IEVycm9yKSA9PiB2b2lkOyAvL+S4i+i9veWHuumUmeWbnuiwg1xyXG4gICAgICAgICAgICBsZXQgY2JfcmVjZWl2ZTogKGRhdGE6IEJ1ZmZlciwgaXNFbmQ6IGJvb2xlYW4pID0+IHZvaWQ7IC8v5o6l5pS25paH5Lu25Zue6LCDXHJcblxyXG4gICAgICAgICAgICAvL+ebkeWQrOS4i+i9veWIsOeahOaWh+S7tlxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChtc2cuaW5kZXggIT09IGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2JfZXJyb3IobmV3IEVycm9yKCfmlofku7blnKjkvKDovpPov4fnqIvkuK3vvIzpobrluo/lj5HnlJ/plJnkubEnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGRvd25sb2FkZWRTaXplICs9IG1zZy5kYXRhLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLnNpemUgIT0gbnVsbCAmJiBkb3dubG9hZGVkU2l6ZSA+IGl0ZW0uc2l6ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yKG5ldyBFcnJvcign5LiL6L295Yiw55qE5paH5Lu25aSn5bCP6LaF5Ye65LqG5Y+R6YCB6ICF5omA5o+P6L+w55qE5aSn5bCPJykpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjYl9yZWNlaXZlKG1zZy5kYXRhLCBpdGVtLnNwbGl0TnVtYmVyICE9IG51bGwgJiYgaW5kZXggKyAxID49IGl0ZW0uc3BsaXROdW1iZXIpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8v55uR5ZCs5LiL6L295paH5Lu25aSx6LSlXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIGNiX2Vycm9yKG5ldyBFcnJvcihtc2cuZXJyb3IpKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvL+ebkeWQrOS4i+i9veaWh+S7tue7k+adn1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmluaXNoLCBtc2cuc2VuZGVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICBjYl9yZWNlaXZlKEJ1ZmZlci5hbGxvYygwKSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBSZWNlaXZpbmdGaWxlID0ge1xyXG4gICAgICAgICAgICAgICAgc2l6ZTogaXRlbS5zaXplLFxyXG4gICAgICAgICAgICAgICAgc3BsaXROdW1iZXI6IGl0ZW0uc3BsaXROdW1iZXIsXHJcbiAgICAgICAgICAgICAgICBuYW1lOiBpdGVtLm5hbWUsXHJcbiAgICAgICAgICAgICAgICBvbkRhdGE6IChjYWxsYmFjaywgc3RhcnRJbmRleCA9IDApID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgKDxhbnk+Y2FsbGJhY2spKG5ldyBFcnJvcign5LiN5Y+v6YeN5aSN5LiL6L295paH5Lu2JykpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBzdGFydEluZGV4IC0gMTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yID0gZXJyID0+IHsgKDxhbnk+Y2FsbGJhY2spKGVycik7IGNiX2Vycm9yID0gKCkgPT4geyB9IH07ICAgLy/noa7kv53lj6rop6blj5HkuIDmrKFcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2JfcmVjZWl2ZSA9IChkYXRhLCBpc0VuZCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzRW5kKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgaXNFbmQsIGluZGV4LCBkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIGlzRW5kLCBpbmRleCwgZGF0YSkudGhlbihyZXN1bHQgPT4gcmVzdWx0ICE9PSB0cnVlICYmIGRvd25sb2FkTmV4dCgpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvd25sb2FkTmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBnZXRGaWxlOiAoKSA9PiBuZXcgUHJvbWlzZTxCdWZmZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHsgICAvL+S4i+i9veaWh+S7tuWbnuiwg1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFydCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCfkuI3lj6/ph43lpI3kuIvovb3mlofku7YnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlUGllY2VzOiBCdWZmZXJbXSA9IFtdOyAgICAvL+S4i+i9veWIsOeahOaWh+S7tueJh+autVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY2JfZXJyb3IgPSByZWplY3Q7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX3JlY2VpdmUgPSAoZGF0YSwgaXNFbmQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbGVQaWVjZXMucHVzaChkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzRW5kID8gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGZpbGVQaWVjZXMpKSA6IGRvd25sb2FkTmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgZG93bmxvYWROZXh0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgZGF0YTogeyBkYXRhOiBtc2cuZGF0YSwgZmlsZXMgfSxcclxuICAgICAgICAgICAgY2xlYW46ICgpID0+IHsgLy/muIXnkIbotYTmupBcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZCwgbXNnLnNlbmRlciwgbWVzc2FnZUlEXSBhcyBhbnksIHsgZXJyb3I6ICfkuIvovb3nu4jmraInIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkLCBtc2cuc2VuZGVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaCwgbXNnLnNlbmRlciwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWHhuWkh+WPkemAgeaWh+S7tu+8jOi/lOWbnua4heeQhui1hOa6kOWbnuiwg+OAguWmguaenOi2heaXtuS8muiHquWKqOa4heeQhui1hOa6kFxyXG4gICAgICogQHBhcmFtIG1zZyDopoHlj5HpgIHnmoTmlbDmja5cclxuICAgICAqIEBwYXJhbSBvblRpbWVvdXQg5rKh5pyJ5paH5Lu26K+35rGC6LaF5pe2XHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgX3ByZXBhcmVfSW52b2tlU2VuZGluZ0RhdGEobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSwgb25UaW1lb3V0PzogKCkgPT4gdm9pZCkge1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IG1zZy5wYWNrKCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5zb2NrZXQuc2VuZChyZXN1bHRbMF0sIHJlc3VsdFsxXSk7XHJcblxyXG4gICAgICAgIGlmIChtc2cuZmlsZXMubGVuZ3RoID4gMCkgeyAvL+WHhuWkh+aWh+S7tuWPkemAgVxyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlSUQgPSBtc2cgaW5zdGFuY2VvZiBJbnZva2VSZXF1ZXN0TWVzc2FnZSA/IG1zZy5yZXF1ZXN0TWVzc2FnZUlEIDogbXNnLnJlc3BvbnNlTWVzc2FnZUlEO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xlYW4gPSAoKSA9PiB7ICAvL+a4heeQhui1hOa6kOWbnuiwg1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiB7IGNsZWFuKCk7IG9uVGltZW91dCAmJiBvblRpbWVvdXQoKTsgfTtcclxuXHJcbiAgICAgICAgICAgIGxldCB0aW1lciA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy50aW1lb3V0KTsgICAgLy/otoXml7borqHml7blmahcclxuXHJcbiAgICAgICAgICAgIG1zZy5maWxlcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICAgICAgbGV0IHNlbmRpbmdEYXRhID0gaXRlbS5fZGF0YSBhcyBTZW5kaW5nRmlsZTtcclxuICAgICAgICAgICAgICAgIGxldCBpbmRleCA9IDA7ICAgIC8v6K6w5b2V55So5oi36K+35rGC5Yiw5LqG56ys5Yeg5Liq5paH5Lu254mH5q615LqGXHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VuZF9lcnJvciA9IChtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSwgZXJyOiBFcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyhlcnIsIHVuZGVmaW5lZCBhcyBhbnkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBlcnIpLnBhY2soKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKS5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcign5ZCR5a+55pa55Y+R6YCBXCLor7fmsYLmlofku7bniYfmrrXlpLHotKXlk43lupRcIuWksei0pScsIGVycikpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvL+S4jeWFgeiuuOWGjeS4i+i9veivpeaWh+S7tuS6hlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbWVzc2FnZUlELCBpdGVtLmlkXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlbmRfZmluaXNoID0gKG1zZzogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZykucGFjaygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc29ja2V0LnNlbmQocmVzdWx0WzBdLCByZXN1bHRbMV0pLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflkJHlr7nmlrnlj5HpgIFcIuivt+axguaWh+S7tueJh+autee7k+adn+WTjeW6lFwi5aSx6LSlJywgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8v5LiN5YWB6K645YaN5LiL6L296K+l5paH5Lu25LqGXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRpbWVyID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLnRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLmluZGV4ID4gaW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBtc2cuaW5kZXg7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9lcnJvcihtc2csIG5ldyBFcnJvcign6YeN5aSN5LiL6L295paH5Lu254mH5q61JykpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHNlbmRpbmdEYXRhLmZpbGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA8IChpdGVtLnNwbGl0TnVtYmVyIGFzIG51bWJlcikpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyh1bmRlZmluZWQsIChpbmRleCArIDEpIC8gKGl0ZW0uc3BsaXROdW1iZXIgYXMgbnVtYmVyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jcmVhdGUodGhpcywgbXNnLCBzZW5kaW5nRGF0YS5maWxlLnNsaWNlKGluZGV4ICogdGhpcy5maWxlUGllY2VTaXplLCAoaW5kZXggKyAxKSAqIHRoaXMuZmlsZVBpZWNlU2l6ZSkpLnBhY2soKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKS5jYXRjaChlcnIgPT4gc2VuZF9lcnJvcihtc2csIGVycikpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9maW5pc2gobXNnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLmZpbGUoaW5kZXgpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbihkYXRhID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKGRhdGEpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZGF0YSkucGFjaygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKS5jYXRjaChlcnIgPT4gc2VuZF9lcnJvcihtc2csIGVycikpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRfZmluaXNoKG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kX2Vycm9yKG1zZywgZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBjbGVhbjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gKCkgPT4geyB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAgKiDlj5HpgIFCcm9hZGNhc3RPcGVuTWVzc2FnZVxyXG4gICAgICAqIEBwYXJhbSBicm9hZGNhc3RTZW5kZXIg5bm/5pKt55qE5Y+R6YCB6ICFXHJcbiAgICAgICogQHBhcmFtIHBhdGgg5bm/5pKt6Lev5b6EXHJcbiAgICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5zb2NrZXQuY29ubmVjdGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VJRCA9IHRoaXMuX21lc3NhZ2VJRCsrO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1lc3NhZ2VJRCwgYnJvYWRjYXN0U2VuZGVyLCBwYXRoKS5wYWNrKCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBpbnRlcnZhbCA9ICgpID0+IHRoaXMuc29ja2V0LnNlbmQocmVzdWx0WzBdLCByZXN1bHRbMV0pXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOmAmuefpeWvueaWuVwi546w5Zyo6KaB5o6l5pS25oyH5a6a6Lev5b6E55qE5bm/5pKtXCLlpLHotKXjgIJicm9hZGNhc3RTZW5kZXI6JHticm9hZGNhc3RTZW5kZXJ9IHBhdGg6JHtwYXRofWAsIGVycikpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGltZXIgPSBzZXRJbnRlcnZhbChpbnRlcnZhbCwgdGhpcy50aW1lb3V0KTsgICAgLy/liLDkuobml7bpl7TlpoLmnpzov5jmsqHmnInmlLbliLDlr7nmlrnlk43lupTlsLHph43mlrDlj5HpgIHkuIDmrKFcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBpbnRlcnZhbCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWPkemAgUJyb2FkY2FzdENsb3NlTWVzc2FnZVxyXG4gICAgICogQHBhcmFtIGJyb2FkY2FzdFNlbmRlciDlub/mkq3nmoTlj5HpgIHogIVcclxuICAgICAqIEBwYXJhbSBwYXRoIOW5v+aSrei3r+W+hFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kX0Jyb2FkY2FzdENsb3NlTWVzc2FnZShicm9hZGNhc3RTZW5kZXI6IHN0cmluZywgcGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc29ja2V0LmNvbm5lY3RlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlSUQgPSB0aGlzLl9tZXNzYWdlSUQrKztcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IEJyb2FkY2FzdENsb3NlTWVzc2FnZS5jcmVhdGUodGhpcywgbWVzc2FnZUlELCBicm9hZGNhc3RTZW5kZXIsIHBhdGgpLnBhY2soKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGludGVydmFsID0gKCkgPT4gdGhpcy5zb2NrZXQuc2VuZChyZXN1bHRbMF0sIHJlc3VsdFsxXSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg6YCa55+l5a+55pa5XCLnjrDlnKjkuI3lho3mjqXmlLbmjIflrprot6/lvoTnmoTlub/mkq1cIuWksei0peOAgmJyb2FkY2FzdFNlbmRlcjoke2Jyb2FkY2FzdFNlbmRlcn0gcGF0aDoke3BhdGh9YCwgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldEludGVydmFsKGludGVydmFsLCB0aGlzLnRpbWVvdXQpOyAgICAvL+WIsOS6huaXtumXtOWmguaenOi/mOayoeacieaUtuWIsOWvueaWueWTjeW6lOWwsemHjeaWsOWPkemAgeS4gOasoVxyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBpbnRlcnZhbCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSJdfQ==
