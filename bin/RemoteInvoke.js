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
        this.moduleName = config.moduleName;
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
     * @param {any} data 要发送的数据
     * @returns {Promise<void>}
     * @memberof RemoteInvoke
     */
    _send(receiver, messageName, messageID, type, expire, data, error) {
        const sendingData = {
            sender: this.moduleName,
            receiver,
            messageID,
            messageName,
            type,
            sendTime: (new Date).getTime(),
            expire,
            data,
            error: error === undefined ? undefined : { message: error.message, stack: this._reportErrorStack ? error.stack : undefined }
        };
        debugger;
        return super._sendData(sendingData);
    }
    /**
     * 接收消息
     *
     * @protected
     * @param {SendingData} data 收到的数据
     * @memberof RemoteInvoke
     */
    _onMessage(data) {
        debugger;
        switch (data.type) {
            case MessageType_1.MessageType.invoke:
                if (data.receiver !== this.moduleName) {
                    this._errorLog('收到了不属于自己的消息', data);
                }
                else if (data.expire === 0 || data.expire > (new Date).getTime()) {
                    const func = this.exportList.get(data.messageName);
                    const send = this._send.bind(this, data.sender, undefined, data.messageID, MessageType_1.MessageType.replyInvoke, data.expire);
                    if (func !== undefined) {
                        //确保执行完了也在过期时间之内
                        func(data.data)
                            .then((result) => [result])
                            .catch((err) => [undefined, err])
                            .then(result => {
                            if (data.expire === 0 || data.expire > (new Date).getTime())
                                send(...result).catch(() => { });
                        });
                    }
                    else {
                        send(undefined, new Error('调用远端模块的方法不存在或者没有被导出')).catch(() => { });
                    }
                }
                break;
            case MessageType_1.MessageType.replyInvoke:
                if (data.receiver !== this.moduleName) {
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
                    this._errorLog('收到了没有指明发送者的广播', data);
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
            this.emit('error', new Error(`模块：${this.moduleName} ${description}。收到的数据：${JSON.stringify(data)}`));
        }
        else {
            log_formatter_1.default.warn
                .location.yellow
                .title.yellow
                .content.yellow
                .text.yellow(`remote-invoke: 模块：${this.moduleName}`, description, `收到的数据：`, data);
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
            const data = args[0];
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
     * @param {any} [data] 要发送的数据
     * @param {number} [timeout] 指定消息过期的毫秒数
     *
     * @returns {Promise<any>}
     * @memberof RemoteInvoke
     */
    broadcast(name, data, timeout) {
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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R0FBRyxPQUFPLENBQUM7UUFDNUUsTUFBTSxNQUFNLEdBQUcsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxHQUFHLE9BQU8sQ0FBQztRQUNsRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLFlBQVksQ0FBQyxVQUFVLEVBQUUsRUFBRSx5QkFBVyxDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDdkcsQ0FBQztJQWdDRCxFQUFFLENBQUMsS0FBYSxFQUFFLFFBQWtCO1FBQ2hDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzFCLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQVNELElBQUksQ0FBQyxLQUFhLEVBQUUsUUFBa0I7UUFDbEMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDNUIsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDOztBQWxWYyx1QkFBVSxHQUFHLENBQUMsQ0FBQyxDQUFFLFVBQVU7QUFGOUMsb0NBcVZDIiwiZmlsZSI6IlJlbW90ZUludm9rZS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBsb2cgZnJvbSAnbG9nLWZvcm1hdHRlcic7XHJcbmltcG9ydCB7IFNlbmRpbmdEYXRhIH0gZnJvbSAnLi9jb21tb24vU2VuZGluZ0RhdGEnO1xyXG5pbXBvcnQgeyBNZXNzYWdlVHlwZSB9IGZyb20gJy4vY29tbW9uL01lc3NhZ2VUeXBlJztcclxuaW1wb3J0IHsgUmVtb3RlSW52b2tlQ29uZmlnIH0gZnJvbSAnLi9jb21tb24vUmVtb3RlSW52b2tlQ29uZmlnJztcclxuaW1wb3J0IHsgU2VuZGluZ01hbmFnZXIgfSBmcm9tICcuL1NlbmRpbmdNYW5hZ2VyJztcclxuaW1wb3J0IHsgSW52b2tlQ2FsbGJhY2sgfSBmcm9tICcuL2NvbW1vbi9JbnZva2VDYWxsYmFjayc7XHJcbmltcG9ydCB7IENvbm5lY3Rpb25Qb3J0IH0gZnJvbSAnLi9jb21tb24vQ29ubmVjdGlvblBvcnQnO1xyXG5cclxuLyoqXHJcbiAqICDov5znqIvosIPnlKjmjqfliLblmahcclxuICogXHJcbiAqIEBleHBvcnRcclxuICogQGNsYXNzIFJlbW90ZUludm9rZVxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFJlbW90ZUludm9rZSBleHRlbmRzIFNlbmRpbmdNYW5hZ2VyIHtcclxuXHJcbiAgICBwcml2YXRlIHN0YXRpYyBfbWVzc2FnZUlEID0gMDsgIC8v5raI5oGv57yW5Y+35LuOMOW8gOWni1xyXG5cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX3RpbWVvdXQ6IG51bWJlcjsgLy/or7fmsYLotoXml7ZcclxuXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9yZXBvcnRFcnJvclN0YWNrOiBib29sZWFuO1xyXG5cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX2ludm9rZUNhbGxiYWNrOiBNYXA8bnVtYmVyLCBJbnZva2VDYWxsYmFjaz4gPSBuZXcgTWFwKCk7ICAvLyDms6jlhozosIPnlKjlm57osINcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaooeWdl+WQjeensFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBtb2R1bGVOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlr7nlpJblr7zlh7rnmoTmlrnms5XliJfooahcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgZXhwb3J0TGlzdDogTWFwPHN0cmluZywgKGFyZzogYW55KSA9PiBQcm9taXNlPGFueT4+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM55qE5bm/5pKt5o6l5pS25ZmoICAgIFxyXG4gICAgICogXHJcbiAgICAgKiBrZXnvvJptb2R1bGVOYW1lIC0+IG1lc3NhZ2VOYW1lXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IHJlY2VpdmVMaXN0OiBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCAoYXJnOiBhbnkpID0+IHZvaWQ+PiA9IG5ldyBNYXAoKTtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihjb25maWc6IFJlbW90ZUludm9rZUNvbmZpZykge1xyXG4gICAgICAgIHN1cGVyKGNvbmZpZyk7XHJcbiAgICAgICAgdGhpcy5tb2R1bGVOYW1lID0gY29uZmlnLm1vZHVsZU5hbWU7XHJcbiAgICAgICAgdGhpcy5fcmVwb3J0RXJyb3JTdGFjayA9ICEhY29uZmlnLnJlcG9ydEVycm9yU3RhY2s7XHJcbiAgICAgICAgdGhpcy5fdGltZW91dCA9IGNvbmZpZy50aW1lb3V0ID09PSB1bmRlZmluZWQgPyAwIDogY29uZmlnLnRpbWVvdXQgPCAwID8gMCA6IGNvbmZpZy50aW1lb3V0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+R6YCB5raI5oGvXHJcbiAgICAgKiBcclxuICAgICAqIEBwcml2YXRlXHJcbiAgICAgKiBAcGFyYW0geyhzdHJpbmcgfCB1bmRlZmluZWQpfSByZWNlaXZlciDmjqXmlLbmqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlTmFtZSDmtojmga/nmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlSUQg5raI5oGv55qE57yW5Y+3XHJcbiAgICAgKiBAcGFyYW0ge01lc3NhZ2VUeXBlfSB0eXBlIOa2iOaBr+eahOexu+Wei1xyXG4gICAgICogQHBhcmFtIHsobnVtYmVyIHwgdW5kZWZpbmVkKX0gZXhwaXJlIOi/h+acn+aXtumXtFxyXG4gICAgICogQHBhcmFtIHthbnl9IGRhdGEg6KaB5Y+R6YCB55qE5pWw5o2uXHJcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3NlbmQocmVjZWl2ZXI6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWVzc2FnZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWVzc2FnZUlEOiBudW1iZXIsIHR5cGU6IE1lc3NhZ2VUeXBlLCBleHBpcmU6IG51bWJlciwgZGF0YTogYW55LCBlcnJvcj86IEVycm9yKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgICAgIGNvbnN0IHNlbmRpbmdEYXRhOiBTZW5kaW5nRGF0YSA9IHtcclxuICAgICAgICAgICAgc2VuZGVyOiB0aGlzLm1vZHVsZU5hbWUsXHJcbiAgICAgICAgICAgIHJlY2VpdmVyLFxyXG4gICAgICAgICAgICBtZXNzYWdlSUQsXHJcbiAgICAgICAgICAgIG1lc3NhZ2VOYW1lLFxyXG4gICAgICAgICAgICB0eXBlLFxyXG4gICAgICAgICAgICBzZW5kVGltZTogKG5ldyBEYXRlKS5nZXRUaW1lKCksXHJcbiAgICAgICAgICAgIGV4cGlyZSxcclxuICAgICAgICAgICAgZGF0YSxcclxuICAgICAgICAgICAgZXJyb3I6IGVycm9yID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB7IG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsIHN0YWNrOiB0aGlzLl9yZXBvcnRFcnJvclN0YWNrID8gZXJyb3Iuc3RhY2sgOiB1bmRlZmluZWQgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgZGVidWdnZXJcclxuICAgICAgICByZXR1cm4gc3VwZXIuX3NlbmREYXRhKHNlbmRpbmdEYXRhKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaOpeaUtua2iOaBr1xyXG4gICAgICogXHJcbiAgICAgKiBAcHJvdGVjdGVkXHJcbiAgICAgKiBAcGFyYW0ge1NlbmRpbmdEYXRhfSBkYXRhIOaUtuWIsOeahOaVsOaNrlxyXG4gICAgICogQG1lbWJlcm9mIFJlbW90ZUludm9rZVxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgX29uTWVzc2FnZShkYXRhOiBTZW5kaW5nRGF0YSkge1xyXG4gICAgICAgIGRlYnVnZ2VyXHJcbiAgICAgICAgc3dpdGNoIChkYXRhLnR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2U6XHJcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5yZWNlaXZlciAhPT0gdGhpcy5tb2R1bGVOYW1lKSB7ICAgLy/noa7kv53mlLbku7bkurpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lcnJvckxvZygn5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGvJywgZGF0YSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEuZXhwaXJlID09PSAwIHx8IGRhdGEuZXhwaXJlID4gKG5ldyBEYXRlKS5nZXRUaW1lKCkpIHsgICAvL+ehruS/nea2iOaBr+i/mOayoeaciei/h+acn1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZ1bmMgPSB0aGlzLmV4cG9ydExpc3QuZ2V0KGRhdGEubWVzc2FnZU5hbWUgYXMgc3RyaW5nKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzZW5kID0gdGhpcy5fc2VuZC5iaW5kKHRoaXMsIGRhdGEuc2VuZGVyLCB1bmRlZmluZWQsIGRhdGEubWVzc2FnZUlELCBNZXNzYWdlVHlwZS5yZXBseUludm9rZSwgZGF0YS5leHBpcmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChmdW5jICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy/noa7kv53miafooYzlrozkuobkuZ/lnKjov4fmnJ/ml7bpl7TkuYvlhoVcclxuICAgICAgICAgICAgICAgICAgICAgICAgZnVuYyhkYXRhLmRhdGEpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbigocmVzdWx0KSA9PiBbcmVzdWx0XSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoZXJyKSA9PiBbdW5kZWZpbmVkLCBlcnJdKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS5leHBpcmUgPT09IDAgfHwgZGF0YS5leHBpcmUgPiAobmV3IERhdGUpLmdldFRpbWUoKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZCguLi5yZXN1bHQpLmNhdGNoKCgpID0+IHsgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kKHVuZGVmaW5lZCwgbmV3IEVycm9yKCfosIPnlKjov5znq6/mqKHlnZfnmoTmlrnms5XkuI3lrZjlnKjmiJbogIXmsqHmnInooqvlr7zlh7onKSkuY2F0Y2goKCkgPT4geyB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUucmVwbHlJbnZva2U6XHJcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5yZWNlaXZlciAhPT0gdGhpcy5tb2R1bGVOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXJyb3JMb2coJ+aUtuWIsOS6huS4jeWxnuS6juiHquW3seeahOa2iOaBrycsIGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdHJsID0gdGhpcy5faW52b2tlQ2FsbGJhY2suZ2V0KGRhdGEubWVzc2FnZUlEKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY3RybCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdHJsLnRhcmdldE5hbWUgIT09IGRhdGEuc2VuZGVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdHJsLnJlamVjdChuZXcgRXJyb3IoYOi/nOerr+iwg+eUqOi/lOWbnueahOe7k+aenOW5tuS4jeaYr+eUseacn+acm+eahOiiq+iwg+eUqOiAhei/lOWbnueahO+8gVxcclxcbuacn+acm+eahOiiq+iwg+eUqOiAhe+8miR7Y3RybC50YXJnZXROYW1lfSAgIOWunumZhei/lOWbnue7k+aenOeahOiiq+iwg+eUqOiAhe+8miR7ZGF0YS5zZW5kZXJ9YCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuZXJyb3IgPT09IHVuZGVmaW5lZCkgICAvL+ajgOafpei/nOerr+aJp+ihjOaYr+WQpuWHuumUmVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN0cmwucmVzb2x2ZShkYXRhLmRhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXJyID0gbmV3IEVycm9yKGRhdGEuZXJyb3IubWVzc2FnZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuZXJyb3Iuc3RhY2sgIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyLnN0YWNrID0gZGF0YS5lcnJvci5zdGFjaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdHJsLnJlamVjdChlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDpcclxuICAgICAgICAgICAgICAgIGlmIChkYXRhLnNlbmRlciA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXJyb3JMb2coJ+aUtuWIsOS6huayoeacieaMh+aYjuWPkemAgeiAheeahOW5v+aSrScsIGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhLm1lc3NhZ2VOYW1lID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lcnJvckxvZygn5pS25Yiw5LqG5raI5oGv5ZCN56ew5Li656m655qE5bm/5pKtJywgZGF0YSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IF9tb2R1bGUgPSB0aGlzLnJlY2VpdmVMaXN0LmdldChkYXRhLnNlbmRlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVjZWl2ZXJzID0gX21vZHVsZSAmJiBfbW9kdWxlLmdldChkYXRhLm1lc3NhZ2VOYW1lKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlY2VpdmVycyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVycyhkYXRhLmRhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2Vycm9yTG9nKCfmlLbliLDkuoboh6rlt7HmsqHmnInms6jlhozov4fnmoTlub/mkq0nLCBkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9lcnJvckxvZygn5pS25Yiw5LqG5LiN5a2Y5Zyo55qE5raI5oGv57G75Z6LJywgZGF0YSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmiZPljbDplJnor6/mtojmga9cclxuICAgICAqIFxyXG4gICAgICogQHByaXZhdGVcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBkZXNjcmlwdGlvbiDmj4/ov7BcclxuICAgICAqIEBwYXJhbSB7Kn0gZGF0YSDmlLbliLDnmoTmlbDmja5cclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfZXJyb3JMb2coZGVzY3JpcHRpb246IHN0cmluZywgZGF0YTogYW55KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaGFzTGlzdGVuZXJzKCdlcnJvcicpKSB7ICAgLy/lpoLmnpzms6jlhozkuobplJnor6/nm5HlkKzlmajlsLHkuI3miZPljbDkuoZcclxuICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcihg5qih5Z2X77yaJHt0aGlzLm1vZHVsZU5hbWV9ICR7ZGVzY3JpcHRpb25944CC5pS25Yiw55qE5pWw5o2u77yaJHtKU09OLnN0cmluZ2lmeShkYXRhKX1gKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbG9nLndhcm5cclxuICAgICAgICAgICAgICAgIC5sb2NhdGlvbi55ZWxsb3dcclxuICAgICAgICAgICAgICAgIC50aXRsZS55ZWxsb3dcclxuICAgICAgICAgICAgICAgIC5jb250ZW50LnllbGxvd1xyXG4gICAgICAgICAgICAgICAgLnRleHQueWVsbG93KGByZW1vdGUtaW52b2tlOiDmqKHlnZfvvJoke3RoaXMubW9kdWxlTmFtZX1gLCBkZXNjcmlwdGlvbiwgYOaUtuWIsOeahOaVsOaNru+8mmAsIGRhdGEpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWvueWkluWvvOWHuuaWueazlVxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSDopoHooqvlr7zlh7rnmoTmlrnms5XnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMg6KaB6KKr5a+85Ye655qE5pa55rOVXHJcbiAgICAgKiBAcmV0dXJucyB7RnVuY3Rpb259IFxyXG4gICAgICogQG1lbWJlcm9mIFJlbW90ZUludm9rZVxyXG4gICAgICovXHJcbiAgICBleHBvcnQ8RiBleHRlbmRzIChhcmc6IGFueSkgPT4gUHJvbWlzZTxhbnk+PihuYW1lOiBzdHJpbmcsIGZ1bmM6IEYpOiBGIHtcclxuICAgICAgICBpZiAodGhpcy5leHBvcnRMaXN0LmhhcyhuYW1lKSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmlrnms5UgJyR7bmFtZX0nIOS4jeWPr+S7pemHjeWkjeWvvOWHuuOAgmApO1xyXG5cclxuICAgICAgICB0aGlzLmV4cG9ydExpc3Quc2V0KG5hbWUsIGZ1bmMpO1xyXG4gICAgICAgIHRoaXMuZW1pdCgnZXhwb3J0JywgbmFtZSk7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlj5bmtojlr7zlh7rmlrnms5VcclxuICAgICAqIFxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUg5a+85Ye655qE5pa55rOV55qE5ZCN56ewXHJcbiAgICAgKiBAcmV0dXJucyB7dm9pZH0gXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIGNhbmNlbEV4cG9ydChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5leHBvcnRMaXN0LmRlbGV0ZShuYW1lKSlcclxuICAgICAgICAgICAgdGhpcy5lbWl0KCdjYW5jZWxFeHBvcnQnLCBuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOazqOWGjOW5v+aSreaOpeaUtuWZqFxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc2VuZGVyIOWPkemAgeiAheeahOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUg5bm/5pKt5raI5oGv55qE5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIOWvueW6lOeahOWbnuiwg+aWueazlVxyXG4gICAgICogQHJldHVybnMge0Z1bmN0aW9ufSBcclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgcmVjZWl2ZTxGIGV4dGVuZHMgKGFyZzogYW55KSA9PiB2b2lkPihzZW5kZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCBmdW5jOiBGKTogRiB7XHJcbiAgICAgICAgbGV0IF9tb2R1bGUgPSB0aGlzLnJlY2VpdmVMaXN0LmdldChzZW5kZXIpO1xyXG4gICAgICAgIGlmIChfbW9kdWxlID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgX21vZHVsZSA9IG5ldyBNYXAoKTtcclxuICAgICAgICAgICAgdGhpcy5yZWNlaXZlTGlzdC5zZXQoc2VuZGVyLCBfbW9kdWxlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChfbW9kdWxlLmhhcyhuYW1lKSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDkuI3lj6/ku6Xph43lpI3ms6jlhozlub/mkq3mjqXmlLblmajjgIIgJyR7c2VuZGVyfe+8miR7bmFtZX0nYCk7XHJcblxyXG4gICAgICAgIF9tb2R1bGUuc2V0KG5hbWUsIGZ1bmMpO1xyXG4gICAgICAgIHRoaXMuZW1pdCgncmVjZWl2ZScsIG5hbWUpO1xyXG4gICAgICAgIHJldHVybiBmdW5jO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Yig6Zmk5bm/5pKt5o6l5pS25ZmoXHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzZW5kZXIg5Y+R6YCB6ICF55qE5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSDlub/mkq3mtojmga/nmoTlkI3np7BcclxuICAgICAqIEByZXR1cm5zIFxyXG4gICAgICogQG1lbWJlcm9mIFJlbW90ZUludm9rZVxyXG4gICAgICovXHJcbiAgICBjYW5jZWxSZWNlaXZlKHNlbmRlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBfbW9kdWxlID0gdGhpcy5yZWNlaXZlTGlzdC5nZXQoc2VuZGVyKTtcclxuICAgICAgICBpZiAoX21vZHVsZSAmJiBfbW9kdWxlLmRlbGV0ZShuYW1lKSlcclxuICAgICAgICAgICAgdGhpcy5lbWl0KCdjYW5jZWxSZWNlaXZlJywgbmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjov5znq6/mqKHlnZfnmoTmlrnms5VcclxuICAgICAqIFxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHRhcmdldCDov5znq6/mqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIOimgeiwg+eUqOeahOaWueazleWQjeensFxyXG4gICAgICogQHBhcmFtIHthbnl9IFtkYXRhXSDopoHkvKDpgJLnmoTmlbDmja5cclxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPGFueT59IFxyXG4gICAgICogQG1lbWJlcm9mIFJlbW90ZUludm9rZVxyXG4gICAgICovXHJcbiAgICBpbnZva2UodGFyZ2V0OiBzdHJpbmcsIG5hbWU6IHN0cmluZywgZGF0YT86IGFueSk6IFByb21pc2U8YW55PlxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjov5znq6/mqKHlnZfnmoTmlrnms5VcclxuICAgICAqIFxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHRhcmdldCDov5znq6/mqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIOimgeiwg+eUqOeahOaWueazleWQjeensFxyXG4gICAgICogQHBhcmFtIHthbnl9IFtkYXRhXSDopoHkvKDpgJLnmoTmlbDmja5cclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbdGltZW91dF0g6KaG55uW6buY6K6k55qE6LCD55So6LaF5pe255qE5q+r56eS5pWwXHJcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxhbnk+fSBcclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgaW52b2tlKHRhcmdldDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGRhdGE/OiBhbnksIHRpbWVvdXQ/OiBudW1iZXIpOiBQcm9taXNlPGFueT5cclxuICAgIGludm9rZSh0YXJnZXQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSk6IFByb21pc2U8YW55PiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGFyZ3NbMF07XHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVvdXQgPSBhcmdzWzFdID09PSB1bmRlZmluZWQgPyB0aGlzLl90aW1lb3V0IDogYXJnc1sxXSA8IDAgPyAwIDogYXJnc1sxXTtcclxuICAgICAgICAgICAgY29uc3QgZXhwaXJlID0gdGltZW91dCA9PT0gMCA/IDAgOiAobmV3IERhdGUpLmdldFRpbWUoKSArIHRpbWVvdXQ7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sOiBJbnZva2VDYWxsYmFjayA9IHtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VJRDogUmVtb3RlSW52b2tlLl9tZXNzYWdlSUQrKyxcclxuICAgICAgICAgICAgICAgIHRhcmdldE5hbWU6IHRhcmdldCxcclxuICAgICAgICAgICAgICAgIHJlc29sdmU6IChkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2ludm9rZUNhbGxiYWNrLmRlbGV0ZShjb250cm9sLm1lc3NhZ2VJRCk7XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgcmVqZWN0OiAoZXJyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pbnZva2VDYWxsYmFjay5kZWxldGUoY29udHJvbC5tZXNzYWdlSUQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGltZXIgPSB0aW1lb3V0ID09PSAwID8gLTEgOiBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLl9pbnZva2VDYWxsYmFjay5nZXQoY29udHJvbC5tZXNzYWdlSUQpO1xyXG4gICAgICAgICAgICAgICAgY3RybCAmJiBjdHJsLnJlamVjdChuZXcgRXJyb3IoJ+iwg+eUqOi2heaXticpKTtcclxuICAgICAgICAgICAgfSwgdGltZW91dCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9pbnZva2VDYWxsYmFjay5zZXQoY29udHJvbC5tZXNzYWdlSUQsIGNvbnRyb2wpO1xyXG4gICAgICAgICAgICB0aGlzLl9zZW5kKHRhcmdldCwgbmFtZSwgY29udHJvbC5tZXNzYWdlSUQsIE1lc3NhZ2VUeXBlLmludm9rZSwgZXhwaXJlLCBkYXRhKS5jYXRjaChjb250cm9sLnJlamVjdCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkJHlpJblub/mkq3mtojmga9cclxuICAgICAqIFxyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUg5raI5oGv55qE5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0ge2FueX0gW2RhdGFdIOimgeWPkemAgeeahOaVsOaNrlxyXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFt0aW1lb3V0XSDmjIflrprmtojmga/ov4fmnJ/nmoTmr6vnp5LmlbBcclxuICAgICAqIFxyXG4gICAgICogQHJldHVybnMge1Byb21pc2U8YW55Pn0gXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdChuYW1lOiBzdHJpbmcsIGRhdGE/OiBhbnksIHRpbWVvdXQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aW1lb3V0ID0gdGltZW91dCA9PT0gdW5kZWZpbmVkID8gdGhpcy5fdGltZW91dCA6IHRpbWVvdXQgPCAwID8gMCA6IHRpbWVvdXQ7XHJcbiAgICAgICAgY29uc3QgZXhwaXJlID0gdGltZW91dCA9PT0gMCA/IDAgOiAobmV3IERhdGUpLmdldFRpbWUoKSArIHRpbWVvdXQ7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlbmQodW5kZWZpbmVkLCBuYW1lLCBSZW1vdGVJbnZva2UuX21lc3NhZ2VJRCsrLCBNZXNzYWdlVHlwZS5icm9hZGNhc3QsIGV4cGlyZSwgZGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g5a6a5LmJ5LqL5Lu2XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDms6jlhozplJnor6/nm5HlkKzlmajjgILlpoLmnpzmsqHmnInms6jlhozplJnor6/nm5HlkKzlmajvvIzliJnoh6rliqjkvJrlsIbmiYDmnInplJnor6/mtojmga/miZPljbDlh7rmnaVcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdlcnJvcicsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gYW55KTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5b2T5pyJ5paw55qE5pa55rOV6KKr5a+85Ye65pe26Kem5Y+RXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnZXhwb3J0JywgbGlzdGVuZXI6IChuYW1lOiBzdHJpbmcpID0+IGFueSk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+acieaWueazleiiq+WPlua2iOWvvOWHuuaXtuinpuWPkVxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ2NhbmNlbEV4cG9ydCcsIGxpc3RlbmVyOiAobmFtZTogc3RyaW5nKSA9PiBhbnkpOiB0aGlzO1xyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPmnInmlrDnmoTlub/mkq3mjqXmlLblmajooqvms6jlhozml7bop6blj5FcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdyZWNlaXZlJywgbGlzdGVuZXI6IChuYW1lOiBzdHJpbmcpID0+IGFueSk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+acieW5v+aSreaOpeaUtuWZqOiiq+WIoOmZpOaXtuinpuWPkVxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ2NhbmNlbFJlY2VpdmUnLCBsaXN0ZW5lcjogKG5hbWU6IHN0cmluZykgPT4gYW55KTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5rOo5YaM5re75Yqg5paw55qE6L+e5o6l56uv5Y+j55uR5ZCs5ZmoXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnYWRkQ29ubmVjdGlvblBvcnQnLCBsaXN0ZW5lcjogKGNvbm5lY3Rpb246IENvbm5lY3Rpb25Qb3J0KSA9PiBhbnkpOiB0aGlzO1xyXG4gICAgLyoqXHJcbiAgICAgKiDms6jlhozliKDpmaTov57mjqXnq6/lj6Pnm5HlkKzlmahcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdyZW1vdmVDb25uZWN0aW9uUG9ydCcsIGxpc3RlbmVyOiAoY29ubmVjdGlvbjogQ29ubmVjdGlvblBvcnQpID0+IGFueSk6IHRoaXM7XHJcbiAgICBvbihldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogRnVuY3Rpb24pOiB0aGlzIHtcclxuICAgICAgICBzdXBlci5vbihldmVudCwgbGlzdGVuZXIpO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIG9uY2UoZXZlbnQ6ICdlcnJvcicsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gYW55KTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdleHBvcnQnLCBsaXN0ZW5lcjogKG5hbWU6IHN0cmluZykgPT4gYW55KTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdjYW5jZWxFeHBvcnQnLCBsaXN0ZW5lcjogKG5hbWU6IHN0cmluZykgPT4gYW55KTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdyZWNlaXZlJywgbGlzdGVuZXI6IChuYW1lOiBzdHJpbmcpID0+IGFueSk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnY2FuY2VsUmVjZWl2ZScsIGxpc3RlbmVyOiAobmFtZTogc3RyaW5nKSA9PiBhbnkpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ2FkZENvbm5lY3Rpb25Qb3J0JywgbGlzdGVuZXI6IChjb25uZWN0aW9uOiBDb25uZWN0aW9uUG9ydCkgPT4gYW55KTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdyZW1vdmVDb25uZWN0aW9uUG9ydCcsIGxpc3RlbmVyOiAoY29ubmVjdGlvbjogQ29ubmVjdGlvblBvcnQpID0+IGFueSk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiBGdW5jdGlvbik6IHRoaXMge1xyXG4gICAgICAgIHN1cGVyLm9uY2UoZXZlbnQsIGxpc3RlbmVyKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxufSJdfQ==
