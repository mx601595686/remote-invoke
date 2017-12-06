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
        const cleanMessageListener = () => {
            this._messageListener.cancel([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID]);
            this._messageListener.cancel([MessageType_1.MessageType.invoke_failed, rm.receiver, rm.requestMessageID]);
        };
        if (callback) {
            this._prepare_InvokeSendingData(rm, cleanMessageListener).then(cleanSendRequest => {
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID], (msg) => {
                    cleanSendRequest();
                    cleanMessageListener();
                    const { data, clean } = this._prepare_InvokeReceivingData(msg);
                    callback(undefined, data).then(clean).catch(err => { clean(); throw err; });
                });
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_failed, rm.receiver, rm.requestMessageID], (msg) => {
                    cleanSendRequest();
                    cleanMessageListener();
                    callback(new Error(msg.error));
                });
            }).catch(callback);
        }
        else {
            return new Promise((resolve, reject) => {
                this._prepare_InvokeSendingData(rm, cleanMessageListener).then(cleanSendRequest => {
                    this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID], (msg) => __awaiter(this, void 0, void 0, function* () {
                        cleanSendRequest();
                        cleanMessageListener();
                        const { data, clean } = this._prepare_InvokeReceivingData(msg);
                        try {
                            const result = [];
                            for (const item of data.files) {
                                result.push({ name: item.name, data: yield item.getFile() });
                            }
                            resolve({ data: data.data, files: result });
                        }
                        catch (error) {
                            reject(error);
                        }
                        finally {
                            clean();
                        }
                    }));
                    this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_failed, rm.receiver, rm.requestMessageID], (msg) => {
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QVcsQ0FBQyx5Q0FBeUMsZUFBZSxTQUFTLElBQUksRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFbEgsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBSSx3QkFBd0I7WUFFOUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxDQUFDLHlCQUFXLENBQUMsc0JBQXNCLEVBQUUsU0FBUyxDQUFRLEVBQUU7Z0JBQ3RGLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDckIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDLHlCQUFXLENBQUMsUUFBUSxFQUFFLHlCQUFXLENBQUMsc0JBQXNCLEVBQUUsU0FBUyxDQUFRLENBQUMsQ0FBQztZQUMvRyxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyx5QkFBVyxDQUFDLFFBQVEsRUFBRSx5QkFBVyxDQUFDLHNCQUFzQixFQUFFLFNBQVMsQ0FBUSxFQUFFO2dCQUM1RyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3JCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyx5QkFBVyxDQUFDLHNCQUFzQixFQUFFLFNBQVMsQ0FBUSxDQUFDLENBQUM7WUFDekYsQ0FBQyxDQUFDLENBQUM7WUFFSCxRQUFRLEVBQUUsQ0FBQztRQUNmLENBQUM7SUFDTCxDQUFDO0NBQ0o7QUE5cEJELG9DQThwQkMiLCJmaWxlIjoiY2xhc3Nlcy9SZW1vdGVJbnZva2UuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFdmVudFNwYWNlIH0gZnJvbSAnZXZlbnRzcGFjZSc7XHJcbmltcG9ydCB7IEV2ZW50TGV2ZWwgfSBmcm9tICdldmVudHNwYWNlL2Jpbi9jbGFzc2VzL0V2ZW50TGV2ZWwnO1xyXG5pbXBvcnQgbG9nIGZyb20gJ2xvZy1mb3JtYXR0ZXInO1xyXG5cclxuaW1wb3J0IHsgTWVzc2FnZVR5cGUgfSBmcm9tICcuLi9pbnRlcmZhY2VzL01lc3NhZ2VUeXBlJztcclxuaW1wb3J0IHsgQ29ubmVjdGlvblNvY2tldCB9IGZyb20gXCIuLi9pbnRlcmZhY2VzL0Nvbm5lY3Rpb25Tb2NrZXRcIjtcclxuaW1wb3J0IHsgSW52b2tlUmVjZWl2aW5nRGF0YSwgUmVjZWl2aW5nRmlsZSB9IGZyb20gJy4uL2ludGVyZmFjZXMvSW52b2tlUmVjZWl2aW5nRGF0YSc7XHJcbmltcG9ydCB7IEludm9rZVNlbmRpbmdEYXRhLCBTZW5kaW5nRmlsZSB9IGZyb20gJy4uL2ludGVyZmFjZXMvSW52b2tlU2VuZGluZ0RhdGEnO1xyXG5pbXBvcnQge1xyXG4gICAgSW52b2tlUmVxdWVzdE1lc3NhZ2UsXHJcbiAgICBJbnZva2VSZXNwb25zZU1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaW5pc2hNZXNzYWdlLFxyXG4gICAgSW52b2tlRmFpbGVkTWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0TWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdE9wZW5NZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UsXHJcbiAgICBNZXNzYWdlRGF0YVxyXG59IGZyb20gJy4vTWVzc2FnZURhdGEnO1xyXG5cclxuZXhwb3J0IGNsYXNzIFJlbW90ZUludm9rZSB7XHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfbWVzc2FnZUxpc3RlbmVyID0gbmV3IEV2ZW50U3BhY2UoKTsgICAvL+azqOWGjOeahOWQhOexu+a2iOaBr+ebkeWQrOWZqCAgICBcclxuXHJcbiAgICBwcml2YXRlIF9tZXNzYWdlSUQ6IG51bWJlciA9IDA7IC8v6Ieq5aKe5raI5oGv57Si5byV57yW5Y+3XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDov57mjqXnq6/lj6NcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgc29ja2V0OiBDb25uZWN0aW9uU29ja2V0O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6K+35rGC5ZON5bqU6LaF5pe277yM6buY6K6kM+WIhumSn1xyXG4gICAgICovXHJcbiAgICByZWFkb25seSB0aW1lb3V0OiBudW1iZXIgPSAzICogNjAgKiAxMDAwO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6buY6K6k5paH5Lu254mH5q615aSn5bCPIDUxMmtiXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IGZpbGVQaWVjZVNpemUgPSA1MTIgKiAxMDI0O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5b2T5YmN5qih5Z2X5ZCN56ewXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IG1vZHVsZU5hbWU6IHN0cmluZztcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuaJk+WNsOaUtuWIsOWSjOWPkemAgeeahOa2iOaBr++8iOeUqOS6juiwg+ivle+8ieOAgum7mOiupGZhbHNlXHJcbiAgICAgKi9cclxuICAgIHByaW50TWVzc2FnZTogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5omT5Y2w57O757uf6ZSZ6K+v77yM6buY6K6kdHJ1ZVxyXG4gICAgICovXHJcbiAgICBwcmludEVycm9yOiBib29sZWFuID0gdHJ1ZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEBwYXJhbSBzb2NrZXQg6L+e5o6l56uv5Y+jXHJcbiAgICAgKiBAcGFyYW0gbW9kdWxlTmFtZSDlvZPliY3mqKHlnZfnmoTlkI3np7BcclxuICAgICAqL1xyXG4gICAgY29uc3RydWN0b3Ioc29ja2V0OiBDb25uZWN0aW9uU29ja2V0LCBtb2R1bGVOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLm1vZHVsZU5hbWUgPSBtb2R1bGVOYW1lO1xyXG4gICAgICAgIHRoaXMuc29ja2V0ID0gc29ja2V0O1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zb2NrZXQucmkgIT0gbnVsbClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfkvKDlhaXnmoRDb25uZWN0aW9uU29ja2V05bey5Zyo5YW25LuW5Zyw5pa56KKr5L2/55SoJyk7XHJcblxyXG4gICAgICAgIHRoaXMuc29ja2V0LnJpID0gdGhpcztcclxuXHJcbiAgICAgICAgdGhpcy5zb2NrZXQub25NZXNzYWdlID0gKGhlYWRlcjogc3RyaW5nLCBib2R5OiBCdWZmZXIpID0+IHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBfaGVhZGVyID0gSlNPTi5wYXJzZShoZWFkZXIpO1xyXG5cclxuICAgICAgICAgICAgICAgIHN3aXRjaCAocF9oZWFkZXJbMF0pIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9yZXF1ZXN0OiB7ICAvL+iiq+iwg+eUqOiAheaUtuWIsOiwg+eUqOivt+axglxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VSZXF1ZXN0TWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnBhdGhdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9yZXNwb25zZTogeyAvL+iwg+eUqOiAheaUtuWIsOiwg+eUqOWTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VSZXNwb25zZU1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoOiB7ICAgLy/ooqvosIPnlKjogIXmlLbliLDosIPnlKjnu5PmnZ/lk43lupRcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmluaXNoTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLnJlc3BvbnNlTWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkOiB7ICAgLy/osIPnlKjogIXmlLbliLDosIPnlKjlpLHotKXlk43lupRcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmFpbGVkTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3Q6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX3Jlc3BvbnNlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVGYWlsZWRNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlRmluaXNoTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3Q6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0TWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9IFttc2cudHlwZSwgbXNnLnNlbmRlciwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzQW5jZXN0b3JzKGV2ZW50TmFtZSkpIHsgICAvL+WmguaenOayoeacieazqOWGjOi/h+i/meS4quW5v+aSreeahOebkeWQrOWZqO+8jOWwsemAmuefpeWvueaWueS4jeimgeWGjeWPkemAgeS6hlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RDbG9zZU1lc3NhZ2UobXNnLnNlbmRlciwgbXNnLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXJBbmNlc3RvcnMoZXZlbnROYW1lLCBtc2cuZGF0YSwgdHJ1ZSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdE9wZW5NZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55LCBtc2cucGF0aCBhcyBhbnkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZykpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WTjeW6lOWvueaWueeahGJyb2FkY2FzdF9vcGVu6K+35rGC5aSx6LSlJywgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5tZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3QsIC4uLm1zZy5wYXRoLnNwbGl0KCcuJyldIGFzIGFueSk7ICAvL+a4hemZpOagh+iusFxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoQnJvYWRjYXN0Q2xvc2VGaW5pc2hNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2cpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflk43lupTlr7nmlrnnmoRicm9hZGNhc3RfY2xvc2Xor7fmsYLlpLHotKUnLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0Q2xvc2VGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cubWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmnKrnn6Xmtojmga/nsbvlnovvvJoke3BfaGVhZGVyfWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRFcnJvcign5o6l5pS25Yiw55qE5raI5oGv5qC85byP6ZSZ6K+v77yaJywgZXJyb3IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5zb2NrZXQub25PcGVuID0gKCkgPT4gdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXJEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuX29uT3Blbl0gYXMgYW55KTtcclxuXHJcbiAgICAgICAgdGhpcy5zb2NrZXQub25DbG9zZSA9ICgpID0+IHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLl9vbkNsb3NlXSBhcyBhbnkpO1xyXG5cclxuICAgICAgICAvL+W9k+aJk+W8gOerr+WPo+S5i+WQjueri+WIu+mAmuefpeWvueaWueimgeebkeWQrOWTquS6m+W5v+aSrVxyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5fb25PcGVuLCAnX3NlbmRfYnJvYWRjYXN0X29wZW4nXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLl9ldmVudExldmVsLmdldENoaWxkTGV2ZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF0gYXMgYW55LCB0cnVlKVxyXG4gICAgICAgICAgICAgICAgLmNoaWxkcmVuLmZvckVhY2goKGxldmVsLCBicm9hZGNhc3RTZW5kZXIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3JFYWNoTGV2ZWwgPSAobGV2ZWw6IEV2ZW50TGV2ZWwpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxldmVsLnJlY2VpdmVycy5zaXplID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShicm9hZGNhc3RTZW5kZXIsIGxldmVsLnJlY2VpdmVycy52YWx1ZXMoKS5uZXh0KCkudmFsdWUgYXMgYW55KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV2ZWwuY2hpbGRyZW4uZm9yRWFjaChmb3JFYWNoTGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsLmNoaWxkcmVuLmZvckVhY2goZm9yRWFjaExldmVsKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvL+W9k+i/nuaOpeaWreW8gOeri+WIu+a4heeQhuWvueaWueazqOWGjOi/h+eahOW5v+aSrei3r+W+hFxyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgJ19jbGVhbl9vcGVuZWRfYnJvYWRjYXN0J10gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0XSBhcyBhbnkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5a+55aSW5a+85Ye65pa55rOV44CCICAgICBcclxuICAgICAqIOWmguaenOimgeWQkeiwg+eUqOaWueWPjemmiOmUmeivr++8jOebtOaOpSB0aHJvdyBuZXcgRXJyb3IoKSDljbPlj6/jgIIgICAgIFxyXG4gICAgICog5rOo5oSP77ya5a+55LqO5a+85Ye65pa55rOV77yM5b2T5a6D5omn6KGM5a6M5oiQ77yM6L+U5Zue57uT5p6c5ZCO5bCx5LiN5Y+v5Lul5YaN57un57ut5LiL6L295paH5Lu25LqG44CCICAgICBcclxuICAgICAqIOazqOaEj++8muS4gOS4qnBhdGjkuIrlj6rlhYHorrjlr7zlh7rkuIDkuKrmlrnms5XjgILlpoLmnpzph43lpI3lr7zlh7rliJnlkI7pnaLnmoTlupTor6Xopobnm5bmjonliY3pnaLnmoTjgIIgICAgIFxyXG4gICAgICogQHBhcmFtIHBhdGgg5omA5a+85Ye655qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZnVuYyDlr7zlh7rnmoTmlrnms5UgXHJcbiAgICAgKi9cclxuICAgIGV4cG9ydDxGIGV4dGVuZHMgKGRhdGE6IEludm9rZVJlY2VpdmluZ0RhdGEpID0+IFByb21pc2U8dm9pZCB8IEludm9rZVNlbmRpbmdEYXRhPj4ocGF0aDogc3RyaW5nLCBmdW5jOiBGKTogRiB7XHJcbiAgICAgICAgdGhpcy5jYW5jZWxFeHBvcnQocGF0aCk7XHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLmludm9rZV9yZXF1ZXN0LCBwYXRoXSBhcyBhbnksIGFzeW5jIChtc2c6IEludm9rZVJlcXVlc3RNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgZGF0YSwgY2xlYW4gfSA9IHRoaXMuX3ByZXBhcmVfSW52b2tlUmVjZWl2aW5nRGF0YShtc2cpO1xyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZ1bmMoZGF0YSkgfHwgeyBkYXRhOiBudWxsIH07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBybSA9IEludm9rZVJlc3BvbnNlTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCB0aGlzLl9tZXNzYWdlSUQrKywgcmVzdWx0KTtcclxuXHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChybS5maWxlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5fcHJlcGFyZV9JbnZva2VTZW5kaW5nRGF0YShybSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xlYW4gPSBhd2FpdCB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoLCBybS5yZWNlaXZlciwgcm0ucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoLCBybS5yZWNlaXZlciwgcm0ucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSwgY2xlYW4pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRFcnJvcign5Y+R6YCBXCLosIPnlKjlk43lupRcIuWksei0pScsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKEludm9rZUZhaWxlZE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZXJyb3IpKVxyXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcign5Y+R6YCBXCLosIPnlKjlpLHotKXlk43lupRcIuWksei0pScsIGVycikpO1xyXG4gICAgICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICAgICAgY2xlYW4oKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gZnVuYztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWPlua2iOWvueWkluWvvOWHuueahOaWueazlVxyXG4gICAgICogQHBhcmFtIHBhdGgg5LmL5YmN5a+85Ye655qE6Lev5b6EXHJcbiAgICAgKi9cclxuICAgIGNhbmNlbEV4cG9ydChwYXRoOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVxdWVzdCwgcGF0aF0gYXMgYW55KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOiwg+eUqOi/nOerr+aooeWdl+WvvOWHuueahOaWueazleOAguebtOaOpei/lOWbnuaVsOaNruS4juaWh+S7tlxyXG4gICAgICogQHBhcmFtIHJlY2VpdmVyIOi/nOerr+aooeWdl+eahOWQjeensFxyXG4gICAgICogQHBhcmFtIHBhdGgg5pa55rOV55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZGF0YSDopoHkvKDpgJLnmoTmlbDmja5cclxuICAgICAqL1xyXG4gICAgaW52b2tlKHJlY2VpdmVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEpOiBQcm9taXNlPHsgZGF0YTogYW55LCBmaWxlczogeyBuYW1lOiBzdHJpbmcsIGRhdGE6IEJ1ZmZlciB9W10gfT5cclxuICAgIC8qKlxyXG4gICAgICog6LCD55So6L+c56uv5qih5Z2X5a+85Ye655qE5pa55rOV44CCXHJcbiAgICAgKiBAcGFyYW0gcmVjZWl2ZXIg6L+c56uv5qih5Z2X55qE5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDmlrnms5XnmoTot6/lvoRcclxuICAgICAqIEBwYXJhbSBkYXRhIOimgeS8oOmAkueahOaVsOaNrlxyXG4gICAgICogQHBhcmFtIGNhbGxiYWNrIOaOpeaUtuWTjeW6lOaVsOaNrueahOWbnuiwg+OAguazqOaEj++8muS4gOaXpuWbnuiwg+aJp+ihjOWujOaIkOWwseS4jeiDveWGjeS4i+i9veaWh+S7tuS6huOAglxyXG4gICAgICovXHJcbiAgICBpbnZva2UocmVjZWl2ZXI6IHN0cmluZywgcGF0aDogc3RyaW5nLCBkYXRhOiBJbnZva2VTZW5kaW5nRGF0YSwgY2FsbGJhY2s6IChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBkYXRhOiBJbnZva2VSZWNlaXZpbmdEYXRhKSA9PiBQcm9taXNlPHZvaWQ+KTogdm9pZFxyXG4gICAgaW52b2tlKHJlY2VpdmVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEsIGNhbGxiYWNrPzogKGVycjogRXJyb3IgfCB1bmRlZmluZWQsIGRhdGE6IEludm9rZVJlY2VpdmluZ0RhdGEpID0+IFByb21pc2U8dm9pZD4pOiBhbnkge1xyXG4gICAgICAgIGNvbnN0IHJtID0gSW52b2tlUmVxdWVzdE1lc3NhZ2UuY3JlYXRlKHRoaXMsIHRoaXMuX21lc3NhZ2VJRCsrLCByZWNlaXZlciwgcGF0aCwgZGF0YSk7XHJcbiAgICAgICAgY29uc3QgY2xlYW5NZXNzYWdlTGlzdGVuZXIgPSAoKSA9PiB7ICAgLy/muIXnkIbms6jlhoznmoTmtojmga/nm5HlkKzlmahcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZhaWxlZCwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB7ICAgLy/lm57osIPlh73mlbDniYjmnKxcclxuICAgICAgICAgICAgdGhpcy5fcHJlcGFyZV9JbnZva2VTZW5kaW5nRGF0YShybSwgY2xlYW5NZXNzYWdlTGlzdGVuZXIpLnRoZW4oY2xlYW5TZW5kUmVxdWVzdCA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9yZXNwb25zZSwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgKG1zZzogSW52b2tlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYW5TZW5kUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgZGF0YSwgY2xlYW4gfSA9IHRoaXMuX3ByZXBhcmVfSW52b2tlUmVjZWl2aW5nRGF0YShtc2cpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgZGF0YSkudGhlbihjbGVhbikuY2F0Y2goZXJyID0+IHsgY2xlYW4oKTsgdGhyb3cgZXJyOyB9KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZhaWxlZCwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgKG1zZzogSW52b2tlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuU2VuZFJlcXVlc3QoKTtcclxuICAgICAgICAgICAgICAgICAgICBjbGVhbk1lc3NhZ2VMaXN0ZW5lcigpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAoY2FsbGJhY2sgYXMgYW55KShuZXcgRXJyb3IobXNnLmVycm9yKSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSkuY2F0Y2goY2FsbGJhY2sgYXMgYW55KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fcHJlcGFyZV9JbnZva2VTZW5kaW5nRGF0YShybSwgY2xlYW5NZXNzYWdlTGlzdGVuZXIpLnRoZW4oY2xlYW5TZW5kUmVxdWVzdCA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2UsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnksIGFzeW5jIChtc2c6IEludm9rZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGVhblNlbmRSZXF1ZXN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB7IGRhdGEsIGNsZWFuIH0gPSB0aGlzLl9wcmVwYXJlX0ludm9rZVJlY2VpdmluZ0RhdGEobXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQ6IHsgbmFtZTogc3RyaW5nLCBkYXRhOiBCdWZmZXIgfVtdID0gW107XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEuZmlsZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh7IG5hbWU6IGl0ZW0ubmFtZSwgZGF0YTogYXdhaXQgaXRlbS5nZXRGaWxlKCkgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IGRhdGE6IGRhdGEuZGF0YSwgZmlsZXM6IHJlc3VsdCB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZhaWxlZCwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgKG1zZzogSW52b2tlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGVhblNlbmRSZXF1ZXN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKG1zZy5lcnJvcikpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2gocmVqZWN0KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM5bm/5pKt55uR5ZCs5ZmoICAgICAgXHJcbiAgICAgKiBAcGFyYW0gc2VuZGVyIOWPkemAgeiAhVxyXG4gICAgICogQHBhcmFtIG5hbWUg5bm/5pKt55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZnVuYyDlr7nlupTnmoTlm57osIPmlrnms5VcclxuICAgICAqL1xyXG4gICAgcmVjZWl2ZTxGIGV4dGVuZHMgKGFyZzogYW55KSA9PiBhbnk+KHNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGZ1bmM6IEYpOiBGIHtcclxuICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbTWVzc2FnZVR5cGUuYnJvYWRjYXN0LCBzZW5kZXIsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55O1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXMoZXZlbnROYW1lKSkgeyAgLy/lpoLmnpzov5jmsqHms6jlhozov4fvvIzpgJrnn6Xlr7nmlrnnjrDlnKjopoHmjqXmlLbmjIflrprot6/lvoTlub/mkq1cclxuICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShzZW5kZXIsIHBhdGgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoZXZlbnROYW1lLCBmdW5jKTsgLy/kuI3ljIXoo4XkuIDkuIvnm5HlkKzlmajvvIzmmK/kuLrkuobogIPomZHliLBjYW5jZWxSZWNlaXZlXHJcbiAgICAgICAgcmV0dXJuIGZ1bmM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTmjIflrprot6/lvoTkuIrnmoTmiYDmnInlub/mkq3nm5HlkKzlmajvvIzlj6/ku6XkvKDpgJLkuIDkuKpsaXN0ZW5lcuadpeWPquWIoOmZpOS4gOS4queJueWumueahOebkeWQrOWZqFxyXG4gICAgICogQHBhcmFtIHNlbmRlciDlj5HpgIHogIVcclxuICAgICAqIEBwYXJhbSBuYW1lIOW5v+aSreeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGxpc3RlbmVyIOimgeaMh+WumuWIoOmZpOeahOebkeWQrOWZqFxyXG4gICAgICovXHJcbiAgICBjYW5jZWxSZWNlaXZlKHNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGxpc3RlbmVyPzogKGFyZzogYW55KSA9PiBhbnkpIHtcclxuICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbTWVzc2FnZVR5cGUuYnJvYWRjYXN0LCBzZW5kZXIsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55O1xyXG5cclxuICAgICAgICBpZiAodGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhcyhldmVudE5hbWUpKSB7ICAvL+ehruS/neecn+eahOacieazqOWGjOi/h+WGjeaJp+ihjOWIoOmZpFxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKGV2ZW50TmFtZSwgbGlzdGVuZXIpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCF0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzKGV2ZW50TmFtZSkpIHsgICAgLy/lpoLmnpzliKDlhYnkuobvvIzlsLHpgJrnn6Xlr7nmlrnkuI3lho3mjqXmlLbkuoZcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKHNlbmRlciwgcGF0aCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlr7nlpJblub/mkq3mlbDmja5cclxuICAgICAqIEBwYXJhbSBwYXRoIOW5v+aSreeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5Y+R6YCB55qE5pWw5o2uXHJcbiAgICAgKi9cclxuICAgIGFzeW5jIGJyb2FkY2FzdChwYXRoOiBzdHJpbmcsIGRhdGE6IGFueSA9IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICAvL+WIpOaWreWvueaWueaYr+WQpuazqOWGjOeahOacieWFs+S6jui/meadoeW5v+aSreeahOebkeWQrOWZqFxyXG4gICAgICAgIGlmICh0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzQW5jZXN0b3JzKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3QsIC4uLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KSkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9zZW5kTWVzc2FnZShCcm9hZGNhc3RNZXNzYWdlLmNyZWF0ZSh0aGlzLCBwYXRoLCBkYXRhKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5L6/5LqO5L2/55Soc29ja2V05Y+R6YCB5raI5oGvXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3NlbmRNZXNzYWdlKG1zZzogTWVzc2FnZURhdGEpIHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBtc2cucGFjaygpO1xyXG4gICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZSh0cnVlLCBtc2cpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5zb2NrZXQuc2VuZChyZXN1bHRbMF0sIHJlc3VsdFsxXSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmiZPljbDplJnor6/mtojmga9cclxuICAgICAqIEBwYXJhbSBkZXNjIOaPj+i/sCBcclxuICAgICAqIEBwYXJhbSBlcnIg6ZSZ6K+v5L+h5oGvXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3ByaW50RXJyb3IoZGVzYzogc3RyaW5nLCBlcnI6IEVycm9yKSB7XHJcbiAgICAgICAgaWYgKHRoaXMucHJpbnRFcnJvcilcclxuICAgICAgICAgICAgbG9nLndhcm5cclxuICAgICAgICAgICAgICAgIC5sb2NhdGlvbi53aGl0ZVxyXG4gICAgICAgICAgICAgICAgLnRpdGxlLnllbGxvd1xyXG4gICAgICAgICAgICAgICAgLmNvbnRlbnQueWVsbG93KCdyZW1vdGUtaW52b2tlJywgZGVzYywgZXJyKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaJk+WNsOaUtuWIsOaIluWPkemAgeeahOa2iOaBr1xyXG4gICAgICogQHBhcmFtIHNlbmRPclJlY2VpdmUg5aaC5p6c5piv5Y+R6YCB5YiZ5Li6dHJ1Ze+8jOWmguaenOaYr+aOpeaUtuWImeS4umZhbHNlXHJcbiAgICAgKiBAcGFyYW0gZGVzYyDmj4/ov7BcclxuICAgICAqIEBwYXJhbSBkYXRhIOimgeaJk+WNsOeahOaVsOaNrlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9wcmludE1lc3NhZ2Uoc2VuZE9yUmVjZWl2ZTogYm9vbGVhbiwgbXNnOiBNZXNzYWdlRGF0YSkge1xyXG4gICAgICAgIGlmICh0aGlzLnByaW50TWVzc2FnZSlcclxuICAgICAgICAgICAgaWYgKHNlbmRPclJlY2VpdmUpXHJcbiAgICAgICAgICAgICAgICBsb2dcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uY3lhbi5ib2xkXHJcbiAgICAgICAgICAgICAgICAgICAgLnRpdGxlXHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQoJ3JlbW90ZS1pbnZva2UnLCAn5Y+R6YCBJywgTWVzc2FnZVR5cGVbbXNnLnR5cGVdLCBKU09OLnN0cmluZ2lmeShtc2csIHVuZGVmaW5lZCwgMikpO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBsb2dcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uZ3JlZW4uYm9sZFxyXG4gICAgICAgICAgICAgICAgICAgIC50aXRsZVxyXG4gICAgICAgICAgICAgICAgICAgIC5jb250ZW50KCdyZW1vdGUtaW52b2tlJywgJ+aUtuWIsCcsIE1lc3NhZ2VUeXBlW21zZy50eXBlXSwgSlNPTi5zdHJpbmdpZnkobXNnLCB1bmRlZmluZWQsIDIpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWHhuWkh+WlveS4i+i9veWbnuiwg+OAgui/lOWbnkludm9rZVJlY2VpdmluZ0RhdGHkuI7muIXnkIbotYTmupDlm57osINcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfcHJlcGFyZV9JbnZva2VSZWNlaXZpbmdEYXRhKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UgfCBJbnZva2VSZXNwb25zZU1lc3NhZ2UpIHtcclxuICAgICAgICBjb25zdCBtZXNzYWdlSUQgPSBtc2cgaW5zdGFuY2VvZiBJbnZva2VSZXF1ZXN0TWVzc2FnZSA/IG1zZy5yZXF1ZXN0TWVzc2FnZUlEIDogbXNnLnJlc3BvbnNlTWVzc2FnZUlEO1xyXG5cclxuICAgICAgICBjb25zdCBmaWxlcyA9IG1zZy5maWxlcy5tYXAoaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBzdGFydDogYm9vbGVhbiA9IGZhbHNlOyAgICAgICAgICAgICAvL+aYr+WQpuW3sue7j+W8gOWni+iOt+WPluS6hu+8jOS4u+imgeaYr+eUqOS6jumYsuatoumHjeWkjeS4i+i9vVxyXG4gICAgICAgICAgICBsZXQgaW5kZXggPSAtMTsgICAgICAgICAgICAgICAgICAgICAgICAgLy/njrDlnKjmjqXmlLbliLDnrKzlh6DkuKrmlofku7bniYfmrrXkuoZcclxuICAgICAgICAgICAgbGV0IGRvd25sb2FkZWRTaXplID0gMDsgICAgICAgICAgICAgICAgIC8v5bey5LiL6L295aSn5bCPXHJcbiAgICAgICAgICAgIGxldCB0aW1lcjogTm9kZUpTLlRpbWVyOyAgICAgICAgICAgICAgICAvL+i2heaXtuiuoeaXtuWZqFxyXG5cclxuICAgICAgICAgICAgY29uc3QgZG93bmxvYWROZXh0ID0gKCkgPT4geyAgICAgICAgICAgIC8v5LiL6L295LiL5LiA5Liq5paH5Lu254mH5q61XHJcbiAgICAgICAgICAgICAgICB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4gY2JfZXJyb3IobmV3IEVycm9yKCfor7fmsYLotoXml7YnKSksIHRoaXMudGltZW91dCk7ICAvL+iuvue9rui2heaXtlxyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBpdGVtLmlkLCArK2luZGV4KSlcclxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHsgY2xlYXJUaW1lb3V0KHRpbWVyKTsgY2JfZXJyb3IobmV3IEVycm9yKCfnvZHnu5zov57mjqXlvILluLjvvJonICsgZXJyKSk7IH0pO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgbGV0IGNiX2Vycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZDsgLy/kuIvovb3lh7rplJnlm57osINcclxuICAgICAgICAgICAgbGV0IGNiX3JlY2VpdmU6IChkYXRhOiBCdWZmZXIsIGlzRW5kOiBib29sZWFuKSA9PiB2b2lkOyAvL+aOpeaUtuaWh+S7tuWbnuiwg1xyXG5cclxuICAgICAgICAgICAgLy/nm5HlkKzkuIvovb3liLDnmoTmlofku7ZcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3Jlc3BvbnNlLCBtc2cuc2VuZGVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAobXNnLmluZGV4ICE9PSBpbmRleCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yKG5ldyBFcnJvcign5paH5Lu25Zyo5Lyg6L6T6L+H56iL5Lit77yM6aG65bqP5Y+R55Sf6ZSZ5LmxJykpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBkb3dubG9hZGVkU2l6ZSArPSBtc2cuZGF0YS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5zaXplICE9IG51bGwgJiYgZG93bmxvYWRlZFNpemUgPiBpdGVtLnNpemUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjYl9lcnJvcihuZXcgRXJyb3IoJ+S4i+i9veWIsOeahOaWh+S7tuWkp+Wwj+i2heWHuuS6huWPkemAgeiAheaJgOaPj+i/sOeahOWkp+WwjycpKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY2JfcmVjZWl2ZShtc2cuZGF0YSwgaXRlbS5zcGxpdE51bWJlciAhPSBudWxsICYmIGluZGV4ICsgMSA+PSBpdGVtLnNwbGl0TnVtYmVyKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvL+ebkeWQrOS4i+i9veaWh+S7tuWksei0pVxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkLCBtc2cuc2VuZGVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICBjYl9lcnJvcihuZXcgRXJyb3IobXNnLmVycm9yKSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy/nm5HlkKzkuIvovb3mlofku7bnu5PmnZ9cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaCwgbXNnLnNlbmRlciwgbWVzc2FnZUlELCBpdGVtLmlkXSBhcyBhbnksIChtc2c6IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgY2JfcmVjZWl2ZShCdWZmZXIuYWxsb2MoMCksIHRydWUpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogUmVjZWl2aW5nRmlsZSA9IHtcclxuICAgICAgICAgICAgICAgIHNpemU6IGl0ZW0uc2l6ZSxcclxuICAgICAgICAgICAgICAgIHNwbGl0TnVtYmVyOiBpdGVtLnNwbGl0TnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgbmFtZTogaXRlbS5uYW1lLFxyXG4gICAgICAgICAgICAgICAgb25EYXRhOiAoY2FsbGJhY2ssIHN0YXJ0SW5kZXggPSAwKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXJ0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICg8YW55PmNhbGxiYWNrKShuZXcgRXJyb3IoJ+S4jeWPr+mHjeWkjeS4i+i9veaWh+S7ticpKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4ID0gc3RhcnRJbmRleCAtIDE7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYl9lcnJvciA9IGVyciA9PiB7ICg8YW55PmNhbGxiYWNrKShlcnIpOyBjYl9lcnJvciA9ICgpID0+IHsgfSB9OyAgIC8v56Gu5L+d5Y+q6Kem5Y+R5LiA5qyhXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX3JlY2VpdmUgPSAoZGF0YSwgaXNFbmQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0VuZClcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIGlzRW5kLCBpbmRleCwgZGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCBpc0VuZCwgaW5kZXgsIGRhdGEpLnRoZW4ocmVzdWx0ID0+IHJlc3VsdCAhPT0gdHJ1ZSAmJiBkb3dubG9hZE5leHQoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkb3dubG9hZE5leHQoKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0RmlsZTogKCkgPT4gbmV3IFByb21pc2U8QnVmZmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7ICAgLy/kuIvovb3mlofku7blm57osINcclxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcign5LiN5Y+v6YeN5aSN5LiL6L295paH5Lu2JykpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZVBpZWNlczogQnVmZmVyW10gPSBbXTsgICAgLy/kuIvovb3liLDnmoTmlofku7bniYfmrrVcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yID0gcmVqZWN0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYl9yZWNlaXZlID0gKGRhdGEsIGlzRW5kKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWxlUGllY2VzLnB1c2goZGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0VuZCA/IHJlc29sdmUoQnVmZmVyLmNvbmNhdChmaWxlUGllY2VzKSkgOiBkb3dubG9hZE5leHQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvd25sb2FkTmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGRhdGE6IHsgZGF0YTogbXNnLmRhdGEsIGZpbGVzIH0sXHJcbiAgICAgICAgICAgIGNsZWFuOiAoKSA9PiB7IC8v5riF55CG6LWE5rqQXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRF0gYXMgYW55LCB7IGVycm9yOiAn5LiL6L2957uI5q2iJyB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3Jlc3BvbnNlLCBtc2cuc2VuZGVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZCwgbXNnLnNlbmRlciwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbERlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2gsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlh4blpIflj5HpgIHmlofku7bvvIzov5Tlm57muIXnkIbotYTmupDlm57osIPjgILlpoLmnpzotoXml7bkvJroh6rliqjmuIXnkIbotYTmupBcclxuICAgICAqIEBwYXJhbSBtc2cg6KaB5Y+R6YCB55qE5pWw5o2uXHJcbiAgICAgKiBAcGFyYW0gb25UaW1lb3V0IOayoeacieaWh+S7tuivt+axgui2heaXtlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIF9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UgfCBJbnZva2VSZXNwb25zZU1lc3NhZ2UsIG9uVGltZW91dD86ICgpID0+IHZvaWQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLl9zZW5kTWVzc2FnZShtc2cpO1xyXG5cclxuICAgICAgICBpZiAobXNnLmZpbGVzLmxlbmd0aCA+IDApIHsgLy/lh4blpIfmlofku7blj5HpgIFcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZUlEID0gbXNnIGluc3RhbmNlb2YgSW52b2tlUmVxdWVzdE1lc3NhZ2UgPyBtc2cucmVxdWVzdE1lc3NhZ2VJRCA6IG1zZy5yZXNwb25zZU1lc3NhZ2VJRDtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuID0gKCkgPT4geyAgLy/muIXnkIbotYTmupDlm57osINcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4geyBjbGVhbigpOyBvblRpbWVvdXQgJiYgb25UaW1lb3V0KCk7IH07XHJcblxyXG4gICAgICAgICAgICBsZXQgdGltZXIgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMudGltZW91dCk7ICAgIC8v6LaF5pe26K6h5pe25ZmoXHJcblxyXG4gICAgICAgICAgICBtc2cuZmlsZXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgICAgIGxldCBzZW5kaW5nRGF0YSA9IGl0ZW0uX2RhdGEgYXMgU2VuZGluZ0ZpbGU7XHJcbiAgICAgICAgICAgICAgICBsZXQgaW5kZXggPSAwOyAgICAvL+iusOW9leeUqOaIt+ivt+axguWIsOS6huesrOWHoOS4quaWh+S7tueJh+auteS6hlxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlbmRfZXJyb3IgPSAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsIGVycjogRXJyb3IpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBzZW5kaW5nRGF0YS5vblByb2dyZXNzICYmIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MoZXJyLCB1bmRlZmluZWQgYXMgYW55KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZXJyKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflkJHlr7nmlrnlj5HpgIFcIuivt+axguaWh+S7tueJh+auteWksei0peWTjeW6lFwi5aSx6LSlJywgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8v5LiN5YWB6K645YaN5LiL6L296K+l5paH5Lu25LqGXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VuZF9maW5pc2ggPSAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShJbnZva2VGaWxlRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflkJHlr7nmlrnlj5HpgIFcIuivt+axguaWh+S7tueJh+autee7k+adn+WTjeW6lFwi5aSx6LSlJywgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8v5LiN5YWB6K645YaN5LiL6L296K+l5paH5Lu25LqGXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRpbWVyID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLnRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLmluZGV4ID4gaW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBtc2cuaW5kZXg7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9lcnJvcihtc2csIG5ldyBFcnJvcign6YeN5aSN5LiL6L295paH5Lu254mH5q61JykpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHNlbmRpbmdEYXRhLmZpbGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA8IChpdGVtLnNwbGl0TnVtYmVyIGFzIG51bWJlcikpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyh1bmRlZmluZWQsIChpbmRleCArIDEpIC8gKGl0ZW0uc3BsaXROdW1iZXIgYXMgbnVtYmVyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jcmVhdGUodGhpcywgbXNnLCBzZW5kaW5nRGF0YS5maWxlLnNsaWNlKGluZGV4ICogdGhpcy5maWxlUGllY2VTaXplLCAoaW5kZXggKyAxKSAqIHRoaXMuZmlsZVBpZWNlU2l6ZSkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKHJlc3VsdCkuY2F0Y2goZXJyID0+IHNlbmRfZXJyb3IobXNnLCBlcnIpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRfZmluaXNoKG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kaW5nRGF0YS5maWxlKGluZGV4KVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4oZGF0YSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2csIGRhdGEpKS5jYXRjaChlcnIgPT4gc2VuZF9lcnJvcihtc2csIGVycikpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRfZmluaXNoKG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kX2Vycm9yKG1zZywgZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBjbGVhbjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gKCkgPT4geyB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAgKiDlj5HpgIFCcm9hZGNhc3RPcGVuTWVzc2FnZVxyXG4gICAgICAqIEBwYXJhbSBicm9hZGNhc3RTZW5kZXIg5bm/5pKt55qE5Y+R6YCB6ICFXHJcbiAgICAgICogQHBhcmFtIHBhdGgg5bm/5pKt6Lev5b6EXHJcbiAgICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5zb2NrZXQuY29ubmVjdGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VJRCA9IHRoaXMuX21lc3NhZ2VJRCsrO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1lc3NhZ2VJRCwgYnJvYWRjYXN0U2VuZGVyLCBwYXRoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGludGVydmFsID0gKCkgPT4gdGhpcy5fc2VuZE1lc3NhZ2UocmVzdWx0KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDpgJrnn6Xlr7nmlrlcIueOsOWcqOimgeaOpeaUtuaMh+Wumui3r+W+hOeahOW5v+aSrVwi5aSx6LSl44CCYnJvYWRjYXN0U2VuZGVyOiR7YnJvYWRjYXN0U2VuZGVyfSBwYXRoOiR7cGF0aH1gLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0SW50ZXJ2YWwoaW50ZXJ2YWwsIHRoaXMudGltZW91dCk7ICAgIC8v5Yiw5LqG5pe26Ze05aaC5p6c6L+Y5rKh5pyJ5pS25Yiw5a+55pa55ZON5bqU5bCx6YeN5paw5Y+R6YCB5LiA5qyhXHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgaW50ZXJ2YWwoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlj5HpgIFCcm9hZGNhc3RDbG9zZU1lc3NhZ2VcclxuICAgICAqIEBwYXJhbSBicm9hZGNhc3RTZW5kZXIg5bm/5pKt55qE5Y+R6YCB6ICFXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDlub/mkq3ot6/lvoRcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZF9Ccm9hZGNhc3RDbG9zZU1lc3NhZ2UoYnJvYWRjYXN0U2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZykge1xyXG4gICAgICAgIGlmICh0aGlzLnNvY2tldC5jb25uZWN0ZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZUlEID0gdGhpcy5fbWVzc2FnZUlEKys7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1lc3NhZ2VJRCwgYnJvYWRjYXN0U2VuZGVyLCBwYXRoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGludGVydmFsID0gKCkgPT4gdGhpcy5fc2VuZE1lc3NhZ2UocmVzdWx0KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDpgJrnn6Xlr7nmlrlcIueOsOWcqOS4jeWGjeaOpeaUtuaMh+Wumui3r+W+hOeahOW5v+aSrVwi5aSx6LSl44CCYnJvYWRjYXN0U2VuZGVyOiR7YnJvYWRjYXN0U2VuZGVyfSBwYXRoOiR7cGF0aH1gLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0SW50ZXJ2YWwoaW50ZXJ2YWwsIHRoaXMudGltZW91dCk7ICAgIC8v5Yiw5LqG5pe26Ze05aaC5p6c6L+Y5rKh5pyJ5pS25Yiw5a+55pa55ZON5bqU5bCx6YeN5paw5Y+R6YCB5LiA5qyhXHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLl9vbkNsb3NlLCBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGludGVydmFsKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59Il19
