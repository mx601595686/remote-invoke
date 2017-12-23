"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const eventspace_1 = require("eventspace");
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
        this._messageListener = new eventspace_1.default();
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
                        const layer = this._messageListener.get([msg.type, msg.path]);
                        if (layer.has())
                            layer.trigger(msg);
                        else
                            this._send_InvokeFailedMessage(msg, new Error("调用的方法不存在"));
                        break;
                    }
                    case MessageType_1.MessageType.invoke_response: {
                        const msg = MessageData_1.InvokeResponseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.get([msg.type, msg.sender, msg.requestMessageID]).trigger(msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_finish: {
                        const msg = MessageData_1.InvokeFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.get([msg.type, msg.sender, msg.responseMessageID]).trigger(msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_failed: {
                        const msg = MessageData_1.InvokeFailedMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.get([msg.type, msg.sender, msg.requestMessageID]).trigger(msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_request: {
                        const msg = MessageData_1.InvokeFileRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.get([msg.type, msg.sender, msg.messageID, msg.id]).trigger(msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_response: {
                        const msg = MessageData_1.InvokeFileResponseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.get([msg.type, msg.sender, msg.messageID, msg.id]).trigger(msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_failed: {
                        const msg = MessageData_1.InvokeFileFailedMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.get([msg.type, msg.sender, msg.messageID, msg.id]).trigger(msg);
                        break;
                    }
                    case MessageType_1.MessageType.invoke_file_finish: {
                        const msg = MessageData_1.InvokeFileFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.get([msg.type, msg.sender, msg.messageID, msg.id]).trigger(msg);
                        break;
                    }
                    case MessageType_1.MessageType.broadcast: {
                        const msg = MessageData_1.BroadcastMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        const layer = this._messageListener.get([msg.type, msg.sender, ...msg.path.split('.')]);
                        if (layer.hasAncestors())
                            layer.triggerAncestors(msg.data, true, true);
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
                        this._messageListener.get([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')]).data = true;
                        this._send_BroadcastOpenFinishMessage(msg);
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_open_finish: {
                        const msg = MessageData_1.BroadcastOpenFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        this._messageListener.get([msg.type, msg.messageID]).trigger(msg);
                        break;
                    }
                    case MessageType_1.MessageType.broadcast_close: {
                        const msg = MessageData_1.BroadcastCloseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);
                        if (msg.includeAncestor)
                            this._messageListener.get([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')]).forEachAncestors(layer => layer.data = undefined, true); //清除标记
                        else
                            this._messageListener.get([MessageType_1.MessageType._broadcast_white_list, ...msg.path.split('.')]).data = undefined; //清除标记
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
        this._socket.onOpen = () => this._messageListener.get([MessageType_1.MessageType._onOpen]).triggerDescendants();
        this._socket.onClose = () => this._messageListener.get([MessageType_1.MessageType._onClose]).triggerDescendants();
        //当端口打开之后立刻通知对方要监听哪些广播
        this._messageListener.get([MessageType_1.MessageType._onOpen]).on(() => {
            this._messageListener.get([MessageType_1.MessageType.broadcast]).forEachDescendants(layer => {
                if (layer.has()) {
                    const name = layer.fullName;
                    this._send_BroadcastOpenMessage(name[1], layer.fullName.slice(2).join('.'));
                }
            });
        });
        this._messageListener.get([MessageType_1.MessageType._onClose]).on(() => {
            //当连接断开后立刻清理对方注册过的广播路径
            this._messageListener.get([MessageType_1.MessageType._broadcast_white_list]).children.clear();
            //取消所有调用操作
            this._messageListener.get([MessageType_1.MessageType.invoke_failed]).triggerDescendants({ error: '网络中断' });
            this._messageListener.get([MessageType_1.MessageType.invoke_file_failed]).triggerDescendants({ error: '网络中断' });
            //取消所有调用发送
            this._messageListener.get([MessageType_1.MessageType.invoke_finish]).triggerDescendants();
        });
    }
    _send_InvokeRequestMessage(receiver, path, data) {
        return new Promise((resolve, reject) => {
            const rm = MessageData_1.InvokeRequestMessage.create(this, this._messageID++, receiver, path, data);
            const cleanMessageListener = () => {
                this._messageListener.get([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID]).off();
                this._messageListener.get([MessageType_1.MessageType.invoke_failed, rm.receiver, rm.requestMessageID]).off();
            };
            const clean = this._send_File(rm, () => { cleanMessageListener(); reject(new Error('请求超时')); });
            this._send_MessageData(rm).then(() => {
                this._messageListener.get([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID]).once((msg) => {
                    clean();
                    cleanMessageListener();
                    resolve(msg);
                });
                this._messageListener.get([MessageType_1.MessageType.invoke_failed, rm.receiver, rm.requestMessageID]).once((msg) => {
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
                    this._messageListener.get([MessageType_1.MessageType.invoke_finish, rm.receiver, rm.responseMessageID]).off();
                });
                this._messageListener.get([MessageType_1.MessageType.invoke_finish, rm.receiver, rm.responseMessageID]).once(clean);
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
            this._messageListener.get([MessageType_1.MessageType.invoke_file_request, msg.receiver, messageID]).offDescendants();
        };
        const timeout = () => { clean(); onTimeout(); };
        let timer = setTimeout(timeout, MessageRouting.timeout);
        msg.files.forEach(item => {
            let sendingData = item._data;
            let index = -1; //记录用户请求到了第几个文件片段了
            const send_error = (msg, err) => {
                sendingData.onProgress && sendingData.onProgress(err, undefined);
                this._send_InvokeFileFailedMessage(msg, err);
            };
            this._messageListener.get([MessageType_1.MessageType.invoke_file_request, msg.receiver, messageID, item.id]).on((msg) => {
                clearTimeout(timer);
                timer = setTimeout(timeout, MessageRouting.timeout);
                if (msg.index > index) {
                    index = msg.index;
                }
                else {
                    send_error(msg, new Error('重复下载文件片段'));
                    return;
                }
                if (Buffer.isBuffer(sendingData.file)) {
                    if (index < item.splitNumber)
                        this._send_InvokeFileResponseMessage(msg, sendingData.file.slice(index * MessageRouting.filePieceSize, (index + 1) * MessageRouting.filePieceSize))
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
            const timer = setTimeout(() => { clean(); reject(new Error('请求超时')); }, MessageRouting.timeout);
            const clean = () => {
                clearTimeout(timer);
                this._messageListener.get([MessageType_1.MessageType.invoke_file_response, message.receiver, message.messageID, fileID]).off();
                this._messageListener.get([MessageType_1.MessageType.invoke_file_failed, message.receiver, message.messageID, fileID]).off();
                this._messageListener.get([MessageType_1.MessageType.invoke_file_finish, message.receiver, message.messageID, fileID]).off();
            };
            this._send_MessageData(message).then(() => {
                //监听下载到的文件
                this._messageListener.get([MessageType_1.MessageType.invoke_file_response, message.receiver, message.messageID, fileID]).once((msg) => {
                    clean();
                    if (index !== msg.index)
                        reject(new Error('文件在传输过程中，顺序发生错乱'));
                    else
                        resolve(msg.data);
                });
                //监听下载文件失败
                this._messageListener.get([MessageType_1.MessageType.invoke_file_failed, message.receiver, message.messageID, fileID]).once((msg) => {
                    clean();
                    reject(new Error(msg.error));
                });
                //监听下载文件结束
                this._messageListener.get([MessageType_1.MessageType.invoke_file_finish, message.receiver, message.messageID, fileID]).once((msg) => {
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
        this._messageListener.get([MessageType_1.MessageType.invoke_file_request, msg.receiver, msg.messageID, msg.id]).off(); //不允许再下载该文件了
        this._send_MessageData(MessageData_1.InvokeFileFailedMessage.create(this, msg, error))
            .catch(err => this._printError(`向对方发送"InvokeFileFailedMessage-> ${error.message}"失败`, err));
    }
    _send_InvokeFileFinishMessage(msg) {
        this._messageListener.get([MessageType_1.MessageType.invoke_file_request, msg.receiver, msg.messageID, msg.id]).off(); //不允许再下载该文件了
        this._send_MessageData(MessageData_1.InvokeFileFinishMessage.create(this, msg))
            .catch(err => this._printError('向对方发送"InvokeFileFinishMessage"失败', err));
    }
    _send_BroadcastMessage(path, data) {
        //判断对方是否注册的有关于这条广播的监听器
        if (this._messageListener.get([MessageType_1.MessageType._broadcast_white_list, ...path.split('.')]).forEachAncestors(layer => layer.data, true))
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
            const timer = setInterval(interval, MessageRouting.timeout); //到了时间如果还没有收到对方响应就重新发送一次
            this._messageListener.get([MessageType_1.MessageType.broadcast_open_finish, result.messageID]).once(() => {
                clearInterval(timer);
                this._messageListener.get([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_open_finish, result.messageID]).off();
            });
            this._messageListener.get([MessageType_1.MessageType._onClose, MessageType_1.MessageType.broadcast_open_finish, result.messageID]).once(() => {
                clearInterval(timer);
                this._messageListener.get([MessageType_1.MessageType.broadcast_open_finish, result.messageID]).off();
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
/**
 * 请求响应超时，默认3分钟
 */
MessageRouting.timeout = 3 * 60 * 1000;
/**
 * 默认文件片段大小 512kb
 */
MessageRouting.filePieceSize = 512 * 1024;
/**
 * 消息path的最大长度
 */
MessageRouting.pathMaxLength = 256;
exports.MessageRouting = MessageRouting;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsYXNzZXMvTWVzc2FnZVJvdXRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwyQ0FBb0M7QUFDcEMsaURBQWdDO0FBRWhDLDJEQUF3RDtBQUd4RCwrQ0FjdUI7QUFFdkI7O0dBRUc7QUFDSDtJQStDSTs7O09BR0c7SUFDSCxZQUFZLE1BQXdCLEVBQUUsVUFBa0I7UUFsQ3hEOztXQUVHO1FBQ0ssZUFBVSxHQUFHLENBQUMsQ0FBQztRQU92Qjs7V0FFRztRQUNnQixxQkFBZ0IsR0FBRyxJQUFJLG9CQUFVLEVBQUUsQ0FBQztRQU92RDs7V0FFRztRQUNILGlCQUFZLEdBQVksS0FBSyxDQUFDO1FBRTlCOztXQUVHO1FBQ0gsZUFBVSxHQUFZLElBQUksQ0FBQztRQU92QixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztRQUV0QixJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsR0FBRyxDQUFDLE1BQWMsRUFBRSxJQUFZO1lBQ2xELElBQUksQ0FBQztnQkFDRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUVwQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNsQixLQUFLLHlCQUFXLENBQUMsY0FBYyxFQUFFLENBQUM7d0JBQzlCLE1BQU0sR0FBRyxHQUFHLGtDQUFvQixDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUM3RCxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQzt3QkFFL0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBUSxDQUFDLENBQUM7d0JBRXJFLEVBQUUsQ0FB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Z0JBQ2QsdUJBQUc7cUJBQ0UsUUFBUTtxQkFDUixRQUFRLENBQUMsSUFBSTtxQkFDYixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLO3FCQUNwQixPQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUM5RSxJQUFJO2dCQUNBLHVCQUFHO3FCQUNFLFFBQVE7cUJBQ1IsUUFBUSxDQUFDLElBQUk7cUJBQ2IsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSztxQkFDckIsT0FBTyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDdkYsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxXQUFXLENBQUMsSUFBWSxFQUFFLEdBQVU7UUFDeEMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUNoQix1QkFBRyxDQUFDLElBQUk7aUJBQ0gsUUFBUSxDQUFDLEtBQUs7aUJBQ2QsS0FBSyxDQUFDLE1BQU07aUJBQ1osT0FBTyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3hELENBQUM7O0FBeGNEOztHQUVHO0FBQ2Esc0JBQU8sR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztBQUV4Qzs7R0FFRztBQUNhLDRCQUFhLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQztBQUUzQzs7R0FFRztBQUNhLDRCQUFhLEdBQUcsR0FBRyxDQUFDO0FBZnhDLHdDQTJjQyIsImZpbGUiOiJjbGFzc2VzL01lc3NhZ2VSb3V0aW5nLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEV2ZW50U3BhY2UgZnJvbSBcImV2ZW50c3BhY2VcIjtcclxuaW1wb3J0IGxvZyBmcm9tICdsb2ctZm9ybWF0dGVyJztcclxuXHJcbmltcG9ydCB7IE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9NZXNzYWdlVHlwZSc7XHJcbmltcG9ydCB7IENvbm5lY3Rpb25Tb2NrZXQgfSBmcm9tIFwiLi4vaW50ZXJmYWNlcy9Db25uZWN0aW9uU29ja2V0XCI7XHJcbmltcG9ydCB7IFNlbmRpbmdGaWxlLCBJbnZva2VTZW5kaW5nRGF0YSB9IGZyb20gXCIuLi9pbnRlcmZhY2VzL0ludm9rZVNlbmRpbmdEYXRhXCI7XHJcbmltcG9ydCB7XHJcbiAgICBJbnZva2VSZXF1ZXN0TWVzc2FnZSxcclxuICAgIEludm9rZVJlc3BvbnNlTWVzc2FnZSxcclxuICAgIEludm9rZUZpbmlzaE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGYWlsZWRNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVGYWlsZWRNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0T3Blbk1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdENsb3NlTWVzc2FnZSxcclxuICAgIE1lc3NhZ2VEYXRhXHJcbn0gZnJvbSAnLi9NZXNzYWdlRGF0YSc7XHJcblxyXG4vKipcclxuICog5raI5oGv6Lev55Sx5Lit5b+D77yM6LSf6LSj5pS25Y+R5raI5oGvXHJcbiAqL1xyXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTWVzc2FnZVJvdXRpbmcge1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6K+35rGC5ZON5bqU6LaF5pe277yM6buY6K6kM+WIhumSn1xyXG4gICAgICovXHJcbiAgICBzdGF0aWMgcmVhZG9ubHkgdGltZW91dCA9IDMgKiA2MCAqIDEwMDA7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDpu5jorqTmlofku7bniYfmrrXlpKflsI8gNTEya2JcclxuICAgICAqL1xyXG4gICAgc3RhdGljIHJlYWRvbmx5IGZpbGVQaWVjZVNpemUgPSA1MTIgKiAxMDI0O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5raI5oGvcGF0aOeahOacgOWkp+mVv+W6plxyXG4gICAgICovXHJcbiAgICBzdGF0aWMgcmVhZG9ubHkgcGF0aE1heExlbmd0aCA9IDI1NjtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiHquWinua2iOaBr+e8luWPt+e0ouW8lVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9tZXNzYWdlSUQgPSAwO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6L+e5o6l56uv5Y+jXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBfc29ja2V0OiBDb25uZWN0aW9uU29ja2V0O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM55qE5ZCE57G75raI5oGv55uR5ZCs5ZmoXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCByZWFkb25seSBfbWVzc2FnZUxpc3RlbmVyID0gbmV3IEV2ZW50U3BhY2UoKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOW9k+WJjeaooeWdl+WQjeensFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBtb2R1bGVOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKbmiZPljbDmlLbliLDlkozlj5HpgIHnmoTmtojmga/vvIjnlKjkuo7osIPor5XvvInjgILpu5jorqRmYWxzZVxyXG4gICAgICovXHJcbiAgICBwcmludE1lc3NhZ2U6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuaJk+WNsOezu+e7n+mUmeivr++8jOm7mOiupHRydWVcclxuICAgICAqL1xyXG4gICAgcHJpbnRFcnJvcjogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBAcGFyYW0gc29ja2V0IOi/nuaOpeerr+WPo1xyXG4gICAgICogQHBhcmFtIG1vZHVsZU5hbWUg5b2T5YmN5qih5Z2X55qE5ZCN56ewXHJcbiAgICAgKi9cclxuICAgIGNvbnN0cnVjdG9yKHNvY2tldDogQ29ubmVjdGlvblNvY2tldCwgbW9kdWxlTmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5tb2R1bGVOYW1lID0gbW9kdWxlTmFtZTtcclxuICAgICAgICB0aGlzLl9zb2NrZXQgPSBzb2NrZXQ7XHJcblxyXG4gICAgICAgIHRoaXMuX3NvY2tldC5vbk1lc3NhZ2UgPSAoaGVhZGVyOiBzdHJpbmcsIGJvZHk6IEJ1ZmZlcikgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcF9oZWFkZXIgPSBKU09OLnBhcnNlKGhlYWRlcik7XHJcblxyXG4gICAgICAgICAgICAgICAgc3dpdGNoIChwX2hlYWRlclswXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3JlcXVlc3Q6IHsgIC8v6KKr6LCD55So6ICF5pS25Yiw6LCD55So6K+35rGCXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZVJlcXVlc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFttc2cudHlwZSwgbXNnLnBhdGhdIGFzIGFueSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF5ZXIuaGFzKCkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXllci50cmlnZ2VyKG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmFpbGVkTWVzc2FnZShtc2csIG5ldyBFcnJvcihcIuiwg+eUqOeahOaWueazleS4jeWtmOWcqFwiKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2U6IHsgLy/osIPnlKjogIXmlLbliLDosIPnlKjlk43lupRcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlUmVzcG9uc2VNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnkpLnRyaWdnZXIobXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maW5pc2g6IHsgICAvL+iiq+iwg+eUqOiAheaUtuWIsOiwg+eUqOe7k+adn+WTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5yZXNwb25zZU1lc3NhZ2VJRF0gYXMgYW55KS50cmlnZ2VyKG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkOiB7ICAgLy/osIPnlKjogIXmlLbliLDosIPnlKjlpLHotKXlk43lupRcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmFpbGVkTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KS50cmlnZ2VyKG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSkudHJpZ2dlcihtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSkudHJpZ2dlcihtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVGYWlsZWRNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55KS50cmlnZ2VyKG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnkpLnRyaWdnZXIobXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFttc2cudHlwZSwgbXNnLnNlbmRlciwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXllci5oYXNBbmNlc3RvcnMoKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxheWVyLnRyaWdnZXJBbmNlc3RvcnMobXNnLmRhdGEsIHRydWUsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHsgLy/lpoLmnpzmsqHmnInms6jlhozov4fov5nkuKrlub/mkq3nmoTnm5HlkKzlmajvvIzlsLHpgJrnn6Xlr7nmlrnkuI3opoHlho3lj5HpgIHkuoZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKG1zZy5zZW5kZXIsIG1zZy5wYXRoLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50RXJyb3IoYOaUtuWIsOS6huayoeacieazqOWGjOi/h+eahOW5v+aSrSBicm9hZGNhc3RTZW5kZXI6JHttc2cuc2VuZGVyfSBwYXRoOiR7bXNnLnBhdGh9YCwgbmV3IEVycm9yKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RPcGVuTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8v6K6w5b2V5a+55pa56KaB55uR5ZCs5ZOq5Liq6Lev5b6E5LiK55qE5bm/5pKtXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KS5kYXRhID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZShtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbbXNnLnR5cGUsIG1zZy5tZXNzYWdlSURdIGFzIGFueSkudHJpZ2dlcihtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdENsb3NlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtc2cuaW5jbHVkZUFuY2VzdG9yKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0LCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnkpLmZvckVhY2hBbmNlc3RvcnMobGF5ZXIgPT4gbGF5ZXIuZGF0YSA9IHVuZGVmaW5lZCwgdHJ1ZSk7ICAvL+a4hemZpOagh+iusFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3QsIC4uLm1zZy5wYXRoLnNwbGl0KCcuJyldIGFzIGFueSkuZGF0YSA9IHVuZGVmaW5lZDsgIC8v5riF6Zmk5qCH6K6wXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmnKrnn6Xmtojmga/nsbvlnovvvJoke3BfaGVhZGVyfWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRFcnJvcign5o6l5pS25Yiw55qE5raI5oGv5qC85byP6ZSZ6K+v77yaJywgZXJyb3IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5fc29ja2V0Lm9uT3BlbiA9ICgpID0+IHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLl9vbk9wZW5dIGFzIGFueSkudHJpZ2dlckRlc2NlbmRhbnRzKCk7XHJcblxyXG4gICAgICAgIHRoaXMuX3NvY2tldC5vbkNsb3NlID0gKCkgPT4gdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuX29uQ2xvc2VdIGFzIGFueSkudHJpZ2dlckRlc2NlbmRhbnRzKCk7XHJcblxyXG4gICAgICAgIC8v5b2T56uv5Y+j5omT5byA5LmL5ZCO56uL5Yi76YCa55+l5a+55pa56KaB55uR5ZCs5ZOq5Lqb5bm/5pKtXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuX29uT3Blbl0gYXMgYW55KS5vbigoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF0gYXMgYW55KS5mb3JFYWNoRGVzY2VuZGFudHMobGF5ZXIgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGxheWVyLmhhcygpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IGxheWVyLmZ1bGxOYW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfQnJvYWRjYXN0T3Blbk1lc3NhZ2UobmFtZVsxXSwgbGF5ZXIuZnVsbE5hbWUuc2xpY2UoMikuam9pbignLicpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLl9vbkNsb3NlXSBhcyBhbnkpLm9uKCgpID0+IHtcclxuICAgICAgICAgICAgLy/lvZPov57mjqXmlq3lvIDlkI7nq4vliLvmuIXnkIblr7nmlrnms6jlhozov4fnmoTlub/mkq3ot6/lvoRcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0XSBhcyBhbnkpLmNoaWxkcmVuLmNsZWFyKCk7XHJcblxyXG4gICAgICAgICAgICAvL+WPlua2iOaJgOacieiwg+eUqOaTjeS9nFxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkXSBhcyBhbnkpLnRyaWdnZXJEZXNjZW5kYW50cyh7IGVycm9yOiAn572R57uc5Lit5patJyB9KTtcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkXSBhcyBhbnkpLnRyaWdnZXJEZXNjZW5kYW50cyh7IGVycm9yOiAn572R57uc5Lit5patJyB9KTtcclxuXHJcbiAgICAgICAgICAgIC8v5Y+W5raI5omA5pyJ6LCD55So5Y+R6YCBXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLmludm9rZV9maW5pc2hdIGFzIGFueSkudHJpZ2dlckRlc2NlbmRhbnRzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvdGVjdGVkIF9zZW5kX0ludm9rZVJlcXVlc3RNZXNzYWdlKHJlY2VpdmVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEpOiBQcm9taXNlPEludm9rZVJlc3BvbnNlTWVzc2FnZT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJtID0gSW52b2tlUmVxdWVzdE1lc3NhZ2UuY3JlYXRlKHRoaXMsIHRoaXMuX21lc3NhZ2VJRCsrLCByZWNlaXZlciwgcGF0aCwgZGF0YSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjbGVhbk1lc3NhZ2VMaXN0ZW5lciA9ICgpID0+IHsgICAvL+a4heeQhuazqOWGjOeahOa2iOaBr+ebkeWQrOWZqFxyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KS5vZmYoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnkpLm9mZigpO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xlYW4gPSB0aGlzLl9zZW5kX0ZpbGUocm0sICgpID0+IHsgY2xlYW5NZXNzYWdlTGlzdGVuZXIoKTsgcmVqZWN0KG5ldyBFcnJvcign6K+35rGC6LaF5pe2JykpOyB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEocm0pLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KS5vbmNlKChtc2c6IEludm9rZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7IGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7IHJlc29sdmUobXNnKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnkpLm9uY2UoKG1zZzogSW52b2tlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7IGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7IHJlamVjdChuZXcgRXJyb3IobXNnLmVycm9yKSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHsgY2xlYW4oKTsgcmVqZWN0KGVycik7IH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9JbnZva2VSZXNwb25zZU1lc3NhZ2UobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSwgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBybSA9IEludm9rZVJlc3BvbnNlTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCB0aGlzLl9tZXNzYWdlSUQrKywgZGF0YSk7XHJcblxyXG4gICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEocm0pLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocm0uZmlsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0ZpbGUocm0sICgpID0+IHsgfSkoKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFuID0gdGhpcy5fc2VuZF9GaWxlKHJtLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaCwgcm0ucmVjZWl2ZXIsIHJtLnJlc3BvbnNlTWVzc2FnZUlEXSBhcyBhbnkpLm9mZigpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaCwgcm0ucmVjZWl2ZXIsIHJtLnJlc3BvbnNlTWVzc2FnZUlEXSBhcyBhbnkpLm9uY2UoY2xlYW4pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSkuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiSW52b2tlUmVzcG9uc2VNZXNzYWdlXCLlpLHotKVgLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaWueS+v19zZW5kX0ludm9rZVJlcXVlc3RNZXNzYWdl5LiOX3NlbmRfSW52b2tlUmVzcG9uc2VNZXNzYWdl5Y+R6YCB5paH5Lu244CCXHJcbiAgICAgKiDlj5HpgIHotoXml7blkI7kvJroh6rliqjmuIXnkIbotYTmupDvvIzkuZ/lj6/kvb/nlKjov5Tlm57nmoRjbGVhbuaWueazleaPkOWJjea4heeQhui1hOa6kFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kX0ZpbGUobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSwgb25UaW1lb3V0OiAoKSA9PiB2b2lkKTogKCkgPT4gdm9pZCB7XHJcbiAgICAgICAgY29uc3QgbWVzc2FnZUlEID0gbXNnIGluc3RhbmNlb2YgSW52b2tlUmVxdWVzdE1lc3NhZ2UgPyBtc2cucmVxdWVzdE1lc3NhZ2VJRCA6IG1zZy5yZXNwb25zZU1lc3NhZ2VJRDtcclxuICAgICAgICBjb25zdCBjbGVhbiA9ICgpID0+IHsgIC8v5riF55CG6LWE5rqQ5Zue6LCDXHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbWVzc2FnZUlEXSBhcyBhbnkpLm9mZkRlc2NlbmRhbnRzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiB7IGNsZWFuKCk7IG9uVGltZW91dCgpOyB9O1xyXG5cclxuICAgICAgICBsZXQgdGltZXIgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIE1lc3NhZ2VSb3V0aW5nLnRpbWVvdXQpO1xyXG5cclxuICAgICAgICBtc2cuZmlsZXMuZm9yRWFjaChpdGVtID0+IHtcclxuICAgICAgICAgICAgbGV0IHNlbmRpbmdEYXRhID0gaXRlbS5fZGF0YSBhcyBTZW5kaW5nRmlsZTtcclxuICAgICAgICAgICAgbGV0IGluZGV4ID0gLTE7ICAgIC8v6K6w5b2V55So5oi36K+35rGC5Yiw5LqG56ys5Yeg5Liq5paH5Lu254mH5q615LqGXHJcblxyXG4gICAgICAgICAgICBjb25zdCBzZW5kX2Vycm9yID0gKG1zZzogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLCBlcnI6IEVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBzZW5kaW5nRGF0YS5vblByb2dyZXNzICYmIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MoZXJyLCB1bmRlZmluZWQgYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UobXNnLCBlcnIpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55KS5vbigobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aW1lciA9IHNldFRpbWVvdXQodGltZW91dCwgTWVzc2FnZVJvdXRpbmcudGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKG1zZy5pbmRleCA+IGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBtc2cuaW5kZXg7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRfZXJyb3IobXNnLCBuZXcgRXJyb3IoJ+mHjeWkjeS4i+i9veaWh+S7tueJh+autScpKTsgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc2VuZGluZ0RhdGEuZmlsZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPCAoaXRlbS5zcGxpdE51bWJlciBhcyBudW1iZXIpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0ludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UobXNnLCBzZW5kaW5nRGF0YS5maWxlLnNsaWNlKGluZGV4ICogTWVzc2FnZVJvdXRpbmcuZmlsZVBpZWNlU2l6ZSwgKGluZGV4ICsgMSkgKiBNZXNzYWdlUm91dGluZy5maWxlUGllY2VTaXplKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyh1bmRlZmluZWQsIChpbmRleCArIDEpIC8gKGl0ZW0uc3BsaXROdW1iZXIgYXMgbnVtYmVyKSkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHNlbmRfZXJyb3IobXNnLCBlcnIpKTtcclxuICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UobXNnKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VuZGluZ0RhdGEuZmlsZShpbmRleCkudGhlbihkYXRhID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZShtc2csIGRhdGEpLmNhdGNoKGVyciA9PiBzZW5kX2Vycm9yKG1zZywgZXJyKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRfSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UobXNnKTtcclxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaChlcnIgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kX2Vycm9yKG1zZywgZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBjbGVhbjtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfSW52b2tlRmluaXNoTWVzc2FnZShtc2c6IEludm9rZVJlc3BvbnNlTWVzc2FnZSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChtc2cuZmlsZXMubGVuZ3RoID4gMClcclxuICAgICAgICAgICAgdGhpcy5fc2VuZF9NZXNzYWdlRGF0YShJbnZva2VGaW5pc2hNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2cpKVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDlkJHlr7nmlrnlj5HpgIFcIkludm9rZUZpbmlzaE1lc3NhZ2VcIuWksei0pWAsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9JbnZva2VGYWlsZWRNZXNzYWdlKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UsIGVycm9yOiBFcnJvcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEoSW52b2tlRmFpbGVkTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBlcnJvcikpXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg5ZCR5a+55pa55Y+R6YCBXCJJbnZva2VGYWlsZWRNZXNzYWdlIC0+ICR7ZXJyb3IubWVzc2FnZX1cIuWksei0pWAsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+R6YCB6K+35rGC77yM5LiL6L295LiA5Liq5paH5Lu254mH5q6177yM6L+U5Zue5LiL6L295Yiw55qE5paH5Lu254mH5q61QnVmZmVy44CC5aaC5p6c6L+U5Zuedm9pZOWImeihqOekuuS4i+i9veWujOaIkOS6hu+8jOi2heaXtuaIluS4i+i9veWksei0peS8muaKm+WHuuW8guW4uOOAglxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UgfCBJbnZva2VSZXNwb25zZU1lc3NhZ2UsIGZpbGVJRDogbnVtYmVyLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTxCdWZmZXIgfCB2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBmaWxlSUQsIGluZGV4KTtcclxuICAgICAgICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgY2xlYW4oKTsgcmVqZWN0KG5ldyBFcnJvcign6K+35rGC6LaF5pe2JykpOyB9LCBNZXNzYWdlUm91dGluZy50aW1lb3V0KTtcclxuICAgICAgICAgICAgY29uc3QgY2xlYW4gPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSkub2ZmKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSkub2ZmKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2gsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSkub2ZmKCk7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKG1lc3NhZ2UpLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgLy/nm5HlkKzkuIvovb3liLDnmoTmlofku7ZcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3Jlc3BvbnNlLCBtZXNzYWdlLnJlY2VpdmVyLCBtZXNzYWdlLm1lc3NhZ2VJRCwgZmlsZUlEXSBhcyBhbnkpLm9uY2UoKG1zZzogSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCAhPT0gbXNnLmluZGV4KVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCfmlofku7blnKjkvKDovpPov4fnqIvkuK3vvIzpobrluo/lj5HnlJ/plJnkubEnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG1zZy5kYXRhKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8v55uR5ZCs5LiL6L295paH5Lu25aSx6LSlXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSkub25jZSgobXNnOiBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihtc2cuZXJyb3IpKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8v55uR5ZCs5LiL6L295paH5Lu257uT5p2fXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2gsIG1lc3NhZ2UucmVjZWl2ZXIsIG1lc3NhZ2UubWVzc2FnZUlELCBmaWxlSURdIGFzIGFueSkub25jZSgobXNnOiBJbnZva2VGaWxlRmluaXNoTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGVyciA9PiB7IGNsZWFuKCk7IHJlamVjdChlcnIpOyB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9zZW5kX0ludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsIGRhdGE6IEJ1ZmZlcik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZGF0YSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3NlbmRfSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UobXNnOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsIGVycm9yOiBFcnJvcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnkpLm9mZigpOyAgIC8v5LiN5YWB6K645YaN5LiL6L296K+l5paH5Lu25LqGXHJcblxyXG4gICAgICAgIHRoaXMuX3NlbmRfTWVzc2FnZURhdGEoSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZywgZXJyb3IpKVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UtPiAke2Vycm9yLm1lc3NhZ2V9XCLlpLHotKVgLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9zZW5kX0ludm9rZUZpbGVGaW5pc2hNZXNzYWdlKG1zZzogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSkub2ZmKCk7ICAgLy/kuI3lhYHorrjlho3kuIvovb3or6Xmlofku7bkuoZcclxuXHJcbiAgICAgICAgdGhpcy5fc2VuZF9NZXNzYWdlRGF0YShJbnZva2VGaWxlRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflkJHlr7nmlrnlj5HpgIFcIkludm9rZUZpbGVGaW5pc2hNZXNzYWdlXCLlpLHotKUnLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfQnJvYWRjYXN0TWVzc2FnZShwYXRoOiBzdHJpbmcsIGRhdGE6IGFueSk6IHZvaWQge1xyXG4gICAgICAgIC8v5Yik5pat5a+55pa55piv5ZCm5rOo5YaM55qE5pyJ5YWz5LqO6L+Z5p2h5bm/5pKt55qE55uR5ZCs5ZmoXHJcbiAgICAgICAgaWYgKHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ucGF0aC5zcGxpdCgnLicpXSBhcyBhbnkpLmZvckVhY2hBbmNlc3RvcnMobGF5ZXIgPT4gbGF5ZXIuZGF0YSBhcyBhbnksIHRydWUpKVxyXG4gICAgICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKEJyb2FkY2FzdE1lc3NhZ2UuY3JlYXRlKHRoaXMsIHBhdGgsIGRhdGEpKVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKGDlr7nlpJblub/mkq1cIkJyb2FkY2FzdE1lc3NhZ2VcIuWksei0peOAgnBhdGg6JHtwYXRofWAsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3RlY3RlZCBfc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShicm9hZGNhc3RTZW5kZXI6IHN0cmluZywgcGF0aDogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3NvY2tldC5jb25uZWN0ZWQpIHsgICAgLy/liqDov5nkuKrliKTmlq3mmK/kuLrkuobnoa7kv51cIk1lc3NhZ2VUeXBlLl9vbkNsb3NlXCLog73lpJ/op6blj5FcclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UuY3JlYXRlKHRoaXMsIHRoaXMuX21lc3NhZ2VJRCsrLCBicm9hZGNhc3RTZW5kZXIsIHBhdGgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWwgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKHJlc3VsdClcclxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiQnJvYWRjYXN0T3Blbk1lc3NhZ2UgLT4g6YCa55+l5a+55pa5546w5Zyo6KaB5o6l5pS25oyH5a6a6Lev5b6E55qE5bm/5pKtXCLlpLHotKXjgIJicm9hZGNhc3RTZW5kZXI6JHticm9hZGNhc3RTZW5kZXJ9IHBhdGg6JHtwYXRofWAsIGVycikpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldEludGVydmFsKGludGVydmFsLCBNZXNzYWdlUm91dGluZy50aW1lb3V0KTsgICAgLy/liLDkuobml7bpl7TlpoLmnpzov5jmsqHmnInmlLbliLDlr7nmlrnlk43lupTlsLHph43mlrDlj5HpgIHkuIDmrKFcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5nZXQoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgcmVzdWx0Lm1lc3NhZ2VJRF0gYXMgYW55KS5vbmNlKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmdldChbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgcmVzdWx0Lm1lc3NhZ2VJRF0gYXMgYW55KS5vZmYoKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoLCByZXN1bHQubWVzc2FnZUlEXSBhcyBhbnkpLm9uY2UoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuZ2V0KFtNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2gsIHJlc3VsdC5tZXNzYWdlSURdIGFzIGFueSkub2ZmKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgaW50ZXJ2YWwoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLl9wcmludEVycm9yKGDlkJHlr7nmlrnlj5HpgIFcIkJyb2FkY2FzdE9wZW5NZXNzYWdlIC0+IOmAmuefpeWvueaWueeOsOWcqOimgeaOpeaUtuaMh+Wumui3r+W+hOeahOW5v+aSrVwi5aSx6LSl44CCYnJvYWRjYXN0U2VuZGVyOiR7YnJvYWRjYXN0U2VuZGVyfSBwYXRoOiR7cGF0aH1gLCBuZXcgRXJyb3IoJ+e9kee7nOS4reaWrScpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfc2VuZF9Ccm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZShtc2c6IEJyb2FkY2FzdE9wZW5NZXNzYWdlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5fc2VuZF9NZXNzYWdlRGF0YShCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflkJHlr7nmlrnlj5HpgIFcIkJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlXCLlpLHotKUnLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcm90ZWN0ZWQgX3NlbmRfQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGluY2x1ZGVBbmNlc3Rvcj86IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLl9zZW5kX01lc3NhZ2VEYXRhKEJyb2FkY2FzdENsb3NlTWVzc2FnZS5jcmVhdGUodGhpcywgYnJvYWRjYXN0U2VuZGVyLCBwYXRoLCBpbmNsdWRlQW5jZXN0b3IpKVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoYOWQkeWvueaWueWPkemAgVwiQnJvYWRjYXN0Q2xvc2VNZXNzYWdlIC0+IOmAmuefpeWvueaWueeOsOWcqOS4jeWGjeaOpeaUtuaMh+Wumui3r+W+hOeahOW5v+aSrVwi5aSx6LSl44CCYnJvYWRjYXN0U2VuZGVyOiR7YnJvYWRjYXN0U2VuZGVyfSBwYXRoOiR7cGF0aH1gLCBlcnIpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOS+v+S6juS9v+eUqHNvY2tldOWPkemAgea2iOaBr1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kX01lc3NhZ2VEYXRhKG1zZzogTWVzc2FnZURhdGEpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBtc2cucGFjaygpO1xyXG4gICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZSh0cnVlLCBtc2cpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5fc29ja2V0LnNlbmQocmVzdWx0WzBdLCByZXN1bHRbMV0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5omT5Y2w5pS25Yiw5oiW5Y+R6YCB55qE5raI5oGvXHJcbiAgICAgKiBAcGFyYW0gc2VuZE9yUmVjZWl2ZSDlpoLmnpzmmK/lj5HpgIHliJnkuLp0cnVl77yM5aaC5p6c5piv5o6l5pS25YiZ5Li6ZmFsc2VcclxuICAgICAqIEBwYXJhbSBtc2cg6KaB5omT5Y2w55qE5raI5oGvXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3ByaW50TWVzc2FnZShzZW5kT3JSZWNlaXZlOiBib29sZWFuLCBtc2c6IE1lc3NhZ2VEYXRhKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMucHJpbnRNZXNzYWdlKVxyXG4gICAgICAgICAgICBpZiAoc2VuZE9yUmVjZWl2ZSlcclxuICAgICAgICAgICAgICAgIGxvZ1xyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi5ib2xkXHJcbiAgICAgICAgICAgICAgICAgICAgLnRleHQuY3lhbi5ib2xkLnJvdW5kXHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQuY3lhbigncmVtb3RlLWludm9rZScsIHRoaXMubW9kdWxlTmFtZSwgJ+WPkemAgScsIG1zZy50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgbG9nXHJcbiAgICAgICAgICAgICAgICAgICAgLmxvY2F0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgLmxvY2F0aW9uLmJvbGRcclxuICAgICAgICAgICAgICAgICAgICAudGV4dC5ncmVlbi5ib2xkLnJvdW5kXHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQuZ3JlZW4oJ3JlbW90ZS1pbnZva2UnLCB0aGlzLm1vZHVsZU5hbWUsICfmlLbliLAnLCBtc2cudG9TdHJpbmcoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmiZPljbDplJnor6/mtojmga9cclxuICAgICAqIEBwYXJhbSBkZXNjIOaPj+i/sCBcclxuICAgICAqIEBwYXJhbSBlcnIg6ZSZ6K+v5L+h5oGvXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3ByaW50RXJyb3IoZGVzYzogc3RyaW5nLCBlcnI6IEVycm9yKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMucHJpbnRFcnJvcilcclxuICAgICAgICAgICAgbG9nLndhcm5cclxuICAgICAgICAgICAgICAgIC5sb2NhdGlvbi53aGl0ZVxyXG4gICAgICAgICAgICAgICAgLnRpdGxlLnllbGxvd1xyXG4gICAgICAgICAgICAgICAgLmNvbnRlbnQueWVsbG93KCdyZW1vdGUtaW52b2tlJywgZGVzYywgZXJyKTtcclxuICAgIH1cclxufSJdfQ==
