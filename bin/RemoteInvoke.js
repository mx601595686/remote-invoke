"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const log_formatter_1 = require("log-formatter");
const MessageType_1 = require("./common/MessageType");
const SendingManager_1 = require("./SendingManager");
/**
 *  远程调用控制器
 *
 * @export
 * @class RemoteInvoke
 */
class RemoteInvoke extends SendingManager_1.SendingManager {
    constructor(config) {
        super(config);
        this._invokeCallback = new Map(); // 注册调用回调
        /**
         * 对外导出的方法列表
         */
        this.exportList = new Map();
        /**
         * 注册的广播接收器
         *
         * key：moduleName -> messageName
         */
        this.receiveList = new Map();
        this._moduleName = config.moduleName;
        this._reportErrorStack = !!config.reportErrorStack;
        this._timeout = config.timeout === undefined ? 0 : config.timeout < 0 ? 0 : config.timeout;
    }
    /**
     * 发送消息
     *
     * @private
     * @param {(string | undefined)} receiver 接收模块的名称
     * @param {string} messageName 消息的名称
     * @param {string} messageID 消息的编号
     * @param {MessageType} type 消息的类型
     * @param {(number | undefined)} expire 过期时间
     * @param {any[]} data 要发送的数据
     * @returns {Promise<void>}
     * @memberof RemoteInvoke
     */
    _send(receiver, messageName, messageID, type, expire, data, error) {
        const sendingData = {
            sender: this._moduleName,
            receiver,
            messageID,
            messageName,
            type,
            sendTime: (new Date).getTime(),
            expire,
            data,
            error: error === undefined ? undefined : { message: error.message, stack: this._reportErrorStack ? error.stack : undefined }
        };
        return super._sendData(sendingData);
    }
    /**
     * 接收到消息
     *
     * @protected
     * @param {SendingData} data
     * @memberof RemoteInvoke
     */
    _onMessage(data) {
        switch (data.type) {
            case MessageType_1.MessageType.invoke:
                if (data.receiver !== this._moduleName) {
                    this._errorLog('收到了不属于自己的消息', data);
                }
                else if (data.expire === 0 || data.expire > (new Date).getTime()) {
                    const func = this.exportList.get(data.messageName);
                    const send = this._send.bind(this, data.sender, undefined, data.messageID, MessageType_1.MessageType.replyInvoke, data.expire);
                    if (func !== undefined) {
                        //确保执行完了也在过期时间之内
                        func(data.data).then((result) => data.expire === 0 || data.expire > (new Date).getTime() && send([result])).catch(() => { });
                    }
                    else {
                        send([], new Error('调用远端模块的方法不存在或者没有被导出')).catch(() => { });
                    }
                }
                break;
            case MessageType_1.MessageType.replyInvoke:
                if (data.receiver !== this._moduleName) {
                    this._errorLog('收到了不属于自己的消息', data);
                }
                else {
                    const ctrl = this._invokeCallback.get(data.messageID);
                    if (ctrl !== undefined) {
                        if (ctrl.targetName !== data.sender) {
                            ctrl.reject(new Error(`远端调用返回的结果并不是由期望的被调用者返回的！\r\n期望的被调用者：${ctrl.targetName}   实际返回结果的被调用者：${data.sender}`));
                        }
                        else {
                            if (data.error === undefined)
                                ctrl.resolve(data.data);
                            else {
                                const err = new Error(data.error.message);
                                if (data.error.stack !== undefined)
                                    err.stack = data.error.stack;
                                ctrl.reject(err);
                            }
                        }
                    }
                }
                break;
            case MessageType_1.MessageType.broadcast:
                if (data.sender === undefined) {
                    this._errorLog('收到了没有标注发送者的广播', data);
                }
                else if (data.messageName === undefined) {
                    this._errorLog('收到了消息名称为空的广播', data);
                }
                else {
                    const _module = this.receiveList.get(data.sender);
                    const receivers = _module && _module.get(data.messageName);
                    if (receivers !== undefined) {
                        receivers(data.data);
                    }
                    else {
                        this._errorLog('收到了自己没有注册过的广播', data);
                    }
                }
                break;
            default:
                this._errorLog('收到了不存在的消息类型', data);
                break;
        }
    }
    /**
     * 打印错误消息
     *
     * @private
     * @param {string} description 描述
     * @param {*} data 收到的数据
     * @memberof RemoteInvoke
     */
    _errorLog(description, data) {
        if (this.hasListeners('error')) {
            this.emit('error', new Error(`模块：${this._moduleName} ${description}。收到的数据：${JSON.stringify(data)}`));
        }
        else {
            log_formatter_1.default.warn
                .location.yellow
                .title.yellow
                .content.yellow
                .text.yellow(`remote-invoke: 模块：${this._moduleName}`, description, `收到的数据：`, data);
        }
    }
    /**
     * 对外导出方法
     *
     * @param {string} name 要被导出的方法的名称
     * @param {Function} func 要被导出的方法
     * @returns {Function}
     * @memberof RemoteInvoke
     */
    export(name, func) {
        if (this.exportList.has(name))
            throw new Error(`方法 '${name}' 不可以重复导出。`);
        this.exportList.set(name, func);
        this.emit('export', name);
        return func;
    }
    /**
     * 取消导出方法
     *
     * @param {string} name 导出的方法的名称
     * @returns {void}
     * @memberof RemoteInvoke
     */
    cancelExport(name) {
        if (this.exportList.delete(name))
            this.emit('cancelExport', name);
    }
    /**
     * 注册广播接收器
     *
     * @param {string} sender 发送者的模块名称
     * @param {string} name 广播消息的名称
     * @param {Function} func 对应的回调方法
     * @returns {Function}
     * @memberof RemoteInvoke
     */
    receive(sender, name, func) {
        let _module = this.receiveList.get(sender);
        if (_module === undefined) {
            _module = new Map();
            this.receiveList.set(sender, _module);
        }
        if (_module.has(name))
            throw new Error(`不可以重复注册广播接收器。 '${sender}：${name}'`);
        _module.set(name, func);
        this.emit('receive', name);
        return func;
    }
    /**
     * 删除广播接收器
     *
     * @param {string} sender 发送者的模块名称
     * @param {string} name 广播消息的名称
     * @returns
     * @memberof RemoteInvoke
     */
    cancelReceive(sender, name) {
        const _module = this.receiveList.get(sender);
        if (_module && _module.delete(name))
            this.emit('cancelReceive', name);
    }
    invoke(target, name, ...args) {
        return new Promise((resolve, reject) => {
            const data = args[0] || [];
            const timeout = args[1] === undefined ? this._timeout : args[1] < 0 ? 0 : args[1];
            const expire = timeout === 0 ? 0 : (new Date).getTime() + timeout;
            const control = {
                messageID: RemoteInvoke._messageID++,
                targetName: target,
                resolve: (data) => {
                    resolve(data);
                    clearTimeout(timer);
                    this._invokeCallback.delete(control.messageID);
                },
                reject: (err) => {
                    reject(err);
                    clearTimeout(timer);
                    this._invokeCallback.delete(control.messageID);
                }
            };
            const timer = timeout === 0 ? -1 : setTimeout(() => {
                const ctrl = this._invokeCallback.get(control.messageID);
                ctrl && ctrl.reject(new Error('调用超时'));
            }, timeout);
            this._invokeCallback.set(control.messageID, control);
            this._send(target, name, control.messageID, MessageType_1.MessageType.invoke, expire, data).catch(control.reject);
        });
    }
    /**
     * 向外广播消息
     *
     * @param {string} name 消息的名称
     * @param {any[]} [data] 要发送的数据
     * @param {number} [timeout] 指定消息过期的毫秒数
     *
     * @returns {Promise<any>}
     * @memberof RemoteInvoke
     */
    broadcast(name, data = [], timeout) {
        timeout = timeout === undefined ? this._timeout : timeout < 0 ? 0 : timeout;
        const expire = timeout === 0 ? 0 : (new Date).getTime() + timeout;
        return this._send(undefined, name, RemoteInvoke._messageID++, MessageType_1.MessageType.broadcast, expire, data);
    }
    on(event, listener) {
        super.on(event, listener);
        return this;
    }
    once(event, listener) {
        super.once(event, listener);
        return this;
    }
}
RemoteInvoke._messageID = 0; //消息编号从0开始
exports.RemoteInvoke = RemoteInvoke;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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RSxJQUFJLEVBQUUsWUFBWSxDQUFDLFVBQVUsRUFBRSxFQUFFLHlCQUFXLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN2RyxDQUFDO0lBZ0NELEVBQUUsQ0FBQyxLQUFhLEVBQUUsUUFBa0I7UUFDaEMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDMUIsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBU0QsSUFBSSxDQUFDLEtBQWEsRUFBRSxRQUFrQjtRQUNsQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUM7O0FBeFVjLHVCQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUUsVUFBVTtBQUY5QyxvQ0EyVUMiLCJmaWxlIjoiUmVtb3RlSW52b2tlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGxvZyBmcm9tICdsb2ctZm9ybWF0dGVyJztcclxuaW1wb3J0IHsgU2VuZGluZ0RhdGEgfSBmcm9tICcuL2NvbW1vbi9TZW5kaW5nRGF0YSc7XHJcbmltcG9ydCB7IE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi9jb21tb24vTWVzc2FnZVR5cGUnO1xyXG5pbXBvcnQgeyBSZW1vdGVJbnZva2VDb25maWcgfSBmcm9tICcuL2NvbW1vbi9SZW1vdGVJbnZva2VDb25maWcnO1xyXG5pbXBvcnQgeyBTZW5kaW5nTWFuYWdlciB9IGZyb20gJy4vU2VuZGluZ01hbmFnZXInO1xyXG5pbXBvcnQgeyBJbnZva2VDYWxsYmFjayB9IGZyb20gJy4vY29tbW9uL0ludm9rZUNhbGxiYWNrJztcclxuaW1wb3J0IHsgQ29ubmVjdGlvblBvcnQgfSBmcm9tICcuL2NvbW1vbi9Db25uZWN0aW9uUG9ydCc7XHJcblxyXG4vKipcclxuICogIOi/nOeoi+iwg+eUqOaOp+WItuWZqFxyXG4gKiBcclxuICogQGV4cG9ydFxyXG4gKiBAY2xhc3MgUmVtb3RlSW52b2tlXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgUmVtb3RlSW52b2tlIGV4dGVuZHMgU2VuZGluZ01hbmFnZXIge1xyXG5cclxuICAgIHByaXZhdGUgc3RhdGljIF9tZXNzYWdlSUQgPSAwOyAgLy/mtojmga/nvJblj7fku44w5byA5aeLXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfdGltZW91dDogbnVtYmVyOyAvL+ivt+axgui2heaXtlxyXG5cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX21vZHVsZU5hbWU6IHN0cmluZzsgICAgLy/mqKHlnZflkI3np7BcclxuXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9yZXBvcnRFcnJvclN0YWNrOiBib29sZWFuO1xyXG5cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX2ludm9rZUNhbGxiYWNrOiBNYXA8bnVtYmVyLCBJbnZva2VDYWxsYmFjaz4gPSBuZXcgTWFwKCk7ICAvLyDms6jlhozosIPnlKjlm57osINcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWvueWkluWvvOWHuueahOaWueazleWIl+ihqFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBleHBvcnRMaXN0OiBNYXA8c3RyaW5nLCAoYXJnczogYW55W10pID0+IFByb21pc2U8YW55Pj4gPSBuZXcgTWFwKCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDms6jlhoznmoTlub/mkq3mjqXmlLblmaggICAgXHJcbiAgICAgKiBcclxuICAgICAqIGtlee+8mm1vZHVsZU5hbWUgLT4gbWVzc2FnZU5hbWVcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgcmVjZWl2ZUxpc3Q6IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIChhcmdzOiBhbnlbXSkgPT4gdm9pZD4+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZzogUmVtb3RlSW52b2tlQ29uZmlnKSB7XHJcbiAgICAgICAgc3VwZXIoY29uZmlnKTtcclxuICAgICAgICB0aGlzLl9tb2R1bGVOYW1lID0gY29uZmlnLm1vZHVsZU5hbWU7XHJcbiAgICAgICAgdGhpcy5fcmVwb3J0RXJyb3JTdGFjayA9ICEhY29uZmlnLnJlcG9ydEVycm9yU3RhY2s7XHJcbiAgICAgICAgdGhpcy5fdGltZW91dCA9IGNvbmZpZy50aW1lb3V0ID09PSB1bmRlZmluZWQgPyAwIDogY29uZmlnLnRpbWVvdXQgPCAwID8gMCA6IGNvbmZpZy50aW1lb3V0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+R6YCB5raI5oGvXHJcbiAgICAgKiBcclxuICAgICAqIEBwcml2YXRlXHJcbiAgICAgKiBAcGFyYW0geyhzdHJpbmcgfCB1bmRlZmluZWQpfSByZWNlaXZlciDmjqXmlLbmqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlTmFtZSDmtojmga/nmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlSUQg5raI5oGv55qE57yW5Y+3XHJcbiAgICAgKiBAcGFyYW0ge01lc3NhZ2VUeXBlfSB0eXBlIOa2iOaBr+eahOexu+Wei1xyXG4gICAgICogQHBhcmFtIHsobnVtYmVyIHwgdW5kZWZpbmVkKX0gZXhwaXJlIOi/h+acn+aXtumXtFxyXG4gICAgICogQHBhcmFtIHthbnlbXX0gZGF0YSDopoHlj5HpgIHnmoTmlbDmja5cclxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSBcclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZChyZWNlaXZlcjogc3RyaW5nIHwgdW5kZWZpbmVkLCBtZXNzYWdlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBtZXNzYWdlSUQ6IG51bWJlciwgdHlwZTogTWVzc2FnZVR5cGUsIGV4cGlyZTogbnVtYmVyLCBkYXRhOiBhbnlbXSwgZXJyb3I/OiBFcnJvcik6IFByb21pc2U8dm9pZD4ge1xyXG5cclxuICAgICAgICBjb25zdCBzZW5kaW5nRGF0YTogU2VuZGluZ0RhdGEgPSB7XHJcbiAgICAgICAgICAgIHNlbmRlcjogdGhpcy5fbW9kdWxlTmFtZSxcclxuICAgICAgICAgICAgcmVjZWl2ZXIsXHJcbiAgICAgICAgICAgIG1lc3NhZ2VJRCxcclxuICAgICAgICAgICAgbWVzc2FnZU5hbWUsXHJcbiAgICAgICAgICAgIHR5cGUsXHJcbiAgICAgICAgICAgIHNlbmRUaW1lOiAobmV3IERhdGUpLmdldFRpbWUoKSxcclxuICAgICAgICAgICAgZXhwaXJlLFxyXG4gICAgICAgICAgICBkYXRhLFxyXG4gICAgICAgICAgICBlcnJvcjogZXJyb3IgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHsgbWVzc2FnZTogZXJyb3IubWVzc2FnZSwgc3RhY2s6IHRoaXMuX3JlcG9ydEVycm9yU3RhY2sgPyBlcnJvci5zdGFjayA6IHVuZGVmaW5lZCB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHN1cGVyLl9zZW5kRGF0YShzZW5kaW5nRGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmjqXmlLbliLDmtojmga9cclxuICAgICAqIFxyXG4gICAgICogQHByb3RlY3RlZFxyXG4gICAgICogQHBhcmFtIHtTZW5kaW5nRGF0YX0gZGF0YSBcclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIF9vbk1lc3NhZ2UoZGF0YTogU2VuZGluZ0RhdGEpIHtcclxuICAgICAgICBzd2l0Y2ggKGRhdGEudHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZTpcclxuICAgICAgICAgICAgICAgIGlmIChkYXRhLnJlY2VpdmVyICE9PSB0aGlzLl9tb2R1bGVOYW1lKSB7ICAgLy/noa7kv53mlLbku7bkurpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lcnJvckxvZygn5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGvJywgZGF0YSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEuZXhwaXJlID09PSAwIHx8IGRhdGEuZXhwaXJlID4gKG5ldyBEYXRlKS5nZXRUaW1lKCkpIHsgICAvL+ehruS/nea2iOaBr+i/mOayoeaciei/h+acn1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZ1bmMgPSB0aGlzLmV4cG9ydExpc3QuZ2V0KGRhdGEubWVzc2FnZU5hbWUgYXMgc3RyaW5nKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzZW5kID0gdGhpcy5fc2VuZC5iaW5kKHRoaXMsIGRhdGEuc2VuZGVyLCB1bmRlZmluZWQsIGRhdGEubWVzc2FnZUlELCBNZXNzYWdlVHlwZS5yZXBseUludm9rZSwgZGF0YS5leHBpcmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChmdW5jICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy/noa7kv53miafooYzlrozkuobkuZ/lnKjov4fmnJ/ml7bpl7TkuYvlhoVcclxuICAgICAgICAgICAgICAgICAgICAgICAgZnVuYyhkYXRhLmRhdGEpLnRoZW4oKHJlc3VsdCkgPT4gZGF0YS5leHBpcmUgPT09IDAgfHwgZGF0YS5leHBpcmUgPiAobmV3IERhdGUpLmdldFRpbWUoKSAmJiBzZW5kKFtyZXN1bHRdKSkuY2F0Y2goKCkgPT4geyB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kKFtdLCBuZXcgRXJyb3IoJ+iwg+eUqOi/nOerr+aooeWdl+eahOaWueazleS4jeWtmOWcqOaIluiAheayoeacieiiq+WvvOWHuicpKS5jYXRjaCgoKSA9PiB7IH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5yZXBseUludm9rZTpcclxuICAgICAgICAgICAgICAgIGlmIChkYXRhLnJlY2VpdmVyICE9PSB0aGlzLl9tb2R1bGVOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXJyb3JMb2coJ+aUtuWIsOS6huS4jeWxnuS6juiHquW3seeahOa2iOaBrycsIGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdHJsID0gdGhpcy5faW52b2tlQ2FsbGJhY2suZ2V0KGRhdGEubWVzc2FnZUlEKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY3RybCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdHJsLnRhcmdldE5hbWUgIT09IGRhdGEuc2VuZGVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdHJsLnJlamVjdChuZXcgRXJyb3IoYOi/nOerr+iwg+eUqOi/lOWbnueahOe7k+aenOW5tuS4jeaYr+eUseacn+acm+eahOiiq+iwg+eUqOiAhei/lOWbnueahO+8gVxcclxcbuacn+acm+eahOiiq+iwg+eUqOiAhe+8miR7Y3RybC50YXJnZXROYW1lfSAgIOWunumZhei/lOWbnue7k+aenOeahOiiq+iwg+eUqOiAhe+8miR7ZGF0YS5zZW5kZXJ9YCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuZXJyb3IgPT09IHVuZGVmaW5lZCkgICAvL+ajgOafpei/nOerr+aJp+ihjOaYr+WQpuWHuumUmVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN0cmwucmVzb2x2ZShkYXRhLmRhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXJyID0gbmV3IEVycm9yKGRhdGEuZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuZXJyb3Iuc3RhY2sgIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyLnN0YWNrID0gZGF0YS5lcnJvci5zdGFjaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdHJsLnJlamVjdChlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDpcclxuICAgICAgICAgICAgICAgIGlmIChkYXRhLnNlbmRlciA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXJyb3JMb2coJ+aUtuWIsOS6huayoeacieagh+azqOWPkemAgeiAheeahOW5v+aSrScsIGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhLm1lc3NhZ2VOYW1lID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lcnJvckxvZygn5pS25Yiw5LqG5raI5oGv5ZCN56ew5Li656m655qE5bm/5pKtJywgZGF0YSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IF9tb2R1bGUgPSB0aGlzLnJlY2VpdmVMaXN0LmdldChkYXRhLnNlbmRlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVjZWl2ZXJzID0gX21vZHVsZSAmJiBfbW9kdWxlLmdldChkYXRhLm1lc3NhZ2VOYW1lKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlY2VpdmVycyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVycyhkYXRhLmRhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2Vycm9yTG9nKCfmlLbliLDkuoboh6rlt7HmsqHmnInms6jlhozov4fnmoTlub/mkq0nLCBkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9lcnJvckxvZygn5pS25Yiw5LqG5LiN5a2Y5Zyo55qE5raI5oGv57G75Z6LJywgZGF0YSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmiZPljbDplJnor6/mtojmga9cclxuICAgICAqIFxyXG4gICAgICogQHByaXZhdGVcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBkZXNjcmlwdGlvbiDmj4/ov7BcclxuICAgICAqIEBwYXJhbSB7Kn0gZGF0YSDmlLbliLDnmoTmlbDmja5cclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfZXJyb3JMb2coZGVzY3JpcHRpb246IHN0cmluZywgZGF0YTogYW55KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaGFzTGlzdGVuZXJzKCdlcnJvcicpKSB7ICAgLy/lpoLmnpzms6jlhozkuobplJnor6/nm5HlkKzlmajlsLHkuI3miZPljbDkuoZcclxuICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcihg5qih5Z2X77yaJHt0aGlzLl9tb2R1bGVOYW1lfSAke2Rlc2NyaXB0aW9ufeOAguaUtuWIsOeahOaVsOaNru+8miR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9YCkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGxvZy53YXJuXHJcbiAgICAgICAgICAgICAgICAubG9jYXRpb24ueWVsbG93XHJcbiAgICAgICAgICAgICAgICAudGl0bGUueWVsbG93XHJcbiAgICAgICAgICAgICAgICAuY29udGVudC55ZWxsb3dcclxuICAgICAgICAgICAgICAgIC50ZXh0LnllbGxvdyhgcmVtb3RlLWludm9rZTog5qih5Z2X77yaJHt0aGlzLl9tb2R1bGVOYW1lfWAsIGRlc2NyaXB0aW9uLCBg5pS25Yiw55qE5pWw5o2u77yaYCwgZGF0YSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5a+55aSW5a+85Ye65pa55rOVXHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIOimgeiiq+WvvOWHuueahOaWueazleeahOWQjeensFxyXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyDopoHooqvlr7zlh7rnmoTmlrnms5VcclxuICAgICAqIEByZXR1cm5zIHtGdW5jdGlvbn0gXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIGV4cG9ydDxGIGV4dGVuZHMgKGFyZ3M6IGFueVtdKSA9PiBQcm9taXNlPGFueT4+KG5hbWU6IHN0cmluZywgZnVuYzogRik6IEYge1xyXG4gICAgICAgIGlmICh0aGlzLmV4cG9ydExpc3QuaGFzKG5hbWUpKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaWueazlSAnJHtuYW1lfScg5LiN5Y+v5Lul6YeN5aSN5a+85Ye644CCYCk7XHJcblxyXG4gICAgICAgIHRoaXMuZXhwb3J0TGlzdC5zZXQobmFtZSwgZnVuYyk7XHJcbiAgICAgICAgdGhpcy5lbWl0KCdleHBvcnQnLCBuYW1lKTtcclxuICAgICAgICByZXR1cm4gZnVuYztcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWPlua2iOWvvOWHuuaWueazlVxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSDlr7zlh7rnmoTmlrnms5XnmoTlkI3np7BcclxuICAgICAqIEByZXR1cm5zIHt2b2lkfSBcclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgY2FuY2VsRXhwb3J0KG5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIGlmICh0aGlzLmV4cG9ydExpc3QuZGVsZXRlKG5hbWUpKVxyXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2NhbmNlbEV4cG9ydCcsIG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM5bm/5pKt5o6l5pS25ZmoXHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzZW5kZXIg5Y+R6YCB6ICF55qE5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSDlub/mkq3mtojmga/nmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMg5a+55bqU55qE5Zue6LCD5pa55rOVXHJcbiAgICAgKiBAcmV0dXJucyB7RnVuY3Rpb259IFxyXG4gICAgICogQG1lbWJlcm9mIFJlbW90ZUludm9rZVxyXG4gICAgICovXHJcbiAgICByZWNlaXZlPEYgZXh0ZW5kcyAoYXJnczogYW55W10pID0+IHZvaWQ+KHNlbmRlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGZ1bmM6IEYpOiBGIHtcclxuICAgICAgICBsZXQgX21vZHVsZSA9IHRoaXMucmVjZWl2ZUxpc3QuZ2V0KHNlbmRlcik7XHJcbiAgICAgICAgaWYgKF9tb2R1bGUgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBfbW9kdWxlID0gbmV3IE1hcCgpO1xyXG4gICAgICAgICAgICB0aGlzLnJlY2VpdmVMaXN0LnNldChzZW5kZXIsIF9tb2R1bGUpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKF9tb2R1bGUuaGFzKG5hbWUpKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOS4jeWPr+S7pemHjeWkjeazqOWGjOW5v+aSreaOpeaUtuWZqOOAgiAnJHtzZW5kZXJ977yaJHtuYW1lfSdgKTtcclxuXHJcbiAgICAgICAgX21vZHVsZS5zZXQobmFtZSwgZnVuYyk7XHJcbiAgICAgICAgdGhpcy5lbWl0KCdyZWNlaXZlJywgbmFtZSk7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTlub/mkq3mjqXmlLblmahcclxuICAgICAqIFxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNlbmRlciDlj5HpgIHogIXnmoTmqKHlnZflkI3np7BcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIOW5v+aSrea2iOaBr+eahOWQjeensFxyXG4gICAgICogQHJldHVybnMgXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIGNhbmNlbFJlY2VpdmUoc2VuZGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IF9tb2R1bGUgPSB0aGlzLnJlY2VpdmVMaXN0LmdldChzZW5kZXIpO1xyXG4gICAgICAgIGlmIChfbW9kdWxlICYmIF9tb2R1bGUuZGVsZXRlKG5hbWUpKVxyXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2NhbmNlbFJlY2VpdmUnLCBuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOiwg+eUqOi/nOerr+aooeWdl+eahOaWueazlVxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdGFyZ2V0IOi/nOerr+aooeWdl+eahOWQjeensFxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUg6KaB6LCD55So55qE5pa55rOV5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0ge2FueVtdfSBbZGF0YV0g6KaB5Lyg6YCS55qE5pWw5o2uXHJcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxhbnk+fSBcclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgaW52b2tlKHRhcmdldDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGRhdGE/OiBhbnlbXSk6IFByb21pc2U8YW55W10+XHJcbiAgICAvKipcclxuICAgICAqIOiwg+eUqOi/nOerr+aooeWdl+eahOaWueazlVxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdGFyZ2V0IOi/nOerr+aooeWdl+eahOWQjeensFxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUg6KaB6LCD55So55qE5pa55rOV5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0ge2FueVtdfSBbZGF0YV0g6KaB5Lyg6YCS55qE5pWw5o2uXHJcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3RpbWVvdXRdIOimhueblum7mOiupOeahOiwg+eUqOi2heaXtueahOavq+enkuaVsFxyXG4gICAgICogQHJldHVybnMge1Byb21pc2U8YW55Pn0gXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIGludm9rZSh0YXJnZXQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBkYXRhPzogYW55W10sIHRpbWVvdXQ/OiBudW1iZXIpOiBQcm9taXNlPGFueVtdPlxyXG4gICAgaW52b2tlKHRhcmdldDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKTogUHJvbWlzZTxhbnlbXT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhcmdzWzBdIHx8IFtdO1xyXG4gICAgICAgICAgICBjb25zdCB0aW1lb3V0ID0gYXJnc1sxXSA9PT0gdW5kZWZpbmVkID8gdGhpcy5fdGltZW91dCA6IGFyZ3NbMV0gPCAwID8gMCA6IGFyZ3NbMV07XHJcbiAgICAgICAgICAgIGNvbnN0IGV4cGlyZSA9IHRpbWVvdXQgPT09IDAgPyAwIDogKG5ldyBEYXRlKS5nZXRUaW1lKCkgKyB0aW1lb3V0O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY29udHJvbDogSW52b2tlQ2FsbGJhY2sgPSB7XHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlSUQ6IFJlbW90ZUludm9rZS5fbWVzc2FnZUlEKyssXHJcbiAgICAgICAgICAgICAgICB0YXJnZXROYW1lOiB0YXJnZXQsXHJcbiAgICAgICAgICAgICAgICByZXNvbHZlOiAoZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pbnZva2VDYWxsYmFjay5kZWxldGUoY29udHJvbC5tZXNzYWdlSUQpO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHJlamVjdDogKGVycikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faW52b2tlQ2FsbGJhY2suZGVsZXRlKGNvbnRyb2wubWVzc2FnZUlEKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gdGltZW91dCA9PT0gMCA/IC0xIDogc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjdHJsID0gdGhpcy5faW52b2tlQ2FsbGJhY2suZ2V0KGNvbnRyb2wubWVzc2FnZUlEKTtcclxuICAgICAgICAgICAgICAgIGN0cmwgJiYgY3RybC5yZWplY3QobmV3IEVycm9yKCfosIPnlKjotoXml7YnKSk7XHJcbiAgICAgICAgICAgIH0sIHRpbWVvdXQpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5faW52b2tlQ2FsbGJhY2suc2V0KGNvbnRyb2wubWVzc2FnZUlELCBjb250cm9sKTtcclxuICAgICAgICAgICAgdGhpcy5fc2VuZCh0YXJnZXQsIG5hbWUsIGNvbnRyb2wubWVzc2FnZUlELCBNZXNzYWdlVHlwZS5pbnZva2UsIGV4cGlyZSwgZGF0YSkuY2F0Y2goY29udHJvbC5yZWplY3QpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZCR5aSW5bm/5pKt5raI5oGvXHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIOa2iOaBr+eahOWQjeensFxyXG4gICAgICogQHBhcmFtIHthbnlbXX0gW2RhdGFdIOimgeWPkemAgeeahOaVsOaNrlxyXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt0aW1lb3V0XSDmjIflrprmtojmga/ov4fmnJ/nmoTmr6vnp5LmlbBcclxuICAgICAqIFxyXG4gICAgICogQHJldHVybnMge1Byb21pc2U8YW55Pn0gXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdChuYW1lOiBzdHJpbmcsIGRhdGE6IGFueVtdID0gW10sIHRpbWVvdXQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aW1lb3V0ID0gdGltZW91dCA9PT0gdW5kZWZpbmVkID8gdGhpcy5fdGltZW91dCA6IHRpbWVvdXQgPCAwID8gMCA6IHRpbWVvdXQ7XHJcbiAgICAgICAgY29uc3QgZXhwaXJlID0gdGltZW91dCA9PT0gMCA/IDAgOiAobmV3IERhdGUpLmdldFRpbWUoKSArIHRpbWVvdXQ7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlbmQodW5kZWZpbmVkLCBuYW1lLCBSZW1vdGVJbnZva2UuX21lc3NhZ2VJRCsrLCBNZXNzYWdlVHlwZS5icm9hZGNhc3QsIGV4cGlyZSwgZGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g5a6a5LmJ5LqL5Lu2XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDms6jlhozplJnor6/nm5HlkKzlmajjgILlpoLmnpzmsqHmnInms6jlhozplJnor6/nm5HlkKzlmajvvIzliJnoh6rliqjkvJrlsIbmiYDmnInplJnor6/mtojmga/miZPljbDlh7rmnaVcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdlcnJvcicsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gYW55KTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5b2T5pyJ5paw55qE5pa55rOV6KKr5a+85Ye65pe26Kem5Y+RXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnZXhwb3J0JywgbGlzdGVuZXI6IChuYW1lOiBzdHJpbmcpID0+IGFueSk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+acieaWueazleiiq+WPlua2iOWvvOWHuuaXtuinpuWPkVxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ2NhbmNlbEV4cG9ydCcsIGxpc3RlbmVyOiAobmFtZTogc3RyaW5nKSA9PiBhbnkpOiB0aGlzO1xyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPmnInmlrDnmoTlub/mkq3mjqXmlLblmajooqvms6jlhozml7bop6blj5FcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdyZWNlaXZlJywgbGlzdGVuZXI6IChuYW1lOiBzdHJpbmcpID0+IGFueSk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+acieW5v+aSreaOpeaUtuWZqOiiq+WIoOmZpOaXtuinpuWPkVxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ2NhbmNlbFJlY2VpdmUnLCBsaXN0ZW5lcjogKG5hbWU6IHN0cmluZykgPT4gYW55KTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM5re75Yqg5paw55qE6L+e5o6l56uv5Y+j55uR5ZCs5ZmoXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnYWRkQ29ubmVjdGlvblBvcnQnLCBsaXN0ZW5lcjogKGNvbm5lY3Rpb246IENvbm5lY3Rpb25Qb3J0KSA9PiBhbnkpOiB0aGlzO1xyXG4gICAgLyoqXHJcbiAgICAgKiDms6jlhozliKDpmaTov57mjqXnq6/lj6Pnm5HlkKzlmahcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdyZW1vdmVDb25uZWN0aW9uUG9ydCcsIGxpc3RlbmVyOiAoY29ubmVjdGlvbjogQ29ubmVjdGlvblBvcnQpID0+IGFueSk6IHRoaXM7XHJcbiAgICBvbihldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogRnVuY3Rpb24pOiB0aGlzIHtcclxuICAgICAgICBzdXBlci5vbihldmVudCwgbGlzdGVuZXIpO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIG9uY2UoZXZlbnQ6ICdlcnJvcicsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gYW55KTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdleHBvcnQnLCBsaXN0ZW5lcjogKG5hbWU6IHN0cmluZykgPT4gYW55KTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdjYW5jZWxFeHBvcnQnLCBsaXN0ZW5lcjogKG5hbWU6IHN0cmluZykgPT4gYW55KTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdyZWNlaXZlJywgbGlzdGVuZXI6IChuYW1lOiBzdHJpbmcpID0+IGFueSk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnY2FuY2VsUmVjZWl2ZScsIGxpc3RlbmVyOiAobmFtZTogc3RyaW5nKSA9PiBhbnkpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ2FkZENvbm5lY3Rpb25Qb3J0JywgbGlzdGVuZXI6IChjb25uZWN0aW9uOiBDb25uZWN0aW9uUG9ydCkgPT4gYW55KTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdyZW1vdmVDb25uZWN0aW9uUG9ydCcsIGxpc3RlbmVyOiAoY29ubmVjdGlvbjogQ29ubmVjdGlvblBvcnQpID0+IGFueSk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiBGdW5jdGlvbik6IHRoaXMge1xyXG4gICAgICAgIHN1cGVyLm9uY2UoZXZlbnQsIGxpc3RlbmVyKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxufSJdfQ==
