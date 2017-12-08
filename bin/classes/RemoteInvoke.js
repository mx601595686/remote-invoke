"use strict";
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
        this._messageListener.receive([MessageType_1.MessageType.invoke_request, path], async (msg) => {
            const { data, clean } = this._prepare_InvokeReceivingData(msg);
            try {
                const result = await func(data) || { data: null };
                const rm = MessageData_1.InvokeResponseMessage.create(this, msg, this._messageID++, result);
                try {
                    if (rm.files.length === 0) {
                        await this._prepare_InvokeSendingData(rm);
                    }
                    else {
                        const clean = await this._prepare_InvokeSendingData(rm, () => {
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
        });
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
                    this._messageListener.receiveOnce([MessageType_1.MessageType.invoke_response, rm.receiver, rm.requestMessageID], async (msg) => {
                        cleanSendRequest();
                        cleanMessageListener();
                        const { data, clean } = this._prepare_InvokeReceivingData(msg);
                        try {
                            const result = [];
                            for (const item of data.files) {
                                result.push({ name: item.name, data: await item.getFile() });
                            }
                            resolve({ data: data.data, files: result });
                        }
                        catch (error) {
                            reject(error);
                        }
                        finally {
                            clean();
                        }
                    });
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
    async broadcast(path, data = null) {
        //判断对方是否注册的有关于这条广播的监听器
        if (this._messageListener.hasAncestors([MessageType_1.MessageType._broadcast_white_list, ...path.split('.')])) {
            await this._sendMessage(MessageData_1.BroadcastMessage.create(this, path, data));
        }
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
                    .content('remote-invoke', '发送', MessageType_1.MessageType[msg.type], JSON.stringify(msg, undefined, 4));
            else
                log_formatter_1.default
                    .location
                    .location.green.bold
                    .title
                    .content('remote-invoke', '收到', MessageType_1.MessageType[msg.type], JSON.stringify(msg, undefined, 4));
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
    async _prepare_InvokeSendingData(msg, onTimeout) {
        await this._sendMessage(msg);
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
                        sendingData.file(index).then(data => {
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUFlLFNBQVMsSUFBSSxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUVsSCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFJLHdCQUF3QjtZQUU5RSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLENBQUMseUJBQVcsQ0FBQyxzQkFBc0IsRUFBRSxTQUFTLENBQVEsRUFBRTtnQkFDdEYsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNyQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUMseUJBQVcsQ0FBQyxRQUFRLEVBQUUseUJBQVcsQ0FBQyxzQkFBc0IsRUFBRSxTQUFTLENBQVEsQ0FBQyxDQUFDO1lBQy9HLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxDQUFDLHlCQUFXLENBQUMsUUFBUSxFQUFFLHlCQUFXLENBQUMsc0JBQXNCLEVBQUUsU0FBUyxDQUFRLEVBQUU7Z0JBQzVHLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDckIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDLHlCQUFXLENBQUMsc0JBQXNCLEVBQUUsU0FBUyxDQUFRLENBQUMsQ0FBQztZQUN6RixDQUFDLENBQUMsQ0FBQztZQUVILFFBQVEsRUFBRSxDQUFDO1FBQ2YsQ0FBQztJQUNMLENBQUM7Q0FDSjtBQTdwQkQsb0NBNnBCQyIsImZpbGUiOiJjbGFzc2VzL1JlbW90ZUludm9rZS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEV2ZW50U3BhY2UgfSBmcm9tICdldmVudHNwYWNlJztcclxuaW1wb3J0IHsgRXZlbnRMZXZlbCB9IGZyb20gJ2V2ZW50c3BhY2UvYmluL2NsYXNzZXMvRXZlbnRMZXZlbCc7XHJcbmltcG9ydCBsb2cgZnJvbSAnbG9nLWZvcm1hdHRlcic7XHJcblxyXG5pbXBvcnQgeyBNZXNzYWdlVHlwZSB9IGZyb20gJy4uL2ludGVyZmFjZXMvTWVzc2FnZVR5cGUnO1xyXG5pbXBvcnQgeyBDb25uZWN0aW9uU29ja2V0IH0gZnJvbSBcIi4uL2ludGVyZmFjZXMvQ29ubmVjdGlvblNvY2tldFwiO1xyXG5pbXBvcnQgeyBJbnZva2VSZWNlaXZpbmdEYXRhLCBSZWNlaXZpbmdGaWxlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9JbnZva2VSZWNlaXZpbmdEYXRhJztcclxuaW1wb3J0IHsgSW52b2tlU2VuZGluZ0RhdGEsIFNlbmRpbmdGaWxlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9JbnZva2VTZW5kaW5nRGF0YSc7XHJcbmltcG9ydCB7XHJcbiAgICBJbnZva2VSZXF1ZXN0TWVzc2FnZSxcclxuICAgIEludm9rZVJlc3BvbnNlTWVzc2FnZSxcclxuICAgIEludm9rZUZpbmlzaE1lc3NhZ2UsXHJcbiAgICBJbnZva2VGYWlsZWRNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZSxcclxuICAgIEludm9rZUZpbGVGYWlsZWRNZXNzYWdlLFxyXG4gICAgSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RNZXNzYWdlLFxyXG4gICAgQnJvYWRjYXN0T3Blbk1lc3NhZ2UsXHJcbiAgICBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdENsb3NlTWVzc2FnZSxcclxuICAgIEJyb2FkY2FzdENsb3NlRmluaXNoTWVzc2FnZSxcclxuICAgIE1lc3NhZ2VEYXRhXHJcbn0gZnJvbSAnLi9NZXNzYWdlRGF0YSc7XHJcblxyXG5leHBvcnQgY2xhc3MgUmVtb3RlSW52b2tlIHtcclxuXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlTGlzdGVuZXIgPSBuZXcgRXZlbnRTcGFjZSgpOyAgIC8v5rOo5YaM55qE5ZCE57G75raI5oGv55uR5ZCs5ZmoICAgIFxyXG5cclxuICAgIHByaXZhdGUgX21lc3NhZ2VJRDogbnVtYmVyID0gMDsgLy/oh6rlop7mtojmga/ntKLlvJXnvJblj7dcclxuXHJcbiAgICAvKipcclxuICAgICAqIOi/nuaOpeerr+WPo1xyXG4gICAgICovXHJcbiAgICByZWFkb25seSBzb2NrZXQ6IENvbm5lY3Rpb25Tb2NrZXQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor7fmsYLlk43lupTotoXml7bvvIzpu5jorqQz5YiG6ZKfXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IHRpbWVvdXQ6IG51bWJlciA9IDMgKiA2MCAqIDEwMDA7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDpu5jorqTmlofku7bniYfmrrXlpKflsI8gNTEya2JcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgZmlsZVBpZWNlU2l6ZSA9IDUxMiAqIDEwMjQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPliY3mqKHlnZflkI3np7BcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgbW9kdWxlTmFtZTogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5omT5Y2w5pS25Yiw5ZKM5Y+R6YCB55qE5raI5oGv77yI55So5LqO6LCD6K+V77yJ44CC6buY6K6kZmFsc2VcclxuICAgICAqL1xyXG4gICAgcHJpbnRNZXNzYWdlOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKbmiZPljbDns7vnu5/plJnor6/vvIzpu5jorqR0cnVlXHJcbiAgICAgKi9cclxuICAgIHByaW50RXJyb3I6IGJvb2xlYW4gPSB0cnVlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQHBhcmFtIHNvY2tldCDov57mjqXnq6/lj6NcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOW9k+WJjeaooeWdl+eahOWQjeensFxyXG4gICAgICovXHJcbiAgICBjb25zdHJ1Y3Rvcihzb2NrZXQ6IENvbm5lY3Rpb25Tb2NrZXQsIG1vZHVsZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMubW9kdWxlTmFtZSA9IG1vZHVsZU5hbWU7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQgPSBzb2NrZXQ7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNvY2tldC5yaSAhPSBudWxsKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+S8oOWFpeeahENvbm5lY3Rpb25Tb2NrZXTlt7LlnKjlhbbku5blnLDmlrnooqvkvb/nlKgnKTtcclxuXHJcbiAgICAgICAgdGhpcy5zb2NrZXQucmkgPSB0aGlzO1xyXG5cclxuICAgICAgICB0aGlzLnNvY2tldC5vbk1lc3NhZ2UgPSAoaGVhZGVyOiBzdHJpbmcsIGJvZHk6IEJ1ZmZlcikgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcF9oZWFkZXIgPSBKU09OLnBhcnNlKGhlYWRlcik7XHJcblxyXG4gICAgICAgICAgICAgICAgc3dpdGNoIChwX2hlYWRlclswXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3JlcXVlc3Q6IHsgIC8v6KKr6LCD55So6ICF5pS25Yiw6LCD55So6K+35rGCXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZVJlcXVlc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cucGF0aF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlOiB7IC8v6LCD55So6ICF5pS25Yiw6LCD55So5ZON5bqUXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maW5pc2g6IHsgICAvL+iiq+iwg+eUqOiAheaUtuWIsOiwg+eUqOe7k+adn+WTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVzcG9uc2VNZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQ6IHsgICAvL+iwg+eUqOiAheaUtuWIsOiwg+eUqOWksei0peWTjeW6lFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGYWlsZWRNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLnNlbmRlciwgbXNnLm1lc3NhZ2VJRCwgbXNnLmlkXSBhcyBhbnksIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQ6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5zZW5kZXIsIG1zZy5tZXNzYWdlSUQsIG1zZy5pZF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXIoW21zZy50eXBlLCBtc2cuc2VuZGVyLCBtc2cubWVzc2FnZUlELCBtc2cuaWRdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RNZXNzYWdlLnBhcnNlKHRoaXMsIHBfaGVhZGVyLCBib2R5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKGZhbHNlLCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXZlbnROYW1lID0gW21zZy50eXBlLCBtc2cuc2VuZGVyLCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXNBbmNlc3RvcnMoZXZlbnROYW1lKSkgeyAgIC8v5aaC5p6c5rKh5pyJ5rOo5YaM6L+H6L+Z5Liq5bm/5pKt55qE55uR5ZCs5Zmo77yM5bCx6YCa55+l5a+55pa55LiN6KaB5YaN5Y+R6YCB5LqGXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdENsb3NlTWVzc2FnZShtc2cuc2VuZGVyLCBtc2cucGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckFuY2VzdG9ycyhldmVudE5hbWUsIG1zZy5kYXRhLCB0cnVlLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW46IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gQnJvYWRjYXN0T3Blbk1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuX2Jyb2FkY2FzdF93aGl0ZV9saXN0LCAuLi5tc2cucGF0aC5zcGxpdCgnLicpXSBhcyBhbnksIG1zZy5wYXRoIGFzIGFueSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcign5ZON5bqU5a+55pa555qEYnJvYWRjYXN0X29wZW7or7fmsYLlpLHotKUnLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyKFttc2cudHlwZSwgbXNnLm1lc3NhZ2VJRF0gYXMgYW55LCBtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IEJyb2FkY2FzdENsb3NlTWVzc2FnZS5wYXJzZSh0aGlzLCBwX2hlYWRlciwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByaW50TWVzc2FnZShmYWxzZSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ubXNnLnBhdGguc3BsaXQoJy4nKV0gYXMgYW55KTsgIC8v5riF6Zmk5qCH6K6wXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UuY3JlYXRlKHRoaXMsIG1zZykpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WTjeW6lOWvueaWueeahGJyb2FkY2FzdF9jbG9zZeivt+axguWksei0pScsIGVycikpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UucGFyc2UodGhpcywgcF9oZWFkZXIsIGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludE1lc3NhZ2UoZmFsc2UsIG1zZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlcihbbXNnLnR5cGUsIG1zZy5tZXNzYWdlSURdIGFzIGFueSwgbXNnKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOacquefpea2iOaBr+exu+Wei++8miR7cF9oZWFkZXJ9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmludEVycm9yKCfmjqXmlLbliLDnmoTmtojmga/moLzlvI/plJnor6/vvJonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnNvY2tldC5vbk9wZW4gPSAoKSA9PiB0aGlzLl9tZXNzYWdlTGlzdGVuZXIudHJpZ2dlckRlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5fb25PcGVuXSBhcyBhbnkpO1xyXG5cclxuICAgICAgICB0aGlzLnNvY2tldC5vbkNsb3NlID0gKCkgPT4gdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnRyaWdnZXJEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuX29uQ2xvc2VdIGFzIGFueSk7XHJcblxyXG4gICAgICAgIC8v5b2T5omT5byA56uv5Y+j5LmL5ZCO56uL5Yi76YCa55+l5a+55pa56KaB55uR5ZCs5ZOq5Lqb5bm/5pKtXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLl9vbk9wZW4sICdfc2VuZF9icm9hZGNhc3Rfb3BlbiddIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuX2V2ZW50TGV2ZWwuZ2V0Q2hpbGRMZXZlbChbTWVzc2FnZVR5cGUuYnJvYWRjYXN0XSBhcyBhbnksIHRydWUpXHJcbiAgICAgICAgICAgICAgICAuY2hpbGRyZW4uZm9yRWFjaCgobGV2ZWwsIGJyb2FkY2FzdFNlbmRlcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvckVhY2hMZXZlbCA9IChsZXZlbDogRXZlbnRMZXZlbCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGV2ZWwucmVjZWl2ZXJzLnNpemUgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKGJyb2FkY2FzdFNlbmRlciwgbGV2ZWwucmVjZWl2ZXJzLnZhbHVlcygpLm5leHQoKS52YWx1ZSBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXZlbC5jaGlsZHJlbi5mb3JFYWNoKGZvckVhY2hMZXZlbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWwuY2hpbGRyZW4uZm9yRWFjaChmb3JFYWNoTGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8v5b2T6L+e5o6l5pat5byA56uL5Yi75riF55CG5a+55pa55rOo5YaM6L+H55qE5bm/5pKt6Lev5b6EXHJcbiAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLl9vbkNsb3NlLCAnX2NsZWFuX29wZW5lZF9icm9hZGNhc3QnXSBhcyBhbnksICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmNhbmNlbERlc2NlbmRhbnRzKFtNZXNzYWdlVHlwZS5fYnJvYWRjYXN0X3doaXRlX2xpc3RdIGFzIGFueSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlr7nlpJblr7zlh7rmlrnms5XjgIIgICAgIFxyXG4gICAgICog5aaC5p6c6KaB5ZCR6LCD55So5pa55Y+N6aaI6ZSZ6K+v77yM55u05o6lIHRocm93IG5ldyBFcnJvcigpIOWNs+WPr+OAgiAgICAgXHJcbiAgICAgKiDms6jmhI/vvJrlr7nkuo7lr7zlh7rmlrnms5XvvIzlvZPlroPmiafooYzlrozmiJDvvIzov5Tlm57nu5PmnpzlkI7lsLHkuI3lj6/ku6Xlho3nu6fnu63kuIvovb3mlofku7bkuobjgIIgICAgIFxyXG4gICAgICog5rOo5oSP77ya5LiA5LiqcGF0aOS4iuWPquWFgeiuuOWvvOWHuuS4gOS4quaWueazleOAguWmguaenOmHjeWkjeWvvOWHuuWImeWQjumdoueahOW6lOivpeimhuebluaOieWJjemdoueahOOAgiAgICAgXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDmiYDlr7zlh7rnmoTot6/lvoRcclxuICAgICAqIEBwYXJhbSBmdW5jIOWvvOWHuueahOaWueazlSBcclxuICAgICAqL1xyXG4gICAgZXhwb3J0PEYgZXh0ZW5kcyAoZGF0YTogSW52b2tlUmVjZWl2aW5nRGF0YSkgPT4gUHJvbWlzZTx2b2lkIHwgSW52b2tlU2VuZGluZ0RhdGE+PihwYXRoOiBzdHJpbmcsIGZ1bmM6IEYpOiBGIHtcclxuICAgICAgICB0aGlzLmNhbmNlbEV4cG9ydChwYXRoKTtcclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX3JlcXVlc3QsIHBhdGhdIGFzIGFueSwgYXN5bmMgKG1zZzogSW52b2tlUmVxdWVzdE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeyBkYXRhLCBjbGVhbiB9ID0gdGhpcy5fcHJlcGFyZV9JbnZva2VSZWNlaXZpbmdEYXRhKG1zZyk7XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZnVuYyhkYXRhKSB8fCB7IGRhdGE6IG51bGwgfTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJtID0gSW52b2tlUmVzcG9uc2VNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2csIHRoaXMuX21lc3NhZ2VJRCsrLCByZXN1bHQpO1xyXG5cclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJtLmZpbGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbGVhbiA9IGF3YWl0IHRoaXMuX3ByZXBhcmVfSW52b2tlU2VuZGluZ0RhdGEocm0sICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9maW5pc2gsIHJtLnJlY2VpdmVyLCBybS5yZXNwb25zZU1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9maW5pc2gsIHJtLnJlY2VpdmVyLCBybS5yZXNwb25zZU1lc3NhZ2VJRF0gYXMgYW55LCBjbGVhbik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmludEVycm9yKCflj5HpgIFcIuiwg+eUqOWTjeW6lFwi5aSx6LSlJywgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoSW52b2tlRmFpbGVkTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBlcnJvcikpXHJcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLl9wcmludEVycm9yKCflj5HpgIFcIuiwg+eUqOWksei0peWTjeW6lFwi5aSx6LSlJywgZXJyKSk7XHJcbiAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICBjbGVhbigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBmdW5jO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+W5raI5a+55aSW5a+85Ye655qE5pa55rOVXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDkuYvliY3lr7zlh7rnmoTot6/lvoRcclxuICAgICAqL1xyXG4gICAgY2FuY2VsRXhwb3J0KHBhdGg6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmludm9rZV9yZXF1ZXN0LCBwYXRoXSBhcyBhbnkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6LCD55So6L+c56uv5qih5Z2X5a+85Ye655qE5pa55rOV44CC55u05o6l6L+U5Zue5pWw5o2u5LiO5paH5Lu2XHJcbiAgICAgKiBAcGFyYW0gcmVjZWl2ZXIg6L+c56uv5qih5Z2X55qE5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gcGF0aCDmlrnms5XnmoTot6/lvoRcclxuICAgICAqIEBwYXJhbSBkYXRhIOimgeS8oOmAkueahOaVsOaNrlxyXG4gICAgICovXHJcbiAgICBpbnZva2UocmVjZWl2ZXI6IHN0cmluZywgcGF0aDogc3RyaW5nLCBkYXRhOiBJbnZva2VTZW5kaW5nRGF0YSk6IFByb21pc2U8eyBkYXRhOiBhbnksIGZpbGVzOiB7IG5hbWU6IHN0cmluZywgZGF0YTogQnVmZmVyIH1bXSB9PlxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjov5znq6/mqKHlnZflr7zlh7rnmoTmlrnms5XjgIJcclxuICAgICAqIEBwYXJhbSByZWNlaXZlciDov5znq6/mqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSBwYXRoIOaWueazleeahOi3r+W+hFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5Lyg6YCS55qE5pWw5o2uXHJcbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sg5o6l5pS25ZON5bqU5pWw5o2u55qE5Zue6LCD44CC5rOo5oSP77ya5LiA5pem5Zue6LCD5omn6KGM5a6M5oiQ5bCx5LiN6IO95YaN5LiL6L295paH5Lu25LqG44CCXHJcbiAgICAgKi9cclxuICAgIGludm9rZShyZWNlaXZlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhLCBjYWxsYmFjazogKGVycjogRXJyb3IgfCB1bmRlZmluZWQsIGRhdGE6IEludm9rZVJlY2VpdmluZ0RhdGEpID0+IFByb21pc2U8dm9pZD4pOiB2b2lkXHJcbiAgICBpbnZva2UocmVjZWl2ZXI6IHN0cmluZywgcGF0aDogc3RyaW5nLCBkYXRhOiBJbnZva2VTZW5kaW5nRGF0YSwgY2FsbGJhY2s/OiAoZXJyOiBFcnJvciB8IHVuZGVmaW5lZCwgZGF0YTogSW52b2tlUmVjZWl2aW5nRGF0YSkgPT4gUHJvbWlzZTx2b2lkPik6IGFueSB7XHJcbiAgICAgICAgY29uc3Qgcm0gPSBJbnZva2VSZXF1ZXN0TWVzc2FnZS5jcmVhdGUodGhpcywgdGhpcy5fbWVzc2FnZUlEKyssIHJlY2VpdmVyLCBwYXRoLCBkYXRhKTtcclxuICAgICAgICBjb25zdCBjbGVhbk1lc3NhZ2VMaXN0ZW5lciA9ICgpID0+IHsgICAvL+a4heeQhuazqOWGjOeahOa2iOaBr+ebkeWQrOWZqFxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2UsIHJtLnJlY2VpdmVyLCBybS5yZXF1ZXN0TWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBpZiAoY2FsbGJhY2spIHsgICAvL+Wbnuiwg+WHveaVsOeJiOacrFxyXG4gICAgICAgICAgICB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtLCBjbGVhbk1lc3NhZ2VMaXN0ZW5lcikudGhlbihjbGVhblNlbmRSZXF1ZXN0ID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCAobXNnOiBJbnZva2VSZXNwb25zZU1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjbGVhblNlbmRSZXF1ZXN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYW5NZXNzYWdlTGlzdGVuZXIoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyBkYXRhLCBjbGVhbiB9ID0gdGhpcy5fcHJlcGFyZV9JbnZva2VSZWNlaXZpbmdEYXRhKG1zZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCBkYXRhKS50aGVuKGNsZWFuKS5jYXRjaChlcnIgPT4geyBjbGVhbigpOyB0aHJvdyBlcnI7IH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCAobXNnOiBJbnZva2VGYWlsZWRNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYW5TZW5kUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFuTWVzc2FnZUxpc3RlbmVyKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIChjYWxsYmFjayBhcyBhbnkpKG5ldyBFcnJvcihtc2cuZXJyb3IpKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KS5jYXRjaChjYWxsYmFjayBhcyBhbnkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmVwYXJlX0ludm9rZVNlbmRpbmdEYXRhKHJtLCBjbGVhbk1lc3NhZ2VMaXN0ZW5lcikudGhlbihjbGVhblNlbmRSZXF1ZXN0ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLmludm9rZV9yZXNwb25zZSwgcm0ucmVjZWl2ZXIsIHJtLnJlcXVlc3RNZXNzYWdlSURdIGFzIGFueSwgYXN5bmMgKG1zZzogSW52b2tlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuU2VuZFJlcXVlc3QoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW5NZXNzYWdlTGlzdGVuZXIoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgZGF0YSwgY2xlYW4gfSA9IHRoaXMuX3ByZXBhcmVfSW52b2tlUmVjZWl2aW5nRGF0YShtc2cpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogeyBuYW1lOiBzdHJpbmcsIGRhdGE6IEJ1ZmZlciB9W10gPSBbXTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YS5maWxlcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHsgbmFtZTogaXRlbS5uYW1lLCBkYXRhOiBhd2FpdCBpdGVtLmdldEZpbGUoKSB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgZGF0YTogZGF0YS5kYXRhLCBmaWxlczogcmVzdWx0IH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkLCBybS5yZWNlaXZlciwgcm0ucmVxdWVzdE1lc3NhZ2VJRF0gYXMgYW55LCAobXNnOiBJbnZva2VGYWlsZWRNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuU2VuZFJlcXVlc3QoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW5NZXNzYWdlTGlzdGVuZXIoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IobXNnLmVycm9yKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChyZWplY3QpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDms6jlhozlub/mkq3nm5HlkKzlmaggICAgICBcclxuICAgICAqIEBwYXJhbSBzZW5kZXIg5Y+R6YCB6ICFXHJcbiAgICAgKiBAcGFyYW0gbmFtZSDlub/mkq3nmoTot6/lvoRcclxuICAgICAqIEBwYXJhbSBmdW5jIOWvueW6lOeahOWbnuiwg+aWueazlVxyXG4gICAgICovXHJcbiAgICByZWNlaXZlPEYgZXh0ZW5kcyAoYXJnOiBhbnkpID0+IGFueT4oc2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgZnVuYzogRik6IEYge1xyXG4gICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9IFtNZXNzYWdlVHlwZS5icm9hZGNhc3QsIHNlbmRlciwgLi4ucGF0aC5zcGxpdCgnLicpXSBhcyBhbnk7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5fbWVzc2FnZUxpc3RlbmVyLmhhcyhldmVudE5hbWUpKSB7ICAvL+WmguaenOi/mOayoeazqOWGjOi/h++8jOmAmuefpeWvueaWueeOsOWcqOimgeaOpeaUtuaMh+Wumui3r+W+hOW5v+aSrVxyXG4gICAgICAgICAgICB0aGlzLl9zZW5kX0Jyb2FkY2FzdE9wZW5NZXNzYWdlKHNlbmRlciwgcGF0aCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShldmVudE5hbWUsIGZ1bmMpOyAvL+S4jeWMheijheS4gOS4i+ebkeWQrOWZqO+8jOaYr+S4uuS6huiAg+iZkeWIsGNhbmNlbFJlY2VpdmVcclxuICAgICAgICByZXR1cm4gZnVuYztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIoOmZpOaMh+Wumui3r+W+hOS4iueahOaJgOacieW5v+aSreebkeWQrOWZqO+8jOWPr+S7peS8oOmAkuS4gOS4qmxpc3RlbmVy5p2l5Y+q5Yig6Zmk5LiA5Liq54m55a6a55qE55uR5ZCs5ZmoXHJcbiAgICAgKiBAcGFyYW0gc2VuZGVyIOWPkemAgeiAhVxyXG4gICAgICogQHBhcmFtIG5hbWUg5bm/5pKt55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gbGlzdGVuZXIg6KaB5oyH5a6a5Yig6Zmk55qE55uR5ZCs5ZmoXHJcbiAgICAgKi9cclxuICAgIGNhbmNlbFJlY2VpdmUoc2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgbGlzdGVuZXI/OiAoYXJnOiBhbnkpID0+IGFueSkge1xyXG4gICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9IFtNZXNzYWdlVHlwZS5icm9hZGNhc3QsIHNlbmRlciwgLi4ucGF0aC5zcGxpdCgnLicpXSBhcyBhbnk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLl9tZXNzYWdlTGlzdGVuZXIuaGFzKGV2ZW50TmFtZSkpIHsgIC8v56Gu5L+d55yf55qE5pyJ5rOo5YaM6L+H5YaN5omn6KGM5Yig6ZmkXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoZXZlbnROYW1lLCBsaXN0ZW5lcik7XHJcblxyXG4gICAgICAgICAgICBpZiAoIXRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXMoZXZlbnROYW1lKSkgeyAgICAvL+WmguaenOWIoOWFieS6hu+8jOWwsemAmuefpeWvueaWueS4jeWGjeaOpeaUtuS6hlxyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZF9Ccm9hZGNhc3RDbG9zZU1lc3NhZ2Uoc2VuZGVyLCBwYXRoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWvueWkluW5v+aSreaVsOaNrlxyXG4gICAgICogQHBhcmFtIHBhdGgg5bm/5pKt55qE6Lev5b6EXHJcbiAgICAgKiBAcGFyYW0gZGF0YSDopoHlj5HpgIHnmoTmlbDmja5cclxuICAgICAqL1xyXG4gICAgYXN5bmMgYnJvYWRjYXN0KHBhdGg6IHN0cmluZywgZGF0YTogYW55ID0gbnVsbCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIC8v5Yik5pat5a+55pa55piv5ZCm5rOo5YaM55qE5pyJ5YWz5LqO6L+Z5p2h5bm/5pKt55qE55uR5ZCs5ZmoXHJcbiAgICAgICAgaWYgKHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5oYXNBbmNlc3RvcnMoW01lc3NhZ2VUeXBlLl9icm9hZGNhc3Rfd2hpdGVfbGlzdCwgLi4ucGF0aC5zcGxpdCgnLicpXSBhcyBhbnkpKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX3NlbmRNZXNzYWdlKEJyb2FkY2FzdE1lc3NhZ2UuY3JlYXRlKHRoaXMsIHBhdGgsIGRhdGEpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkvr/kuo7kvb/nlKhzb2NrZXTlj5HpgIHmtojmga9cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZE1lc3NhZ2UobXNnOiBNZXNzYWdlRGF0YSkge1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IG1zZy5wYWNrKCk7XHJcbiAgICAgICAgdGhpcy5fcHJpbnRNZXNzYWdlKHRydWUsIG1zZyk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLnNvY2tldC5zZW5kKHJlc3VsdFswXSwgcmVzdWx0WzFdKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaJk+WNsOmUmeivr+a2iOaBr1xyXG4gICAgICogQHBhcmFtIGRlc2Mg5o+P6L+wIFxyXG4gICAgICogQHBhcmFtIGVyciDplJnor6/kv6Hmga9cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfcHJpbnRFcnJvcihkZXNjOiBzdHJpbmcsIGVycjogRXJyb3IpIHtcclxuICAgICAgICBpZiAodGhpcy5wcmludEVycm9yKVxyXG4gICAgICAgICAgICBsb2cud2FyblxyXG4gICAgICAgICAgICAgICAgLmxvY2F0aW9uLndoaXRlXHJcbiAgICAgICAgICAgICAgICAudGl0bGUueWVsbG93XHJcbiAgICAgICAgICAgICAgICAuY29udGVudC55ZWxsb3coJ3JlbW90ZS1pbnZva2UnLCBkZXNjLCBlcnIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5omT5Y2w5pS25Yiw5oiW5Y+R6YCB55qE5raI5oGvXHJcbiAgICAgKiBAcGFyYW0gc2VuZE9yUmVjZWl2ZSDlpoLmnpzmmK/lj5HpgIHliJnkuLp0cnVl77yM5aaC5p6c5piv5o6l5pS25YiZ5Li6ZmFsc2VcclxuICAgICAqIEBwYXJhbSBkZXNjIOaPj+i/sFxyXG4gICAgICogQHBhcmFtIGRhdGEg6KaB5omT5Y2w55qE5pWw5o2uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3ByaW50TWVzc2FnZShzZW5kT3JSZWNlaXZlOiBib29sZWFuLCBtc2c6IE1lc3NhZ2VEYXRhKSB7XHJcbiAgICAgICAgaWYgKHRoaXMucHJpbnRNZXNzYWdlKVxyXG4gICAgICAgICAgICBpZiAoc2VuZE9yUmVjZWl2ZSlcclxuICAgICAgICAgICAgICAgIGxvZ1xyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi5jeWFuLmJvbGRcclxuICAgICAgICAgICAgICAgICAgICAudGl0bGVcclxuICAgICAgICAgICAgICAgICAgICAuY29udGVudCgncmVtb3RlLWludm9rZScsICflj5HpgIEnLCBNZXNzYWdlVHlwZVttc2cudHlwZV0sIEpTT04uc3RyaW5naWZ5KG1zZywgdW5kZWZpbmVkLCA0KSk7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIGxvZ1xyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi5ncmVlbi5ib2xkXHJcbiAgICAgICAgICAgICAgICAgICAgLnRpdGxlXHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQoJ3JlbW90ZS1pbnZva2UnLCAn5pS25YiwJywgTWVzc2FnZVR5cGVbbXNnLnR5cGVdLCBKU09OLnN0cmluZ2lmeShtc2csIHVuZGVmaW5lZCwgNCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5YeG5aSH5aW95LiL6L295Zue6LCD44CC6L+U5ZueSW52b2tlUmVjZWl2aW5nRGF0YeS4jua4heeQhui1hOa6kOWbnuiwg1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9wcmVwYXJlX0ludm9rZVJlY2VpdmluZ0RhdGEobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VJRCA9IG1zZyBpbnN0YW5jZW9mIEludm9rZVJlcXVlc3RNZXNzYWdlID8gbXNnLnJlcXVlc3RNZXNzYWdlSUQgOiBtc2cucmVzcG9uc2VNZXNzYWdlSUQ7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGVzID0gbXNnLmZpbGVzLm1hcChpdGVtID0+IHtcclxuICAgICAgICAgICAgbGV0IHN0YXJ0OiBib29sZWFuID0gZmFsc2U7ICAgICAgICAgICAgIC8v5piv5ZCm5bey57uP5byA5aeL6I635Y+W5LqG77yM5Li76KaB5piv55So5LqO6Ziy5q2i6YeN5aSN5LiL6L29XHJcbiAgICAgICAgICAgIGxldCBpbmRleCA9IC0xOyAgICAgICAgICAgICAgICAgICAgICAgICAvL+eOsOWcqOaOpeaUtuWIsOesrOWHoOS4quaWh+S7tueJh+auteS6hlxyXG4gICAgICAgICAgICBsZXQgZG93bmxvYWRlZFNpemUgPSAwOyAgICAgICAgICAgICAgICAgLy/lt7LkuIvovb3lpKflsI9cclxuICAgICAgICAgICAgbGV0IHRpbWVyOiBOb2RlSlMuVGltZXI7ICAgICAgICAgICAgICAgIC8v6LaF5pe26K6h5pe25ZmoXHJcblxyXG4gICAgICAgICAgICBjb25zdCBkb3dubG9hZE5leHQgPSAoKSA9PiB7ICAgICAgICAgICAgLy/kuIvovb3kuIvkuIDkuKrmlofku7bniYfmrrVcclxuICAgICAgICAgICAgICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiBjYl9lcnJvcihuZXcgRXJyb3IoJ+ivt+axgui2heaXticpKSwgdGhpcy50aW1lb3V0KTsgIC8v6K6+572u6LaF5pe2XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2csIGl0ZW0uaWQsICsraW5kZXgpKVxyXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyBjYl9lcnJvcihuZXcgRXJyb3IoJ+e9kee7nOi/nuaOpeW8guW4uO+8micgKyBlcnIpKTsgfSk7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBsZXQgY2JfZXJyb3I6IChlcnI6IEVycm9yKSA9PiB2b2lkOyAvL+S4i+i9veWHuumUmeWbnuiwg1xyXG4gICAgICAgICAgICBsZXQgY2JfcmVjZWl2ZTogKGRhdGE6IEJ1ZmZlciwgaXNFbmQ6IGJvb2xlYW4pID0+IHZvaWQ7IC8v5o6l5pS25paH5Lu25Zue6LCDXHJcblxyXG4gICAgICAgICAgICAvL+ebkeWQrOS4i+i9veWIsOeahOaWh+S7tlxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChtc2cuaW5kZXggIT09IGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2JfZXJyb3IobmV3IEVycm9yKCfmlofku7blnKjkvKDovpPov4fnqIvkuK3vvIzpobrluo/lj5HnlJ/plJnkubEnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGRvd25sb2FkZWRTaXplICs9IG1zZy5kYXRhLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVtLnNpemUgIT0gbnVsbCAmJiBkb3dubG9hZGVkU2l6ZSA+IGl0ZW0uc2l6ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yKG5ldyBFcnJvcign5LiL6L295Yiw55qE5paH5Lu25aSn5bCP6LaF5Ye65LqG5Y+R6YCB6ICF5omA5o+P6L+w55qE5aSn5bCPJykpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjYl9yZWNlaXZlKG1zZy5kYXRhLCBpdGVtLnNwbGl0TnVtYmVyICE9IG51bGwgJiYgaW5kZXggKyAxID49IGl0ZW0uc3BsaXROdW1iZXIpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8v55uR5ZCs5LiL6L295paH5Lu25aSx6LSlXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55LCAobXNnOiBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIGNiX2Vycm9yKG5ldyBFcnJvcihtc2cuZXJyb3IpKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvL+ebkeWQrOS4i+i9veaWh+S7tue7k+adn1xyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZShbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmluaXNoLCBtc2cuc2VuZGVyLCBtZXNzYWdlSUQsIGl0ZW0uaWRdIGFzIGFueSwgKG1zZzogSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UpID0+IHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICBjYl9yZWNlaXZlKEJ1ZmZlci5hbGxvYygwKSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBSZWNlaXZpbmdGaWxlID0ge1xyXG4gICAgICAgICAgICAgICAgc2l6ZTogaXRlbS5zaXplLFxyXG4gICAgICAgICAgICAgICAgc3BsaXROdW1iZXI6IGl0ZW0uc3BsaXROdW1iZXIsXHJcbiAgICAgICAgICAgICAgICBuYW1lOiBpdGVtLm5hbWUsXHJcbiAgICAgICAgICAgICAgICBvbkRhdGE6IChjYWxsYmFjaywgc3RhcnRJbmRleCA9IDApID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgKDxhbnk+Y2FsbGJhY2spKG5ldyBFcnJvcign5LiN5Y+v6YeN5aSN5LiL6L295paH5Lu2JykpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBzdGFydEluZGV4IC0gMTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX2Vycm9yID0gZXJyID0+IHsgKDxhbnk+Y2FsbGJhY2spKGVycik7IGNiX2Vycm9yID0gKCkgPT4geyB9IH07ICAgLy/noa7kv53lj6rop6blj5HkuIDmrKFcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2JfcmVjZWl2ZSA9IChkYXRhLCBpc0VuZCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzRW5kKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgaXNFbmQsIGluZGV4LCBkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIGlzRW5kLCBpbmRleCwgZGF0YSkudGhlbihyZXN1bHQgPT4gcmVzdWx0ICE9PSB0cnVlICYmIGRvd25sb2FkTmV4dCgpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvd25sb2FkTmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBnZXRGaWxlOiAoKSA9PiBuZXcgUHJvbWlzZTxCdWZmZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHsgICAvL+S4i+i9veaWh+S7tuWbnuiwg1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFydCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCfkuI3lj6/ph43lpI3kuIvovb3mlofku7YnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlUGllY2VzOiBCdWZmZXJbXSA9IFtdOyAgICAvL+S4i+i9veWIsOeahOaWh+S7tueJh+autVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY2JfZXJyb3IgPSByZWplY3Q7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNiX3JlY2VpdmUgPSAoZGF0YSwgaXNFbmQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbGVQaWVjZXMucHVzaChkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzRW5kID8gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGZpbGVQaWVjZXMpKSA6IGRvd25sb2FkTmV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgZG93bmxvYWROZXh0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgZGF0YTogeyBkYXRhOiBtc2cuZGF0YSwgZmlsZXMgfSxcclxuICAgICAgICAgICAgY2xlYW46ICgpID0+IHsgLy/muIXnkIbotYTmupBcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci50cmlnZ2VyRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZCwgbXNnLnNlbmRlciwgbWVzc2FnZUlEXSBhcyBhbnksIHsgZXJyb3I6ICfkuIvovb3nu4jmraInIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2UsIG1zZy5zZW5kZXIsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkLCBtc2cuc2VuZGVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsRGVzY2VuZGFudHMoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaCwgbXNnLnNlbmRlciwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWHhuWkh+WPkemAgeaWh+S7tu+8jOi/lOWbnua4heeQhui1hOa6kOWbnuiwg+OAguWmguaenOi2heaXtuS8muiHquWKqOa4heeQhui1hOa6kFxyXG4gICAgICogQHBhcmFtIG1zZyDopoHlj5HpgIHnmoTmlbDmja5cclxuICAgICAqIEBwYXJhbSBvblRpbWVvdXQg5rKh5pyJ5paH5Lu26K+35rGC6LaF5pe2XHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgX3ByZXBhcmVfSW52b2tlU2VuZGluZ0RhdGEobXNnOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSwgb25UaW1lb3V0PzogKCkgPT4gdm9pZCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMuX3NlbmRNZXNzYWdlKG1zZyk7XHJcblxyXG4gICAgICAgIGlmIChtc2cuZmlsZXMubGVuZ3RoID4gMCkgeyAvL+WHhuWkh+aWh+S7tuWPkemAgVxyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlSUQgPSBtc2cgaW5zdGFuY2VvZiBJbnZva2VSZXF1ZXN0TWVzc2FnZSA/IG1zZy5yZXF1ZXN0TWVzc2FnZUlEIDogbXNnLnJlc3BvbnNlTWVzc2FnZUlEO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xlYW4gPSAoKSA9PiB7ICAvL+a4heeQhui1hOa6kOWbnuiwg1xyXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWxEZXNjZW5kYW50cyhbTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVxdWVzdCwgbXNnLnJlY2VpdmVyLCBtZXNzYWdlSURdIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiB7IGNsZWFuKCk7IG9uVGltZW91dCAmJiBvblRpbWVvdXQoKTsgfTtcclxuXHJcbiAgICAgICAgICAgIGxldCB0aW1lciA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy50aW1lb3V0KTsgICAgLy/otoXml7borqHml7blmahcclxuXHJcbiAgICAgICAgICAgIG1zZy5maWxlcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgICAgICAgbGV0IHNlbmRpbmdEYXRhID0gaXRlbS5fZGF0YSBhcyBTZW5kaW5nRmlsZTtcclxuICAgICAgICAgICAgICAgIGxldCBpbmRleCA9IDA7ICAgIC8v6K6w5b2V55So5oi36K+35rGC5Yiw5LqG56ys5Yeg5Liq5paH5Lu254mH5q615LqGXHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VuZF9lcnJvciA9IChtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSwgZXJyOiBFcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLm9uUHJvZ3Jlc3MgJiYgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyhlcnIsIHVuZGVmaW5lZCBhcyBhbnkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kTWVzc2FnZShJbnZva2VGaWxlRmFpbGVkTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBlcnIpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WQkeWvueaWueWPkemAgVwi6K+35rGC5paH5Lu254mH5q615aSx6LSl5ZON5bqUXCLlpLHotKUnLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy/kuI3lhYHorrjlho3kuIvovb3or6Xmlofku7bkuoZcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZW5kX2ZpbmlzaCA9IChtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKEludm9rZUZpbGVGaW5pc2hNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtc2cpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuX3ByaW50RXJyb3IoJ+WQkeWvueaWueWPkemAgVwi6K+35rGC5paH5Lu254mH5q6157uT5p2f5ZON5bqUXCLlpLHotKUnLCBlcnIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy/kuI3lhYHorrjlho3kuIvovb3or6Xmlofku7bkuoZcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0LCBtc2cucmVjZWl2ZXIsIG1lc3NhZ2VJRCwgaXRlbS5pZF0gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmUoW01lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3QsIG1zZy5yZWNlaXZlciwgbWVzc2FnZUlELCBpdGVtLmlkXSBhcyBhbnksIChtc2c6IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICAgICAgdGltZXIgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMudGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cuaW5kZXggPiBpbmRleCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmRleCA9IG1zZy5pbmRleDtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kX2Vycm9yKG1zZywgbmV3IEVycm9yKCfph43lpI3kuIvovb3mlofku7bniYfmrrUnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc2VuZGluZ0RhdGEuZmlsZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4IDwgKGl0ZW0uc3BsaXROdW1iZXIgYXMgbnVtYmVyKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZGluZ0RhdGEub25Qcm9ncmVzcyAmJiBzZW5kaW5nRGF0YS5vblByb2dyZXNzKHVuZGVmaW5lZCwgKGluZGV4ICsgMSkgLyAoaXRlbS5zcGxpdE51bWJlciBhcyBudW1iZXIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNyZWF0ZSh0aGlzLCBtc2csIHNlbmRpbmdEYXRhLmZpbGUuc2xpY2UoaW5kZXggKiB0aGlzLmZpbGVQaWVjZVNpemUsIChpbmRleCArIDEpICogdGhpcy5maWxlUGllY2VTaXplKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UocmVzdWx0KS5jYXRjaChlcnIgPT4gc2VuZF9lcnJvcihtc2csIGVycikpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9maW5pc2gobXNnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRpbmdEYXRhLmZpbGUoaW5kZXgpLnRoZW4oZGF0YSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKGRhdGEpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZE1lc3NhZ2UoSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZS5jcmVhdGUodGhpcywgbXNnLCBkYXRhKSkuY2F0Y2goZXJyID0+IHNlbmRfZXJyb3IobXNnLCBlcnIpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZF9maW5pc2gobXNnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRfZXJyb3IobXNnLCBlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gY2xlYW47XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuICgpID0+IHsgfTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgICog5Y+R6YCBQnJvYWRjYXN0T3Blbk1lc3NhZ2VcclxuICAgICAgKiBAcGFyYW0gYnJvYWRjYXN0U2VuZGVyIOW5v+aSreeahOWPkemAgeiAhVxyXG4gICAgICAqIEBwYXJhbSBwYXRoIOW5v+aSrei3r+W+hFxyXG4gICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZF9Ccm9hZGNhc3RPcGVuTWVzc2FnZShicm9hZGNhc3RTZW5kZXI6IHN0cmluZywgcGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc29ja2V0LmNvbm5lY3RlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlSUQgPSB0aGlzLl9tZXNzYWdlSUQrKztcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IEJyb2FkY2FzdE9wZW5NZXNzYWdlLmNyZWF0ZSh0aGlzLCBtZXNzYWdlSUQsIGJyb2FkY2FzdFNlbmRlciwgcGF0aCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBpbnRlcnZhbCA9ICgpID0+IHRoaXMuX3NlbmRNZXNzYWdlKHJlc3VsdClcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg6YCa55+l5a+55pa5XCLnjrDlnKjopoHmjqXmlLbmjIflrprot6/lvoTnmoTlub/mkq1cIuWksei0peOAgmJyb2FkY2FzdFNlbmRlcjoke2Jyb2FkY2FzdFNlbmRlcn0gcGF0aDoke3BhdGh9YCwgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldEludGVydmFsKGludGVydmFsLCB0aGlzLnRpbWVvdXQpOyAgICAvL+WIsOS6huaXtumXtOWmguaenOi/mOayoeacieaUtuWIsOWvueaWueWTjeW6lOWwsemHjeaWsOWPkemAgeS4gOasoVxyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLl9vbkNsb3NlLCBNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIucmVjZWl2ZU9uY2UoW01lc3NhZ2VUeXBlLl9vbkNsb3NlLCBNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGludGVydmFsKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+R6YCBQnJvYWRjYXN0Q2xvc2VNZXNzYWdlXHJcbiAgICAgKiBAcGFyYW0gYnJvYWRjYXN0U2VuZGVyIOW5v+aSreeahOWPkemAgeiAhVxyXG4gICAgICogQHBhcmFtIHBhdGgg5bm/5pKt6Lev5b6EXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3NlbmRfQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5zb2NrZXQuY29ubmVjdGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VJRCA9IHRoaXMuX21lc3NhZ2VJRCsrO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gQnJvYWRjYXN0Q2xvc2VNZXNzYWdlLmNyZWF0ZSh0aGlzLCBtZXNzYWdlSUQsIGJyb2FkY2FzdFNlbmRlciwgcGF0aCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBpbnRlcnZhbCA9ICgpID0+IHRoaXMuX3NlbmRNZXNzYWdlKHJlc3VsdClcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5fcHJpbnRFcnJvcihg6YCa55+l5a+55pa5XCLnjrDlnKjkuI3lho3mjqXmlLbmjIflrprot6/lvoTnmoTlub/mkq1cIuWksei0peOAgmJyb2FkY2FzdFNlbmRlcjoke2Jyb2FkY2FzdFNlbmRlcn0gcGF0aDoke3BhdGh9YCwgZXJyKSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0aW1lciA9IHNldEludGVydmFsKGludGVydmFsLCB0aGlzLnRpbWVvdXQpOyAgICAvL+WIsOS6huaXtumXtOWmguaenOi/mOayoeacieaUtuWIsOWvueaWueWTjeW6lOWwsemHjeaWsOWPkemAgeS4gOasoVxyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWVzc2FnZUxpc3RlbmVyLnJlY2VpdmVPbmNlKFtNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2VfZmluaXNoLCBtZXNzYWdlSURdIGFzIGFueSwgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tZXNzYWdlTGlzdGVuZXIuY2FuY2VsKFtNZXNzYWdlVHlwZS5fb25DbG9zZSwgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCwgbWVzc2FnZUlEXSBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5yZWNlaXZlT25jZShbTWVzc2FnZVR5cGUuX29uQ2xvc2UsIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX21lc3NhZ2VMaXN0ZW5lci5jYW5jZWwoW01lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2gsIG1lc3NhZ2VJRF0gYXMgYW55KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBpbnRlcnZhbCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufSJdfQ==
