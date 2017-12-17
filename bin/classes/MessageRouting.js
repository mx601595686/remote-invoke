"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EventSpace_1 = require("eventspace/bin/classes/EventSpace");
const log_formatter_1 = require("log-formatter");
const MessageType_1 = require("../interfaces/MessageType");
const MessageData_1 = require("./MessageData");
/**
 * 消息路由中心，负责收发消息
 */
class MessageRouting {
    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket, moduleName) {
        /**
         * 自增消息编号索引
         */
        this._messageID = 0;
        /**
         * 注册的各类消息监听器
         */
        this._messageListener = new EventSpace_1.EventSpace();
        /**
         * 请求响应超时，默认3分钟
         */
        this.timeout = 3 * 60 * 1000;
        /**
         * 默认文件片段大小 512kb
         */
        this.filePieceSize = 512 * 1024;
        /**
         * 消息path的最大长度
         */
        this.pathMaxLength = 256;
        /**
         * 是否打印收到和发送的消息（用于调试）。默认false
         */
        this.printMessage = false;
        /**
         * 是否打印系统错误，默认true
         */
        this.printError = true;
        this.moduleName = moduleName;
        this._socket = socket;
        this._socket.onMessage = (header, body) => {
            try {
                const p_header = JSON.parse(header);
                switch (p_header[0]) {
                    case MessageType_1.MessageType.invoke_request: {
                        const msg = MessageData_1.InvokeRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        const eventName = [msg.type, msg.path];
                        if (this._messageListener.has(eventName))
                            this._messageListener.trigger(eventName, msg);
                        else
                            this._send_InvokeFailedMessage(msg, new Error("调用的方法不存在"));
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
                        if (this._messageListener.hasAncestors(eventName))
                            this._messageListener.triggerAncestors(eventName, msg.data, true, true);
                        else {
                            msg.path.split('.').reduce((pre, cur, index) => {
                                const result = pre + (index === 0 ? '' : '.') + cur;
                                this._send_BroadcastCloseMessage(msg.sender, result);
                                return result;
                            }, '');
                            this._printError(`收到了没有注册过的广播 broadcastSender:${msg.sender} path:${msg.path}`, new Error());
                        }
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_open: {
                        const msg = MessageData_1.BroadcastOpenMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        //记录对方要监听哪个路径上的广播
                        this._messageListener.receive([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')], true);
                        this._send_BroadcastOpenFinishMessage(msg);
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
                        this._send_BroadcastCloseFinishMessage(msg);
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
        this._socket.onOpen = () => this._messageListener.triggerDescendants([MessageType_1.MessageType._onOpen]);
        this._socket.onClose = () => this._messageListener.triggerDescendants([MessageType_1.MessageType._onClose]);
        //当端口打开之后立刻通知对方要监听哪些广播
        this._messageListener.receive([MessageType_1.MessageType._onOpen], () => {
            this._messageListener._eventLevel.getChildLevel([MessageType_1.MessageType.broadcast], true)
                .children.forEach((level, broadcastSender) => {
                const forEachLevel = (eventName, level, levelName) => {
                    eventName.push(levelName);
                    if (level.receivers.size > 0) {
                        this._send_BroadcastOpenMessage(broadcastSender, eventName.join('.'));
                    }
                    level.children.forEach((level, levelName) => forEachLevel(eventName, level, levelName));
                };
                level.children.forEach((level, levelName) => forEachLevel([], level, levelName));
            });
        });
        this._messageListener.receive([MessageType_1.MessageType._onClose], () => {
            //当连接断开后立刻清理对方注册过的广播路径
            this._messageListener.cancelDescendants([MessageType_1.MessageType._broadcast_white_list]);
            //取消所有调用操作
            this._messageListener.triggerDescendants([MessageType_1.MessageType.invoke_failed], { error: '网络中断' });
            this._messageListener.triggerDescendants([MessageType_1.MessageType.invoke_file_failed], { error: '网络中断' });
            //取消所有调用发送
            this._messageListener.triggerDescendants([MessageType_1.MessageType.invoke_finish]);
        });
    }
    _send_InvokeRequestMessage(receiver, path, data) {
        return new Promise((resolve, reject) => {
            const rm = MessageData_1.InvokeRequestMessage.create(this, this._messageID++, receiver, path, data);
            const cleanMessageListener = () => {
                this._messageListener.cancel([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID]);
                this._messageListener.cancel([MessageType_1.MessageType.invoke_failed, rm.receiver, rm.requestMessageID]);
            };
            const clean = this._send_File(rm, () => { cleanMessageListener(); reject(new Error('请求超时')); });
            this._send_MessageData(rm).then(() => {
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID], (msg) => {
                    clean();
                    cleanMessageListener();
                    resolve(msg);
                });
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_failed, rm.receiver, rm.requestMessageID], (msg) => {
                    clean();
                    cleanMessageListener();
                    reject(new Error(msg.error));
                });
            }).catch(err => { clean(); reject(err); });
        });
    }
    _send_InvokeResponseMessage(msg, data) {
        const rm = MessageData_1.InvokeResponseMessage.create(this, msg, this._messageID++, data);
        this._send_MessageData(rm).then(() => {
            if (rm.files.length === 0) {
                this._send_File(rm, () => { })();
            }
            else {
                const clean = this._send_File(rm, () => {
                    this._messageListener.cancel([MessageType_1.MessageType.invoke_finish, rm.receiver, rm.responseMessageID]);
                });
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_finish, rm.receiver, rm.responseMessageID], clean);
            }
        }).catch(err => this._printError(`向对方发送"InvokeResponseMessage"失败`, err));
    }
    /**
     * 方便_send_InvokeRequestMessage与_send_InvokeResponseMessage发送文件。
     * 发送超时后会自动清理资源，也可使用返回的clean方法提前清理资源
     */
    _send_File(msg, onTimeout) {
        const messageID = msg instanceof MessageData_1.InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;
        const clean = () => {
            clearTimeout(timer);
            this._messageListener.cancelDescendants([MessageType_1.MessageType.invoke_file_request, msg.receiver, messageID]);
        };
        const timeout = () => { clean(); onTimeout(); };
        let timer = setTimeout(timeout, this.timeout);
        msg.files.forEach(item => {
            let sendingData = item._data;
            let index = -1; //记录用户请求到了第几个文件片段了
            const send_error = (msg, err) => {
                sendingData.onProgress && sendingData.onProgress(err, undefined);
                this._send_InvokeFileFailedMessage(msg, err);
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
                    if (index < item.splitNumber)
                        this._send_InvokeFileResponseMessage(msg, sendingData.file.slice(index * this.filePieceSize, (index + 1) * this.filePieceSize))
                            .then(() => sendingData.onProgress && sendingData.onProgress(undefined, (index + 1) / item.splitNumber))
                            .catch(err => send_error(msg, err));
                    else
                        this._send_InvokeFileFinishMessage(msg);
                }
                else {
                    sendingData.file(index).then(data => {
                        if (Buffer.isBuffer(data))
                            this._send_InvokeFileResponseMessage(msg, data).catch(err => send_error(msg, err));
                        else
                            this._send_InvokeFileFinishMessage(msg);
                    }).catch(err => {
                        send_error(msg, err);
                    });
                }
            });
        });
        return clean;
    }
    _send_InvokeFinishMessage(msg) {
        if (msg.files.length > 0)
            this._send_MessageData(MessageData_1.InvokeFinishMessage.create(this, msg))
                .catch(err => this._printError(`向对方发送"InvokeFinishMessage"失败`, err));
    }
    _send_InvokeFailedMessage(msg, error) {
        this._send_MessageData(MessageData_1.InvokeFailedMessage.create(this, msg, error))
            .catch(err => this._printError(`向对方发送"InvokeFailedMessage -> ${error.message}"失败`, err));
    }
    /**
     * 发送请求，下载一个文件片段，返回下载到的文件片段Buffer。如果返回void则表示下载完成了，超时或下载失败会抛出异常。
     */
    _send_InvokeFileRequestMessage(msg, fileID, index) {
        return new Promise((resolve, reject) => {
            const message = MessageData_1.InvokeFileRequestMessage.create(this, msg, fileID, index);
            const timer = setTimeout(() => { clean(); reject(new Error('请求超时')); }, this.timeout);
            const clean = () => {
                clearTimeout(timer);
                this._messageListener.cancel([MessageType_1.MessageType.invoke_file_response, message.receiver, message.messageID, fileID]);
                this._messageListener.cancel([MessageType_1.MessageType.invoke_file_failed, message.receiver, message.messageID, fileID]);
                this._messageListener.cancel([MessageType_1.MessageType.invoke_file_finish, message.receiver, message.messageID, fileID]);
            };
            this._send_MessageData(message).then(() => {
                //监听下载到的文件
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_file_response, message.receiver, message.messageID, fileID], (msg) => {
                    clean();
                    if (index !== msg.index)
                        reject(new Error('文件在传输过程中，顺序发生错乱'));
                    else
                        resolve(msg.data);
                });
                //监听下载文件失败
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_file_failed, message.receiver, message.messageID, fileID], (msg) => {
                    clean();
                    reject(new Error(msg.error));
                });
                //监听下载文件结束
                this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_file_finish, message.receiver, message.messageID, fileID], (msg) => {
                    clean();
                    resolve();
                });
            }).catch(err => { clean(); reject(err); });
        });
    }
    _send_InvokeFileResponseMessage(msg, data) {
        return this._send_MessageData(MessageData_1.InvokeFileResponseMessage.create(this, msg, data));
    }
    _send_InvokeFileFailedMessage(msg, error) {
        this._messageListener.cancel([MessageType_1.MessageType.invoke_file_request, msg.receiver, msg.messageID, msg.id]); //不允许再下载该文件了
        this._send_MessageData(MessageData_1.InvokeFileFailedMessage.create(this, msg, error))
            .catch(err => this._printError(`向对方发送"InvokeFileFailedMessage-> ${error.message}"失败`, err));
    }
    _send_InvokeFileFinishMessage(msg) {
        this._messageListener.cancel([MessageType_1.MessageType.invoke_file_request, msg.receiver, msg.messageID, msg.id]); //不允许再下载该文件了
        this._send_MessageData(MessageData_1.InvokeFileFinishMessage.create(this, msg))
            .catch(err => this._printError('向对方发送"InvokeFileFinishMessage"失败', err));
    }
    _send_BroadcastMessage(path, data) {
        //判断对方是否注册的有关于这条广播的监听器
        if (this._messageListener.hasAncestors([MessageType_1.MessageType._broadcast_white_list, ...path.split('.')]))
            this._send_MessageData(MessageData_1.BroadcastMessage.create(this, path, data))
                .catch(err => this._printError(`对外广播"BroadcastMessage"失败。path:${path}`, err));
    }
    _send_BroadcastOpenMessage(broadcastSender, path) {
        if (this._socket.connected) {
            const result = MessageData_1.BroadcastOpenMessage.create(this, this._messageID++, broadcastSender, path);
            const interval = () => {
                this._send_MessageData(result)
                    .catch(err => this._printError(`向对方发送"BroadcastOpenMessage -> 通知对方现在要接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));
            };
            const timer = setInterval(interval, this.timeout); //到了时间如果还没有收到对方响应就重新发送一次
            this._messageListener.receiveOnce([MessageType_1.MessageType.broadcast_open_finish, result.messageID], () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_open_finish, result.messageID]);
            });
            this._messageListener.receiveOnce([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_open_finish, result.messageID], () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType_1.MessageType.broadcast_open_finish, result.messageID]);
            });
            interval();
        }
        else {
            this._printError(`向对方发送"BroadcastOpenMessage -> 通知对方现在要接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, new Error('网络中断'));
        }
    }
    _send_BroadcastOpenFinishMessage(msg) {
        this._send_MessageData(MessageData_1.BroadcastOpenFinishMessage.create(this, msg))
            .catch(err => this._printError('向对方发送"BroadcastOpenFinishMessage"失败', err));
    }
    _send_BroadcastCloseMessage(broadcastSender, path) {
        if (this._socket.connected) {
            const result = MessageData_1.BroadcastCloseMessage.create(this, this._messageID++, broadcastSender, path);
            const interval = () => {
                this._send_MessageData(result)
                    .catch(err => this._printError(`向对方发送"BroadcastCloseMessage -> 通知对方现在不再接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));
            };
            const timer = setInterval(interval, this.timeout); //到了时间如果还没有收到对方响应就重新发送一次
            this._messageListener.receiveOnce([MessageType_1.MessageType.broadcast_close_finish, result.messageID], () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_close_finish, result.messageID]);
            });
            this._messageListener.receiveOnce([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_close_finish, result.messageID], () => {
                clearInterval(timer);
                this._messageListener.cancel([MessageType_1.MessageType.broadcast_close_finish, result.messageID]);
            });
            interval();
        }
        else {
            this._printError(`向对方发送"BroadcastCloseMessage -> 通知对方现在不再接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, new Error('网络中断'));
        }
    }
    _send_BroadcastCloseFinishMessage(msg) {
        this._send_MessageData(MessageData_1.BroadcastCloseFinishMessage.create(this, msg))
            .catch(err => this._printError('向对方发送"BroadcastCloseFinishMessage"失败', err));
    }
    /**
     * 便于使用socket发送消息
     */
    _send_MessageData(msg) {
        const result = msg.pack();
        this._printMessage(true, msg);
        return this._socket.send(result[0], result[1]);
    }
    /**
     * 打印收到或发送的消息
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param msg 要打印的消息
     */
    _printMessage(sendOrReceive, msg) {
        if (this.printMessage)
            if (sendOrReceive)
                log_formatter_1.default
                    .location
                    .location.bold
                    .text.cyan.bold.round
                    .content.cyan('remote-invoke', this.moduleName, '发送', msg.toString());
            else
                log_formatter_1.default
                    .location
                    .location.bold
                    .text.green.bold.round
                    .content.green('remote-invoke', this.moduleName, '收到', msg.toString());
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
}
exports.MessageRouting = MessageRouting;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyxDQUFDO0lBQ3hELENBQUM7Q0FDSjtBQTNmRCx3Q0EyZkMiLCJmaWxlIjoiY2xhc3Nlcy9NZXNzYWdlUm91dGluZy5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEV2ZW50U3BhY2UgfSBmcm9tIFwiZXZlbnRzcGFjZS9iaW4vY2xhc3Nlcy9FdmVudFNwYWNlXCI7XHJcbmltcG9ydCB7IEV2ZW50TGV2ZWwgfSBmcm9tICdldmVudHNwYWNlL2Jpbi9jbGFzc2VzL0V2ZW50TGV2ZWwnO1xyXG5pbXBvcnQgbG9nIGZyb20gJ2xvZy1mb3JtYXR0ZXInO1xyXG5cclxuaW1wb3J0IHsgTWVzc2FnZVR5cGUgfSBmcm9tICcuLi9pbnRlcmZhY2VzL01lc3NhZ2VUeXBlJztcclxuaW1wb3J0IHsgQ29ubmVjdGlvblNvY2tldCB9IGZyb20gXCIuLi9pbnRlcmZhY2VzL0Nvbm5lY3Rpb25Tb2NrZXRcIjtcclxuaW1wb3J0IHsgU2VuZGluZ0ZpbGUsIEludm9rZVNlbmRpbmdEYXRhIH0gZnJvbSBcIi4uL2ludGVyZmFjZXMvSW52b2tlU2VuZGluZ0RhdGFcIjtcclxuaW1wb3J0IHtcclxuICAgIEludm9rZVJlcXVlc3RNZXNzYWdlLFxyXG4gICAgSW52b2tlUmVzcG9uc2VNZXNzYWdlLFxyXG4gICAgSW52b2tlRmluaXNoTWVzc2FnZSxcclxuICAgIEludm9rZUZhaWxlZE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlRmluaXNoTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdE1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RPcGVuTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0Q2xvc2VGaW5pc2hNZXNzYWdlLFxyXG4gICAgTWVzc2FnZURhdGFcclxufSBmcm9tICcuL01lc3NhZ2VEYXRhJztcclxuXHJcbi8qKlxyXG4gKiDmtojmga/ot6/nlLHkuK3lv4PvvIzotJ/otKPmlLblj5Hmtojmga9cclxuICovXHJcbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNZXNzYWdlUm91dGluZyB7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDoh6rlop7mtojmga/nvJblj7fntKLlvJVcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfbWVzc2FnZUlEID0gMDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOi/nuaOpeerr+WPo1xyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgX3NvY2tldDogQ29ubmVjdGlvblNvY2tldDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOazqOWGjOeahOWQhOexu+a2iOaBr+ebkeWQrOWZqFxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgX21lc3NhZ2VMaXN0ZW5lciA9IG5ldyBFdmVudFNwYWNlKCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor7fmsYLlk43lupTotoXml7bvvIzpu5jorqQz5YiG6ZKfXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IHRpbWVvdXQgPSAzICogNjAgKiAxMDAwO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6buY6K6k5paH5Lu254mH5q615aSn5bCPIDUxMmtiXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IGZpbGVQaWVjZVNpemUgPSA1MTIgKiAxMDI0O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5raI5oGvcGF0aOeahOacgOWkp+mVv+W6plxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBwYXRoTWF4TGVuZ3RoID0gMjU2O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5b2T5YmN5qih5Z2X5ZCN56ewXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IG1vZHVsZU5hbWU6IHN0cmluZztcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuaJk+WNsOaUtuWIsOWSjOWPkemAgeeahOa2iOaBr++8iOeUqOS6juiwg+ivle+8ieOAgum7mOiupGZhbHNlXHJcbiAgICAgKi9cclxuICAgIHByaW50TWVzc2FnZTogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5omT5Y2w57O757uf6ZSZ6K+v77yM6buY6K6kdHJ1ZVxyXG4gICAgICovXHJcbiAgICBwcmludEVycm9yOiBib29sZWFuID0gdHJ1ZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEBwYXJhbSBzb2NrZXQg6L+e5o6l56uv5Y+jXHJcbiAgICAgKiBAcGFyYW0gbW9kdWxlTmFtZSDlvZPliY3mqKHlnZfnmoTlkI3np7BcclxuICAgICAqL1xyXG4gICAgY29uc3RydWN0b3Ioc29ja2V0OiBDb25uZWN0aW9uU29ja2V0LCBtb2R1bGVOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLm1vZHVsZU5hbWUgPSBtb2R1bGVOYW1lO1xyXG4gICAgICAgIHRoaXMuX3NvY2tldCA9IHNvY2tldDtcclxuXHJcbiAgICAgICAgdGhpcy5fc29ja2V0Lm9uTWVzc2FnZSA9IChoZWFkZXI6IHN0cmluZywgYm9keTogQnVmZmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwX2hlYWRlciA9IEpTT04ucGFyc2UoaGVhZGVyKTtcclxuXHJcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHBfaGVhZGVyWzBdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVxdWVzdDogeyAgLy/ooqvosIPnlKjogIXmlLbliLDosIPnlKjor7fmsYJcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlUmVxdWVzdE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbbXNnLnR5cGUsIG1zZy5wYXRoXSBhcyBhbnk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhcyhldmVudE5hbWUpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoZXZlbnROYW1lLCBtc2cpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0ludm9rZUZhaWxlZE1lc3NhZ2UobXNnLCBuZXcgRXJyb3IoXCLosIPnlKjnmoTmlrnms5XkuI3lrZjlnKhcIikpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlOiB7IC8v6LCD55So6ICF5pS25Yiw6LCD55So5ZON5bqUXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maW5pc2g6IHsgICAvL+iiq+iwg+eUqOiAheaUtuWIsOiwg+eUqOe7k+adn+WTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQ6IHsgICAvL+iwg+eUqOiAheaUtuWIsOiwg+eUqOWksei0peWTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGYWlsZWRNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQ6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXZlbnROYW1lID0gW21zZy50eXBlLCBtc2cuc2VuZGVyLCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhc0FuY2VzdG9ycyhldmVudE5hbWUpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXJBbmNlc3RvcnMoZXZlbnROYW1lLCBtc2cuZGF0YSwgdHJ1ZSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgeyAvL+WmguaenOayoeacieazqOWGjOi/h+i/meS4quW5v+aSreeahOebkeWQrOWZqO+8jOWwsemAmuefpeWvueaWueS4jeimgeWGjeWPkemAgeS6hlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnBhdGguc3BsaXQoJy4nKS5yZWR1Y2UoKHByZSwgY3VyLCBpbmRleCkgPT4geyAgLy/nlLHkuo7kuI3nn6XpgZPlnKjlr7nmlrnoh6rlt7Hov5jms6jlhozkuoblk6rkupvnm5HlkKzlmajvvIzmiYDku6Xlj6rmnInlsIZwYXRo55qE5q+P5LiA57qn6YO95Y+W5raI5LiA5qyhXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gcHJlICsgKGluZGV4ID09PSAwID8gJycgOiAnLicpICsgY3VyO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKG1zZy5zZW5kZXIsIHJlc3VsdCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCAnJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRFcnJvcihg5pS25Yiw5LqG5rKh5pyJ5rOo5YaM6L+H55qE5bm/5pKtIGJyb2FkY2FzdFNlbmRlcjoke21zZy5zZW5kZXJ9IHBhdGg6JHttc2cucGF0aH1gLCBuZXcgRXJyb3IoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdE9wZW5NZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy/orrDlvZXlr7nmlrnopoHnm5HlkKzlk6rkuKrot6/lvoTkuIrnmoTlub/mkq1cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55LCB0cnVlIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UobXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLm1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdENsb3NlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KTsgIC8v5riF6Zmk5qCH6K6wXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0Q2xvc2VGaW5pc2hNZXNzYWdlKG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdENsb3NlRmluaXNoTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLm1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pyq55+l5raI5oGv57G75Z6L77yaJHtwX2hlYWRlcn1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50RXJyb3IoJ+aOpeaUtuWIsOeahOa2iOaBr+agvOW8j+mUmeivr++8micsIGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuX3NvY2tldC5vbk9wZW4gPSAoKSA9PiB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5fb25PcGVuXSBhcyBhbnkpO1xyXG5cclxuICAgICAgICB0aGlzLl9zb2NrZXQub25DbG9zZSA9ICgpID0+IHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLl9vbkNsb3NlXSBhcyBhbnkpO1xyXG5cclxuICAgICAgICAvL+W9k+err+WPo+aJk+W8gOS5i+WQjueri+WIu+mAmuefpeWvueaWueimgeebkeWQrOWTquS6m+W5v+aSrVxyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5fb25PcGVuXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLl9ldmVudExldmVsLmdldENoaWxkTGV2ZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF0gYXMgYW55LCB0cnVlKVxyXG4gICAgICAgICAgICAgICAgLmNoaWxkcmVuLmZvckVhY2goKGxldmVsLCBicm9hZGNhc3RTZW5kZXIpID0+IHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9yRWFjaExldmVsID0gKGV2ZW50TmFtZTogc3RyaW5nW10sIGxldmVsOiBFdmVudExldmVsLCBsZXZlbE5hbWU6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudE5hbWUucHVzaChsZXZlbE5hbWUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxldmVsLnJlY2VpdmVycy5zaXplID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShicm9hZGNhc3RTZW5kZXIsIGV2ZW50TmFtZS5qb2luKCcuJykpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXZlbC5jaGlsZHJlbi5mb3JFYWNoKChsZXZlbCwgbGV2ZWxOYW1lKSA9PiBmb3JFYWNoTGV2ZWwoZXZlbnROYW1lLCBsZXZlbCwgbGV2ZWxOYW1lKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWwuY2hpbGRyZW4uZm9yRWFjaCgobGV2ZWwsIGxldmVsTmFtZSkgPT4gZm9yRWFjaExldmVsKFtdLCBsZXZlbCwgbGV2ZWxOYW1lKSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLl9vbkNsb3NlXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgLy/lvZPov57mjqXmlq3lvIDlkI7nq4vliLvmuIXnkIblr7nmlrnms6jlhozov4fnmoTlub/mkq3ot6/lvoRcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbERlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3RdIGFzIGFueSk7XHJcblxyXG4gICAgICAgICAgICAvL+WPlua2iOaJgOacieiwg+eUqOaTjeS9nFxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkXSBhcyBhbnksIHsgZXJyb3I6ICfnvZHnu5zkuK3mlq0nIH0pO1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWRdIGFzIGFueSwgeyBlcnJvcjogJ+e9kee7nOS4reaWrScgfSk7XHJcblxyXG4gICAgICAgICAgICAvL+WPlua2iOaJgOacieiwg+eUqOWPkemAgVxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoXSBhcyBhbnkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9JbnZva2VSZXF1ZXN0TWVzc2FnZShyZWNlaXZlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhKTogUHJvbWlzZTxJbnZva2VSZXNwb25zZU1lc3NhZ2U+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBybSA9IEludm9rZVJlcXVlc3RNZXNzYWdlLmNyZWF0ZSh0aGlzLCB0aGlzLl9tZXNzYWdlSUQrKywgcmVjZWl2ZXIsIHBhdGgsIGRhdGEpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xlYW5NZXNzYWdlTGlzdGVuZXIgPSAoKSA9PiB7ICAgLy/muIXnkIbms6jlhoznmoTmtojmga/nm5HlkKzlmahcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9yZXNwb25zZSwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuID0gdGhpcy5fc2VuZF9GaWxlKHJtLCAoKSA9PiB7IGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7IHJlamVjdChuZXcgRXJyb3IoJ+ivt+axgui2heaXticpKTsgfSk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKHJtKS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCAobXNnOiBJbnZva2VSZXNwb25zZU1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjbGVhbigpOyBjbGVhbk1lc3NhZ2VMaXN0ZW5lcigpOyByZXNvbHZlKG1zZyk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnksIChtc2c6IEludm9rZUZhaWxlZE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjbGVhbigpOyBjbGVhbk1lc3NhZ2VMaXN0ZW5lcigpOyByZWplY3QobmV3IEVycm9yKG1zZy5lcnJvcikpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGVyciA9PiB7IGNsZWFuKCk7IHJlamVjdChlcnIpOyB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfSW52b2tlUmVzcG9uc2VNZXNzYWdlKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3Qgcm0gPSBJbnZva2VSZXNwb25zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgdGhpcy5fbWVzc2FnZUlEKyssIGRhdGEpO1xyXG5cclxuICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKHJtKS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHJtLmZpbGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9GaWxlKHJtLCAoKSA9PiB7IH0pKCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjbGVhbiA9IHRoaXMuX3NlbmRfRmlsZShybSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9maW5pc2gsIHJtLnJlY2VpdmVyLCBybS5yZXNwb25zZU1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaCwgcm0ucmVjZWl2ZXIsIHJtLnJlc3BvbnNlTWVzc2FnZUlEXSBhcyBhbnksIGNsZWFuKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDlkJHlr7nmlrnlj5HpgIFcIkludm9rZVJlc3BvbnNlTWVzc2FnZVwi5aSx6LSlYCwgZXJyKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmlrnkvr9fc2VuZF9JbnZva2VSZXF1ZXN0TWVzc2FnZeS4jl9zZW5kX0ludm9rZVJlc3BvbnNlTWVzc2FnZeWPkemAgeaWh+S7tuOAglxyXG4gICAgICog5Y+R6YCB6LaF5pe25ZCO5Lya6Ieq5Yqo5riF55CG6LWE5rqQ77yM5Lmf5Y+v5L2/55So6L+U5Zue55qEY2xlYW7mlrnms5Xmj5DliY3muIXnkIbotYTmupBcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZF9GaWxlKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UgfCBJbnZva2VSZXNwb25zZU1lc3NhZ2UsIG9uVGltZW91dDogKCkgPT4gdm9pZCk6ICgpID0+IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VJRCA9IG1zZyBpbnN0YW5jZW9mIEludm9rZVJlcXVlc3RNZXNzYWdlID8gbXNnLnJlcXVlc3RNZXNzYWdlSUQgOiBtc2cucmVzcG9uc2VNZXNzYWdlSUQ7XHJcbiAgICAgICAgY29uc3QgY2xlYW4gPSAoKSA9PiB7ICAvL+a4heeQhui1hOa6kOWbnuiwg1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4geyBjbGVhbigpOyBvblRpbWVvdXQoKTsgfTtcclxuXHJcbiAgICAgICAgbGV0IHRpbWVyID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLnRpbWVvdXQpO1xyXG5cclxuICAgICAgICBtc2cuZmlsZXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgbGV0IHNlbmRpbmdEYXRhID0gaXRlbS5fZGF0YSBhcyBTZW5kaW5nRmlsZTtcclxuICAgICAgICAgICAgbGV0IGluZGV4ID0gLTE7ICAgIC8v6K6w5b2V55So5oi36K+35rGC5Yiw5LqG56ys5Yeg5Liq5paH5Lu254mH5q615LqGXHJcblxyXG4gICAgICAgICAgICBjb25zdCBzZW5kX2Vycm9yID0gKG1zZzogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLCBlcnI6IEVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBzZW5kaW5nRGF0YS5vblByb2dyZXNzICYmIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MoZXJyLCB1bmRlZmluZWQgYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UobXNnLCBlcnIpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGltZXIgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMudGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKG1zZy5pbmRleCA+IGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBtc2cuaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRfZXJyb3IobXNnLCBuZXcgRXJyb3IoJ+mHjeWkjeS4i+i9veaWh+S7tueJh+autScpKTsgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc2VuZGluZ0RhdGEuZmlsZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPCAoaXRlbS5zcGxpdE51bWJlciBhcyBudW1iZXIpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0ludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UobXNnLCBzZW5kaW5nRGF0YS5maWxlLnNsaWNlKGluZGV4ICogdGhpcy5maWxlUGllY2VTaXplLCAoaW5kZXggKyAxKSAqIHRoaXMuZmlsZVBpZWNlU2l6ZSkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiBzZW5kaW5nRGF0YS5vblByb2dyZXNzICYmIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3ModW5kZWZpbmVkLCAoaW5kZXggKyAxKSAvIChpdGVtLnNwbGl0TnVtYmVyIGFzIG51bWJlcikpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiBzZW5kX2Vycm9yKG1zZywgZXJyKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0ludm9rZUZpbGVGaW5pc2hNZXNzYWdlKG1zZyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLmZpbGUoaW5kZXgpLnRoZW4oZGF0YSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoZGF0YSkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0ludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UobXNnLCBkYXRhKS5jYXRjaChlcnIgPT4gc2VuZF9lcnJvcihtc2csIGVycikpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0ludm9rZUZpbGVGaW5pc2hNZXNzYWdlKG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9lcnJvcihtc2csIGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gY2xlYW47XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIF9zZW5kX0ludm9rZUZpbmlzaE1lc3NhZ2UobXNnOiBJbnZva2VSZXNwb25zZU1lc3NhZ2UpOiB2b2lkIHtcclxuICAgICAgICBpZiAobXNnLmZpbGVzLmxlbmd0aCA+IDApXHJcbiAgICAgICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEoSW52b2tlRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg5ZCR5a+55pa55Y+R6YCBXCJJbnZva2VGaW5pc2hNZXNzYWdlXCLlpLHotKVgLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfSW52b2tlRmFpbGVkTWVzc2FnZShtc2c6IEludm9rZVJlcXVlc3RNZXNzYWdlLCBlcnJvcjogRXJyb3IpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKEludm9rZUZhaWxlZE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZXJyb3IpKVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiSW52b2tlRmFpbGVkTWVzc2FnZSAtPiAke2Vycm9yLm1lc3NhZ2V9XCLlpLHotKVgLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWPkemAgeivt+axgu+8jOS4i+i9veS4gOS4quaWh+S7tueJh+aute+8jOi/lOWbnuS4i+i9veWIsOeahOaWh+S7tueJh+autUJ1ZmZlcuOAguWmguaenOi/lOWbnnZvaWTliJnooajnpLrkuIvovb3lrozmiJDkuobvvIzotoXml7bmiJbkuIvovb3lpLHotKXkvJrmipvlh7rlvILluLjjgIJcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIF9zZW5kX0ludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZShtc2c6IEludm9rZVJlcXVlc3RNZXNzYWdlIHwgSW52b2tlUmVzcG9uc2VNZXNzYWdlLCBmaWxlSUQ6IG51bWJlciwgaW5kZXg6IG51bWJlcik6IFByb21pc2U8QnVmZmVyIHwgdm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZmlsZUlELCBpbmRleCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IGNsZWFuKCk7IHJlamVjdChuZXcgRXJyb3IoJ+ivt+axgui2heaXticpKTsgfSwgdGhpcy50aW1lb3V0KTtcclxuICAgICAgICAgICAgY29uc3QgY2xlYW4gPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2gsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKG1lc3NhZ2UpLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgLy/nm5HlkKzkuIvovb3liLDnmoTmlofku7ZcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCAhPT0gbXNnLmluZGV4KVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCfmlofku7blnKjkvKDovpPov4fnqIvkuK3vvIzpobrluo/lj5HnlJ/plJnkubEnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG1zZy5kYXRhKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8v55uR5ZCs5LiL6L295paH5Lu25aSx6LSlXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZCwgbWVzc2FnZS5yZWNlaXZlciwgbWVzc2FnZS5tZXNzYWdlSUQsIGZpbGVJRF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihtc2cuZXJyb3IpKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8v55uR5ZCs5LiL6L295paH5Lu257uT5p2fXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaCwgbWVzc2FnZS5yZWNlaXZlciwgbWVzc2FnZS5tZXNzYWdlSUQsIGZpbGVJRF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlRmluaXNoTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGVyciA9PiB7IGNsZWFuKCk7IHJlamVjdChlcnIpOyB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9zZW5kX0ludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsIGRhdGE6IEJ1ZmZlcik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZGF0YSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3NlbmRfSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsIGVycm9yOiBFcnJvcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnkpOyAgIC8v5LiN5YWB6K645YaN5LiL6L296K+l5paH5Lu25LqGXHJcblxyXG4gICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEoSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZXJyb3IpKVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UtPiAke2Vycm9yLm1lc3NhZ2V9XCLlpLHotKVgLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9zZW5kX0ludm9rZUZpbGVGaW5pc2hNZXNzYWdlKG1zZzogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSk7ICAgLy/kuI3lhYHorrjlho3kuIvovb3or6Xmlofku7bkuoZcclxuXHJcbiAgICAgICAgdGhpcy5fc2VuZF9NZXNzYWdlRGF0YShJbnZva2VGaWxlRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflkJHlr7nmlrnlj5HpgIFcIkludm9rZUZpbGVGaW5pc2hNZXNzYWdlXCLlpLHotKUnLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfQnJvYWRjYXN0TWVzc2FnZShwYXRoOiBzdHJpbmcsIGRhdGE6IGFueSk6IHZvaWQge1xyXG4gICAgICAgIC8v5Yik5pat5a+55pa55piv5ZCm5rOo5YaM55qE5pyJ5YWz5LqO6L+Z5p2h5bm/5pKt55qE55uR5ZCs5ZmoXHJcbiAgICAgICAgaWYgKHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXNBbmNlc3RvcnMoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ucGF0aC5zcGxpdCgnLicpXSBhcyBhbnkpKVxyXG4gICAgICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKEJyb2FkY2FzdE1lc3NhZ2UuY3JlYXRlKHRoaXMsIHBhdGgsIGRhdGEpKVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDlr7nlpJblub/mkq1cIkJyb2FkY2FzdE1lc3NhZ2VcIuWksei0peOAgnBhdGg6JHtwYXRofWAsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShicm9hZGNhc3RTZW5kZXI6IHN0cmluZywgcGF0aDogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3NvY2tldC5jb25uZWN0ZWQpIHsgICAgLy/liqDov5nkuKrliKTmlq3mmK/kuLrkuobnoa7kv51cIk1lc3NhZ2VUeXBlLl9vbkNsb3NlXCLog73lpJ/op6blj5FcclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UuY3JlYXRlKHRoaXMsIHRoaXMuX21lc3NhZ2VJRCsrLCBicm9hZGNhc3RTZW5kZXIsIHBhdGgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWwgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKHJlc3VsdClcclxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiQnJvYWRjYXN0T3Blbk1lc3NhZ2UgLT4g6YCa55+l5a+55pa5546w5Zyo6KaB5o6l5pS25oyH5a6a6Lev5b6E55qE5bm/5pKtXCLlpLHotKXjgIJicm9hZGNhc3RTZW5kZXI6JHticm9hZGNhc3RTZW5kZXJ9IHBhdGg6JHtwYXRofWAsIGVycikpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldEludGVydmFsKGludGVydmFsLCB0aGlzLnRpbWVvdXQpOyAgICAvL+WIsOS6huaXtumXtOWmguaenOi/mOayoeacieaUtuWIsOWvueaWueWTjeW6lOWwsemHjeaWsOWPkemAgeS4gOasoVxyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2gsIHJlc3VsdC5tZXNzYWdlSURdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCByZXN1bHQubWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgcmVzdWx0Lm1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgcmVzdWx0Lm1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBpbnRlcnZhbCgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiQnJvYWRjYXN0T3Blbk1lc3NhZ2UgLT4g6YCa55+l5a+55pa5546w5Zyo6KaB5o6l5pS25oyH5a6a6Lev5b6E55qE5bm/5pKtXCLlpLHotKXjgIJicm9hZGNhc3RTZW5kZXI6JHticm9hZGNhc3RTZW5kZXJ9IHBhdGg6JHtwYXRofWAsIG5ldyBFcnJvcign572R57uc5Lit5patJykpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9zZW5kX0Jyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlKG1zZzogQnJvYWRjYXN0T3Blbk1lc3NhZ2UpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2cpKVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WQkeWvueaWueWPkemAgVwiQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2VcIuWksei0pScsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9Ccm9hZGNhc3RDbG9zZU1lc3NhZ2UoYnJvYWRjYXN0U2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLl9zb2NrZXQuY29ubmVjdGVkKSB7ICAgIC8v5Yqg6L+Z5Liq5Yik5pat5piv5Li65LqG56Gu5L+dXCJNZXNzYWdlVHlwZS5fb25DbG9zZVwi6IO95aSf6Kem5Y+RXHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IEJyb2FkY2FzdENsb3NlTWVzc2FnZS5jcmVhdGUodGhpcywgdGhpcy5fbWVzc2FnZUlEKyssIGJyb2FkY2FzdFNlbmRlciwgcGF0aCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBpbnRlcnZhbCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEocmVzdWx0KVxyXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg5ZCR5a+55pa55Y+R6YCBXCJCcm9hZGNhc3RDbG9zZU1lc3NhZ2UgLT4g6YCa55+l5a+55pa5546w5Zyo5LiN5YaN5o6l5pS25oyH5a6a6Lev5b6E55qE5bm/5pKtXCLlpLHotKXjgIJicm9hZGNhc3RTZW5kZXI6JHticm9hZGNhc3RTZW5kZXJ9IHBhdGg6JHtwYXRofWAsIGVycikpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldEludGVydmFsKGludGVydmFsLCB0aGlzLnRpbWVvdXQpOyAgICAvL+WIsOS6huaXtumXtOWmguaenOi/mOayoeacieaUtuWIsOWvueaWueWTjeW6lOWwsemHjeaWsOWPkemAgeS4gOasoVxyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoLCByZXN1bHQubWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIHJlc3VsdC5tZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCwgcmVzdWx0Lm1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIHJlc3VsdC5tZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgaW50ZXJ2YWwoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLl9wcmludEVycm9yKGDlkJHlr7nmlrnlj5HpgIFcIkJyb2FkY2FzdENsb3NlTWVzc2FnZSAtPiDpgJrnn6Xlr7nmlrnnjrDlnKjkuI3lho3mjqXmlLbmjIflrprot6/lvoTnmoTlub/mkq1cIuWksei0peOAgmJyb2FkY2FzdFNlbmRlcjoke2Jyb2FkY2FzdFNlbmRlcn0gcGF0aDoke3BhdGh9YCwgbmV3IEVycm9yKCfnvZHnu5zkuK3mlq0nKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3NlbmRfQnJvYWRjYXN0Q2xvc2VGaW5pc2hNZXNzYWdlKG1zZzogQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5fc2VuZF9NZXNzYWdlRGF0YShCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZykpXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcign5ZCR5a+55pa55Y+R6YCBXCJCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2VcIuWksei0pScsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5L6/5LqO5L2/55Soc29ja2V05Y+R6YCB5raI5oGvXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3NlbmRfTWVzc2FnZURhdGEobXNnOiBNZXNzYWdlRGF0YSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IG1zZy5wYWNrKCk7XHJcbiAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKHRydWUsIG1zZyk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLl9zb2NrZXQuc2VuZChyZXN1bHRbMF0sIHJlc3VsdFsxXSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmiZPljbDmlLbliLDmiJblj5HpgIHnmoTmtojmga9cclxuICAgICAqIEBwYXJhbSBzZW5kT3JSZWNlaXZlIOWmguaenOaYr+WPkemAgeWImeS4unRydWXvvIzlpoLmnpzmmK/mjqXmlLbliJnkuLpmYWxzZVxyXG4gICAgICogQHBhcmFtIG1zZyDopoHmiZPljbDnmoTmtojmga9cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfcHJpbnRNZXNzYWdlKHNlbmRPclJlY2VpdmU6IGJvb2xlYW4sIG1zZzogTWVzc2FnZURhdGEpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5wcmludE1lc3NhZ2UpXHJcbiAgICAgICAgICAgIGlmIChzZW5kT3JSZWNlaXZlKVxyXG4gICAgICAgICAgICAgICAgbG9nXHJcbiAgICAgICAgICAgICAgICAgICAgLmxvY2F0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgLmxvY2F0aW9uLmJvbGRcclxuICAgICAgICAgICAgICAgICAgICAudGV4dC5jeWFuLmJvbGQucm91bmRcclxuICAgICAgICAgICAgICAgICAgICAuY29udGVudC5jeWFuKCdyZW1vdGUtaW52b2tlJywgdGhpcy5tb2R1bGVOYW1lLCAn5Y+R6YCBJywgbXNnLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICBsb2dcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uYm9sZFxyXG4gICAgICAgICAgICAgICAgICAgIC50ZXh0LmdyZWVuLmJvbGQucm91bmRcclxuICAgICAgICAgICAgICAgICAgICAuY29udGVudC5ncmVlbigncmVtb3RlLWludm9rZScsIHRoaXMubW9kdWxlTmFtZSwgJ+aUtuWIsCcsIG1zZy50b1N0cmluZygpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaJk+WNsOmUmeivr+a2iOaBr1xyXG4gICAgICogQHBhcmFtIGRlc2Mg5o+P6L+wIFxyXG4gICAgICogQHBhcmFtIGVyciDplJnor6/kv6Hmga9cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfcHJpbnRFcnJvcihkZXNjOiBzdHJpbmcsIGVycjogRXJyb3IpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5wcmludEVycm9yKVxyXG4gICAgICAgICAgICBsb2cud2FyblxyXG4gICAgICAgICAgICAgICAgLmxvY2F0aW9uLndoaXRlXHJcbiAgICAgICAgICAgICAgICAudGl0bGUueWVsbG93XHJcbiAgICAgICAgICAgICAgICAuY29udGVudC55ZWxsb3coJ3JlbW90ZS1pbnZva2UnLCBkZXNjLCBlcnIpO1xyXG4gICAgfVxyXG59Il19
