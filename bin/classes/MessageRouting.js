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
                            this._send_BroadcastCloseMessage(msg.sender, msg.path, true);
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
                        if (msg.includeAncestor)
                            this._messageListener.cancelAncestors([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')]); //清除标记
                        else
                            this._messageListener.cancel([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')]); //清除标记
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
                    eventName = eventName === '' ? levelName : eventName + '.' + levelName;
                    if (level.receivers.size > 0)
                        this._send_BroadcastOpenMessage(broadcastSender, eventName);
                    level.children.forEach((level, levelName) => forEachLevel(eventName, level, levelName));
                };
                level.children.forEach((level, levelName) => forEachLevel('', level, levelName));
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
    _send_BroadcastCloseMessage(broadcastSender, path, includeAncestor) {
        this._send_MessageData(MessageData_1.BroadcastCloseMessage.create(this, broadcastSender, path, includeAncestor))
            .catch(err => this._printError(`向对方发送"BroadcastCloseMessage -> 通知对方现在不再接收指定路径的广播"失败。broadcastSender:${broadcastSender} path:${path}`, err));
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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LENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLO3FCQUNyQixPQUFPLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUN2RixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLFdBQVcsQ0FBQyxJQUFZLEVBQUUsR0FBVTtRQUN4QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1lBQ2hCLHVCQUFHLENBQUMsSUFBSTtpQkFDSCxRQUFRLENBQUMsS0FBSztpQkFDZCxLQUFLLENBQUMsTUFBTTtpQkFDWixPQUFPLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDeEQsQ0FBQztDQUNKO0FBbmRELHdDQW1kQyIsImZpbGUiOiJjbGFzc2VzL01lc3NhZ2VSb3V0aW5nLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRXZlbnRTcGFjZSB9IGZyb20gXCJldmVudHNwYWNlL2Jpbi9jbGFzc2VzL0V2ZW50U3BhY2VcIjtcclxuaW1wb3J0IHsgRXZlbnRMZXZlbCB9IGZyb20gJ2V2ZW50c3BhY2UvYmluL2NsYXNzZXMvRXZlbnRMZXZlbCc7XHJcbmltcG9ydCBsb2cgZnJvbSAnbG9nLWZvcm1hdHRlcic7XHJcblxyXG5pbXBvcnQgeyBNZXNzYWdlVHlwZSB9IGZyb20gJy4uL2ludGVyZmFjZXMvTWVzc2FnZVR5cGUnO1xyXG5pbXBvcnQgeyBDb25uZWN0aW9uU29ja2V0IH0gZnJvbSBcIi4uL2ludGVyZmFjZXMvQ29ubmVjdGlvblNvY2tldFwiO1xyXG5pbXBvcnQgeyBTZW5kaW5nRmlsZSwgSW52b2tlU2VuZGluZ0RhdGEgfSBmcm9tIFwiLi4vaW50ZXJmYWNlcy9JbnZva2VTZW5kaW5nRGF0YVwiO1xyXG5pbXBvcnQge1xyXG4gICAgSW52b2tlUmVxdWVzdE1lc3NhZ2UsXHJcbiAgICBJbnZva2VSZXNwb25zZU1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaW5pc2hNZXNzYWdlLFxyXG4gICAgSW52b2tlRmFpbGVkTWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UsXHJcbiAgICBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0TWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdE9wZW5NZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UsXHJcbiAgICBNZXNzYWdlRGF0YVxyXG59IGZyb20gJy4vTWVzc2FnZURhdGEnO1xyXG5cclxuLyoqXHJcbiAqIOa2iOaBr+i3r+eUseS4reW/g++8jOi0n+i0o+aUtuWPkea2iOaBr1xyXG4gKi9cclxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE1lc3NhZ2VSb3V0aW5nIHtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiHquWinua2iOaBr+e8luWPt+e0ouW8lVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9tZXNzYWdlSUQgPSAwO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6L+e5o6l56uv5Y+jXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBfc29ja2V0OiBDb25uZWN0aW9uU29ja2V0O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM55qE5ZCE57G75raI5oGv55uR5ZCs5ZmoXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBfbWVzc2FnZUxpc3RlbmVyID0gbmV3IEV2ZW50U3BhY2UoKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOivt+axguWTjeW6lOi2heaXtu+8jOm7mOiupDPliIbpkp9cclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgdGltZW91dCA9IDMgKiA2MCAqIDEwMDA7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDpu5jorqTmlofku7bniYfmrrXlpKflsI8gNTEya2JcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgZmlsZVBpZWNlU2l6ZSA9IDUxMiAqIDEwMjQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmtojmga9wYXRo55qE5pyA5aSn6ZW/5bqmXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IHBhdGhNYXhMZW5ndGggPSAyNTY7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPliY3mqKHlnZflkI3np7BcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgbW9kdWxlTmFtZTogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5omT5Y2w5pS25Yiw5ZKM5Y+R6YCB55qE5raI5oGv77yI55So5LqO6LCD6K+V77yJ44CC6buY6K6kZmFsc2VcclxuICAgICAqL1xyXG4gICAgcHJpbnRNZXNzYWdlOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKbmiZPljbDns7vnu5/plJnor6/vvIzpu5jorqR0cnVlXHJcbiAgICAgKi9cclxuICAgIHByaW50RXJyb3I6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHBhcmFtIHNvY2tldCDov57mjqXnq6/lj6NcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOW9k+WJjeaooeWdl+eahOWQjeensFxyXG4gICAgICovXHJcbiAgICBjb25zdHJ1Y3Rvcihzb2NrZXQ6IENvbm5lY3Rpb25Tb2NrZXQsIG1vZHVsZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMubW9kdWxlTmFtZSA9IG1vZHVsZU5hbWU7XHJcbiAgICAgICAgdGhpcy5fc29ja2V0ID0gc29ja2V0O1xyXG5cclxuICAgICAgICB0aGlzLl9zb2NrZXQub25NZXNzYWdlID0gKGhlYWRlcjogc3RyaW5nLCBib2R5OiBCdWZmZXIpID0+IHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBfaGVhZGVyID0gSlNPTi5wYXJzZShoZWFkZXIpO1xyXG5cclxuICAgICAgICAgICAgICAgIHN3aXRjaCAocF9oZWFkZXJbMF0pIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9yZXF1ZXN0OiB7ICAvL+iiq+iwg+eUqOiAheaUtuWIsOiwg+eUqOivt+axglxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VSZXF1ZXN0TWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9IFttc2cudHlwZSwgbXNnLnBhdGhdIGFzIGFueTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzKGV2ZW50TmFtZSkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihldmVudE5hbWUsIG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmFpbGVkTWVzc2FnZShtc2csIG5ldyBFcnJvcihcIuiwg+eUqOeahOaWueazleS4jeWtmOWcqFwiKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2U6IHsgLy/osIPnlKjogIXmlLbliLDosIPnlKjlk43lupRcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlUmVzcG9uc2VNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaDogeyAgIC8v6KKr6LCD55So6ICF5pS25Yiw6LCD55So57uT5p2f5ZON5bqUXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbmlzaE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5yZXNwb25zZU1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZhaWxlZDogeyAgIC8v6LCD55So6ICF5pS25Yiw6LCD55So5aSx6LSl5ZON5bqUXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZhaWxlZE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXNwb25zZToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBldmVudE5hbWUgPSBbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIC4uLm1zZy5wYXRoLnNwbGl0KCcuJyldIGFzIGFueTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzQW5jZXN0b3JzKGV2ZW50TmFtZSkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckFuY2VzdG9ycyhldmVudE5hbWUsIG1zZy5kYXRhLCB0cnVlLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7IC8v5aaC5p6c5rKh5pyJ5rOo5YaM6L+H6L+Z5Liq5bm/5pKt55qE55uR5ZCs5Zmo77yM5bCx6YCa55+l5a+55pa55LiN6KaB5YaN5Y+R6YCB5LqGXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdENsb3NlTWVzc2FnZShtc2cuc2VuZGVyLCBtc2cucGF0aCwgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludEVycm9yKGDmlLbliLDkuobmsqHmnInms6jlhozov4fnmoTlub/mkq0gYnJvYWRjYXN0U2VuZGVyOiR7bXNnLnNlbmRlcn0gcGF0aDoke21zZy5wYXRofWAsIG5ldyBFcnJvcigpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW46IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvL+iusOW9leWvueaWueimgeebkeWQrOWTquS4qui3r+W+hOS4iueahOW5v+aSrVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0LCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnksIHRydWUgYXMgYW55KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZShtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cubWVzc2FnZUlEXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0Q2xvc2VNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5pbmNsdWRlQW5jZXN0b3IpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsQW5jZXN0b3JzKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3QsIC4uLm1zZy5wYXRoLnNwbGl0KCcuJyldIGFzIGFueSk7ICAvL+a4hemZpOagh+iusFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3QsIC4uLm1zZy5wYXRoLnNwbGl0KCcuJyldIGFzIGFueSk7ICAvL+a4hemZpOagh+iusFxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pyq55+l5raI5oGv57G75Z6L77yaJHtwX2hlYWRlcn1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50RXJyb3IoJ+aOpeaUtuWIsOeahOa2iOaBr+agvOW8j+mUmeivr++8micsIGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuX3NvY2tldC5vbk9wZW4gPSAoKSA9PiB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5fb25PcGVuXSBhcyBhbnkpO1xyXG5cclxuICAgICAgICB0aGlzLl9zb2NrZXQub25DbG9zZSA9ICgpID0+IHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLl9vbkNsb3NlXSBhcyBhbnkpO1xyXG5cclxuICAgICAgICAvL+W9k+err+WPo+aJk+W8gOS5i+WQjueri+WIu+mAmuefpeWvueaWueimgeebkeWQrOWTquS6m+W5v+aSrVxyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5fb25PcGVuXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLl9ldmVudExldmVsLmdldENoaWxkTGV2ZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF0gYXMgYW55LCB0cnVlKVxyXG4gICAgICAgICAgICAgICAgLmNoaWxkcmVuLmZvckVhY2goKGxldmVsLCBicm9hZGNhc3RTZW5kZXIpID0+IHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9yRWFjaExldmVsID0gKGV2ZW50TmFtZTogc3RyaW5nLCBsZXZlbDogRXZlbnRMZXZlbCwgbGV2ZWxOYW1lOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnROYW1lID0gZXZlbnROYW1lID09PSAnJyA/IGxldmVsTmFtZSA6IGV2ZW50TmFtZSArICcuJyArIGxldmVsTmFtZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsZXZlbC5yZWNlaXZlcnMuc2l6ZSA+IDApXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKGJyb2FkY2FzdFNlbmRlciwgZXZlbnROYW1lKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldmVsLmNoaWxkcmVuLmZvckVhY2goKGxldmVsLCBsZXZlbE5hbWUpID0+IGZvckVhY2hMZXZlbChldmVudE5hbWUsIGxldmVsLCBsZXZlbE5hbWUpKTtcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBsZXZlbC5jaGlsZHJlbi5mb3JFYWNoKChsZXZlbCwgbGV2ZWxOYW1lKSA9PiBmb3JFYWNoTGV2ZWwoJycsIGxldmVsLCBsZXZlbE5hbWUpKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuX29uQ2xvc2VdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAvL+W9k+i/nuaOpeaWreW8gOWQjueri+WIu+a4heeQhuWvueaWueazqOWGjOi/h+eahOW5v+aSrei3r+W+hFxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdF0gYXMgYW55KTtcclxuXHJcbiAgICAgICAgICAgIC8v5Y+W5raI5omA5pyJ6LCD55So5pON5L2cXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWRdIGFzIGFueSwgeyBlcnJvcjogJ+e9kee7nOS4reaWrScgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZF0gYXMgYW55LCB7IGVycm9yOiAn572R57uc5Lit5patJyB9KTtcclxuXHJcbiAgICAgICAgICAgIC8v5Y+W5raI5omA5pyJ6LCD55So5Y+R6YCBXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maW5pc2hdIGFzIGFueSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIF9zZW5kX0ludm9rZVJlcXVlc3RNZXNzYWdlKHJlY2VpdmVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEpOiBQcm9taXNlPEludm9rZVJlc3BvbnNlTWVzc2FnZT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJtID0gSW52b2tlUmVxdWVzdE1lc3NhZ2UuY3JlYXRlKHRoaXMsIHRoaXMuX21lc3NhZ2VJRCsrLCByZWNlaXZlciwgcGF0aCwgZGF0YSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjbGVhbk1lc3NhZ2VMaXN0ZW5lciA9ICgpID0+IHsgICAvL+a4heeQhuazqOWGjOeahOa2iOaBr+ebkeWQrOWZqFxyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xlYW4gPSB0aGlzLl9zZW5kX0ZpbGUocm0sICgpID0+IHsgY2xlYW5NZXNzYWdlTGlzdGVuZXIoKTsgcmVqZWN0KG5ldyBFcnJvcign6K+35rGC6LaF5pe2JykpOyB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEocm0pLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2UsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnksIChtc2c6IEludm9rZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7IGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7IHJlc29sdmUobXNnKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZhaWxlZCwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgKG1zZzogSW52b2tlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7IGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7IHJlamVjdChuZXcgRXJyb3IobXNnLmVycm9yKSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHsgY2xlYW4oKTsgcmVqZWN0KGVycik7IH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9JbnZva2VSZXNwb25zZU1lc3NhZ2UobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSwgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBybSA9IEludm9rZVJlc3BvbnNlTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCB0aGlzLl9tZXNzYWdlSUQrKywgZGF0YSk7XHJcblxyXG4gICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEocm0pLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocm0uZmlsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0ZpbGUocm0sICgpID0+IHsgfSkoKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFuID0gdGhpcy5fc2VuZF9GaWxlKHJtLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaCwgcm0ucmVjZWl2ZXIsIHJtLnJlc3BvbnNlTWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoLCBybS5yZWNlaXZlciwgcm0ucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSwgY2xlYW4pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSkuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiSW52b2tlUmVzcG9uc2VNZXNzYWdlXCLlpLHotKVgLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaWueS+v19zZW5kX0ludm9rZVJlcXVlc3RNZXNzYWdl5LiOX3NlbmRfSW52b2tlUmVzcG9uc2VNZXNzYWdl5Y+R6YCB5paH5Lu244CCXHJcbiAgICAgKiDlj5HpgIHotoXml7blkI7kvJroh6rliqjmuIXnkIbotYTmupDvvIzkuZ/lj6/kvb/nlKjov5Tlm57nmoRjbGVhbuaWueazleaPkOWJjea4heeQhui1hOa6kFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kX0ZpbGUobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSwgb25UaW1lb3V0OiAoKSA9PiB2b2lkKTogKCkgPT4gdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbWVzc2FnZUlEID0gbXNnIGluc3RhbmNlb2YgSW52b2tlUmVxdWVzdE1lc3NhZ2UgPyBtc2cucmVxdWVzdE1lc3NhZ2VJRCA6IG1zZy5yZXNwb25zZU1lc3NhZ2VJRDtcclxuICAgICAgICBjb25zdCBjbGVhbiA9ICgpID0+IHsgIC8v5riF55CG6LWE5rqQ5Zue6LCDXHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiB7IGNsZWFuKCk7IG9uVGltZW91dCgpOyB9O1xyXG5cclxuICAgICAgICBsZXQgdGltZXIgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMudGltZW91dCk7XHJcblxyXG4gICAgICAgIG1zZy5maWxlcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICBsZXQgc2VuZGluZ0RhdGEgPSBpdGVtLl9kYXRhIGFzIFNlbmRpbmdGaWxlO1xyXG4gICAgICAgICAgICBsZXQgaW5kZXggPSAtMTsgICAgLy/orrDlvZXnlKjmiLfor7fmsYLliLDkuobnrKzlh6DkuKrmlofku7bniYfmrrXkuoZcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHNlbmRfZXJyb3IgPSAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsIGVycjogRXJyb3IpID0+IHtcclxuICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyhlcnIsIHVuZGVmaW5lZCBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9JbnZva2VGaWxlRmFpbGVkTWVzc2FnZShtc2csIGVycik7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aW1lciA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy50aW1lb3V0KTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAobXNnLmluZGV4ID4gaW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbmRleCA9IG1zZy5pbmRleDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VuZF9lcnJvcihtc2csIG5ldyBFcnJvcign6YeN5aSN5LiL6L295paH5Lu254mH5q61JykpOyByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzZW5kaW5nRGF0YS5maWxlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA8IChpdGVtLnNwbGl0TnVtYmVyIGFzIG51bWJlcikpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZShtc2csIHNlbmRpbmdEYXRhLmZpbGUuc2xpY2UoaW5kZXggKiB0aGlzLmZpbGVQaWVjZVNpemUsIChpbmRleCArIDEpICogdGhpcy5maWxlUGllY2VTaXplKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyh1bmRlZmluZWQsIChpbmRleCArIDEpIC8gKGl0ZW0uc3BsaXROdW1iZXIgYXMgbnVtYmVyKSkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHNlbmRfZXJyb3IobXNnLCBlcnIpKTtcclxuICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UobXNnKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VuZGluZ0RhdGEuZmlsZShpbmRleCkudGhlbihkYXRhID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZShtc2csIGRhdGEpLmNhdGNoKGVyciA9PiBzZW5kX2Vycm9yKG1zZywgZXJyKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UobXNnKTtcclxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaChlcnIgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kX2Vycm9yKG1zZywgZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBjbGVhbjtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfSW52b2tlRmluaXNoTWVzc2FnZShtc2c6IEludm9rZVJlc3BvbnNlTWVzc2FnZSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChtc2cuZmlsZXMubGVuZ3RoID4gMClcclxuICAgICAgICAgICAgdGhpcy5fc2VuZF9NZXNzYWdlRGF0YShJbnZva2VGaW5pc2hNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2cpKVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDlkJHlr7nmlrnlj5HpgIFcIkludm9rZUZpbmlzaE1lc3NhZ2VcIuWksei0pWAsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9JbnZva2VGYWlsZWRNZXNzYWdlKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UsIGVycm9yOiBFcnJvcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEoSW52b2tlRmFpbGVkTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBlcnJvcikpXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg5ZCR5a+55pa55Y+R6YCBXCJJbnZva2VGYWlsZWRNZXNzYWdlIC0+ICR7ZXJyb3IubWVzc2FnZX1cIuWksei0pWAsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+R6YCB6K+35rGC77yM5LiL6L295LiA5Liq5paH5Lu254mH5q6177yM6L+U5Zue5LiL6L295Yiw55qE5paH5Lu254mH5q61QnVmZmVy44CC5aaC5p6c6L+U5Zuedm9pZOWImeihqOekuuS4i+i9veWujOaIkOS6hu+8jOi2heaXtuaIluS4i+i9veWksei0peS8muaKm+WHuuW8guW4uOOAglxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UgfCBJbnZva2VSZXNwb25zZU1lc3NhZ2UsIGZpbGVJRDogbnVtYmVyLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTxCdWZmZXIgfCB2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBmaWxlSUQsIGluZGV4KTtcclxuICAgICAgICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgY2xlYW4oKTsgcmVqZWN0KG5ldyBFcnJvcign6K+35rGC6LaF5pe2JykpOyB9LCB0aGlzLnRpbWVvdXQpO1xyXG4gICAgICAgICAgICBjb25zdCBjbGVhbiA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXNwb25zZSwgbWVzc2FnZS5yZWNlaXZlciwgbWVzc2FnZS5tZXNzYWdlSUQsIGZpbGVJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZCwgbWVzc2FnZS5yZWNlaXZlciwgbWVzc2FnZS5tZXNzYWdlSUQsIGZpbGVJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaCwgbWVzc2FnZS5yZWNlaXZlciwgbWVzc2FnZS5tZXNzYWdlSUQsIGZpbGVJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEobWVzc2FnZSkudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAvL+ebkeWQrOS4i+i9veWIsOeahOaWh+S7tlxyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXNwb25zZSwgbWVzc2FnZS5yZWNlaXZlciwgbWVzc2FnZS5tZXNzYWdlSUQsIGZpbGVJRF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYW4oKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ICE9PSBtc2cuaW5kZXgpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ+aWh+S7tuWcqOS8oOi+k+i/h+eoi+S4re+8jOmhuuW6j+WPkeeUn+mUmeS5sScpKTtcclxuICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUobXNnLmRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy/nm5HlkKzkuIvovb3mlofku7blpLHotKVcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkLCBtZXNzYWdlLnJlY2VpdmVyLCBtZXNzYWdlLm1lc3NhZ2VJRCwgZmlsZUlEXSBhcyBhbnksIChtc2c6IEludm9rZUZpbGVGYWlsZWRNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYW4oKTtcclxuICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKG1zZy5lcnJvcikpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy/nm5HlkKzkuIvovb3mlofku7bnu5PmnZ9cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmluaXNoLCBtZXNzYWdlLnJlY2VpdmVyLCBtZXNzYWdlLm1lc3NhZ2VJRCwgZmlsZUlEXSBhcyBhbnksIChtc2c6IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYW4oKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHsgY2xlYW4oKTsgcmVqZWN0KGVycik7IH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3NlbmRfSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZShtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSwgZGF0YTogQnVmZmVyKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEoSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBkYXRhKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfc2VuZF9JbnZva2VGaWxlRmFpbGVkTWVzc2FnZShtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSwgZXJyb3I6IEVycm9yKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSk7ICAgLy/kuI3lhYHorrjlho3kuIvovb3or6Xmlofku7bkuoZcclxuXHJcbiAgICAgICAgdGhpcy5fc2VuZF9NZXNzYWdlRGF0YShJbnZva2VGaWxlRmFpbGVkTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBlcnJvcikpXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg5ZCR5a+55pa55Y+R6YCBXCJJbnZva2VGaWxlRmFpbGVkTWVzc2FnZS0+ICR7ZXJyb3IubWVzc2FnZX1cIuWksei0pWAsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3NlbmRfSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55KTsgICAvL+S4jeWFgeiuuOWGjeS4i+i9veivpeaWh+S7tuS6hlxyXG5cclxuICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2cpKVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WQkeWvueaWueWPkemAgVwiSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2VcIuWksei0pScsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9Ccm9hZGNhc3RNZXNzYWdlKHBhdGg6IHN0cmluZywgZGF0YTogYW55KTogdm9pZCB7XHJcbiAgICAgICAgLy/liKTmlq3lr7nmlrnmmK/lkKbms6jlhoznmoTmnInlhbPkuo7ov5nmnaHlub/mkq3nmoTnm5HlkKzlmahcclxuICAgICAgICBpZiAodGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhc0FuY2VzdG9ycyhbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0LCAuLi5wYXRoLnNwbGl0KCcuJyldIGFzIGFueSkpXHJcbiAgICAgICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEoQnJvYWRjYXN0TWVzc2FnZS5jcmVhdGUodGhpcywgcGF0aCwgZGF0YSkpXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWvueWkluW5v+aSrVwiQnJvYWRjYXN0TWVzc2FnZVwi5aSx6LSl44CCcGF0aDoke3BhdGh9YCwgZXJyKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIF9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5fc29ja2V0LmNvbm5lY3RlZCkgeyAgICAvL+WKoOi/meS4quWIpOaWreaYr+S4uuS6huehruS/nVwiTWVzc2FnZVR5cGUuX29uQ2xvc2VcIuiDveWkn+inpuWPkVxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBCcm9hZGNhc3RPcGVuTWVzc2FnZS5jcmVhdGUodGhpcywgdGhpcy5fbWVzc2FnZUlEKyssIGJyb2FkY2FzdFNlbmRlciwgcGF0aCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBpbnRlcnZhbCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEocmVzdWx0KVxyXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg5ZCR5a+55pa55Y+R6YCBXCJCcm9hZGNhc3RPcGVuTWVzc2FnZSAtPiDpgJrnn6Xlr7nmlrnnjrDlnKjopoHmjqXmlLbmjIflrprot6/lvoTnmoTlub/mkq1cIuWksei0peOAgmJyb2FkY2FzdFNlbmRlcjoke2Jyb2FkY2FzdFNlbmRlcn0gcGF0aDoke3BhdGh9YCwgZXJyKSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0SW50ZXJ2YWwoaW50ZXJ2YWwsIHRoaXMudGltZW91dCk7ICAgIC8v5Yiw5LqG5pe26Ze05aaC5p6c6L+Y5rKh5pyJ5pS25Yiw5a+55pa55ZON5bqU5bCx6YeN5paw5Y+R6YCB5LiA5qyhXHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgcmVzdWx0Lm1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLl9vbkNsb3NlLCBNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2gsIHJlc3VsdC5tZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCByZXN1bHQubWVzc2FnZUlEXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbChbTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCByZXN1bHQubWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGludGVydmFsKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5fcHJpbnRFcnJvcihg5ZCR5a+55pa55Y+R6YCBXCJCcm9hZGNhc3RPcGVuTWVzc2FnZSAtPiDpgJrnn6Xlr7nmlrnnjrDlnKjopoHmjqXmlLbmjIflrprot6/lvoTnmoTlub/mkq1cIuWksei0peOAgmJyb2FkY2FzdFNlbmRlcjoke2Jyb2FkY2FzdFNlbmRlcn0gcGF0aDoke3BhdGh9YCwgbmV3IEVycm9yKCfnvZHnu5zkuK3mlq0nKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3NlbmRfQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UobXNnOiBCcm9hZGNhc3RPcGVuTWVzc2FnZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEoQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZykpXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcign5ZCR5a+55pa55Y+R6YCBXCJCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZVwi5aSx6LSlJywgZXJyKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIF9zZW5kX0Jyb2FkY2FzdENsb3NlTWVzc2FnZShicm9hZGNhc3RTZW5kZXI6IHN0cmluZywgcGF0aDogc3RyaW5nLCBpbmNsdWRlQW5jZXN0b3I/OiBib29sZWFuKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5fc2VuZF9NZXNzYWdlRGF0YShCcm9hZGNhc3RDbG9zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIGJyb2FkY2FzdFNlbmRlciwgcGF0aCwgaW5jbHVkZUFuY2VzdG9yKSlcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDlkJHlr7nmlrnlj5HpgIFcIkJyb2FkY2FzdENsb3NlTWVzc2FnZSAtPiDpgJrnn6Xlr7nmlrnnjrDlnKjkuI3lho3mjqXmlLbmjIflrprot6/lvoTnmoTlub/mkq1cIuWksei0peOAgmJyb2FkY2FzdFNlbmRlcjoke2Jyb2FkY2FzdFNlbmRlcn0gcGF0aDoke3BhdGh9YCwgZXJyKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkvr/kuo7kvb/nlKhzb2NrZXTlj5HpgIHmtojmga9cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZF9NZXNzYWdlRGF0YShtc2c6IE1lc3NhZ2VEYXRhKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gbXNnLnBhY2soKTtcclxuICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UodHJ1ZSwgbXNnKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaJk+WNsOaUtuWIsOaIluWPkemAgeeahOa2iOaBr1xyXG4gICAgICogQHBhcmFtIHNlbmRPclJlY2VpdmUg5aaC5p6c5piv5Y+R6YCB5YiZ5Li6dHJ1Ze+8jOWmguaenOaYr+aOpeaUtuWImeS4umZhbHNlXHJcbiAgICAgKiBAcGFyYW0gbXNnIOimgeaJk+WNsOeahOa2iOaBr1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9wcmludE1lc3NhZ2Uoc2VuZE9yUmVjZWl2ZTogYm9vbGVhbiwgbXNnOiBNZXNzYWdlRGF0YSk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLnByaW50TWVzc2FnZSlcclxuICAgICAgICAgICAgaWYgKHNlbmRPclJlY2VpdmUpXHJcbiAgICAgICAgICAgICAgICBsb2dcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uYm9sZFxyXG4gICAgICAgICAgICAgICAgICAgIC50ZXh0LmN5YW4uYm9sZC5yb3VuZFxyXG4gICAgICAgICAgICAgICAgICAgIC5jb250ZW50LmN5YW4oJ3JlbW90ZS1pbnZva2UnLCB0aGlzLm1vZHVsZU5hbWUsICflj5HpgIEnLCBtc2cudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIGxvZ1xyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi5ib2xkXHJcbiAgICAgICAgICAgICAgICAgICAgLnRleHQuZ3JlZW4uYm9sZC5yb3VuZFxyXG4gICAgICAgICAgICAgICAgICAgIC5jb250ZW50LmdyZWVuKCdyZW1vdGUtaW52b2tlJywgdGhpcy5tb2R1bGVOYW1lLCAn5pS25YiwJywgbXNnLnRvU3RyaW5nKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5omT5Y2w6ZSZ6K+v5raI5oGvXHJcbiAgICAgKiBAcGFyYW0gZGVzYyDmj4/ov7AgXHJcbiAgICAgKiBAcGFyYW0gZXJyIOmUmeivr+S/oeaBr1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9wcmludEVycm9yKGRlc2M6IHN0cmluZywgZXJyOiBFcnJvcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLnByaW50RXJyb3IpXHJcbiAgICAgICAgICAgIGxvZy53YXJuXHJcbiAgICAgICAgICAgICAgICAubG9jYXRpb24ud2hpdGVcclxuICAgICAgICAgICAgICAgIC50aXRsZS55ZWxsb3dcclxuICAgICAgICAgICAgICAgIC5jb250ZW50LnllbGxvdygncmVtb3RlLWludm9rZScsIGRlc2MsIGVycik7XHJcbiAgICB9XHJcbn0iXX0=
