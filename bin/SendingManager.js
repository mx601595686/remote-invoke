"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Emitter = require("component-emitter");
/**
 * 发送管理器，负责端口的添加删除，负载均衡
 *
 * @export
 * @class SendingManager
 */
class SendingManager extends Emitter {
    constructor(config) {
        super();
        this._conPort = []; //注册的连接端口。sending表示当前接口是否正在发送数据
        this._portIndex = 0; //指示使用哪个端口来发送消息
        this._loadBalance = config.loadBalance === undefined ? true : config.loadBalance;
    }
    /**
     * 调用绑定的端口发送数据
     * @param data 要被发送的数据
     */
    _sendData(data) {
        if (this._conPort.length === 0)
            return Promise.reject(new Error('没有可用的端口来发送消息'));
        else {
            let selectedPort;
            if (this._conPort.length > 1 && this._loadBalance) {
                for (let i = 0, j = this._conPort.length - 1; i < j; i++) {
                    const port = this._conPort[++this._portIndex < this._conPort.length ? this._portIndex : this._portIndex = 0];
                    if (!port.sending) {
                        selectedPort = port;
                        break;
                    }
                }
                if (selectedPort === undefined) {
                    selectedPort = this._conPort[this._portIndex];
                }
            }
            else {
                selectedPort = this._conPort[0];
            }
            selectedPort.sending = true;
            return selectedPort.port.send(data)
                .then(() => { selectedPort.sending = false; })
                .catch((err) => { selectedPort.sending = false; throw err; });
        }
    }
    /**
     * 添加连接端口。可以添加多个端口，这样流量可以自动分担到每个端口上。如果某个端口被关闭，则它将自动被移除。
     * 注意：只有当端口连接打开之后才会触发addConnectionPort事件
     *
     * @param {ConnectionPort} connection 连接端口
     * @memberof RemoteInvoke
     */
    addConnectionPort(connection) {
        if (this._conPort.find(item => item.port === connection))
            throw new Error('相同的端口不可以重复添加');
        connection.onOpen = () => {
            connection.onMessage = this._onMessage;
            connection.onClose = () => this.removeConnectionPort(connection);
            this._conPort.push({ port: connection, sending: false });
            this.emit('addConnectionPort', connection);
        };
    }
    /**
     * 删除连接端口。删除成功触发removeConnectionPort事件
     *
     * @param {ConnectionPort} connection 连接端口
     * @returns {boolean}
     * @memberof RemoteInvoke
     */
    removeConnectionPort(connection) {
        const before = this._conPort.length;
        this._conPort = this._conPort.filter(item => item.port !== connection);
        if (before > this._conPort.length)
            this.emit('removeConnectionPort', connection);
    }
    /**
     * 删除并关闭连接端口。删除成功触发removeConnectionPort事件
     *
     * @param {ConnectionPort} connection 连接端口
     * @memberof SendingManager
     */
    removeAndCloseConnectionPort(connection) {
        connection.close();
        this.removeConnectionPort(connection);
    }
    /**
     * 删除所有连接端口。
     *
     * @memberof SendingManager
     */
    removeAllConnectionPort() {
        this._conPort.forEach(item => this.removeConnectionPort(item.port));
    }
    /**
     * 删除并关闭所有连接端口。
     *
     * @memberof SendingManager
     */
    removeAndCloseAllConnectionPort() {
        this._conPort.forEach(item => this.removeAndCloseConnectionPort(item.port));
    }
}
exports.SendingManager = SendingManager;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyxDQUFDLENBQUM7SUFDaEYsQ0FBQztDQUNKO0FBdEhELHdDQXNIQyIsImZpbGUiOiJTZW5kaW5nTWFuYWdlci5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNlbmRpbmdEYXRhIH0gZnJvbSAnLi9jb21tb24vU2VuZGluZ0RhdGEnO1xyXG5pbXBvcnQgeyBDb25uZWN0aW9uUG9ydCB9IGZyb20gJy4vY29tbW9uL0Nvbm5lY3Rpb25Qb3J0JztcclxuaW1wb3J0IHsgU2VuZGluZ01hbmFnZXJDb25maWcgfSBmcm9tICcuL2NvbW1vbi9TZW5kaW5nTWFuYWdlckNvbmZpZyc7XHJcbmltcG9ydCAqIGFzIEVtaXR0ZXIgZnJvbSAnY29tcG9uZW50LWVtaXR0ZXInO1xyXG5cclxuLyoqXHJcbiAqIOWPkemAgeeuoeeQhuWZqO+8jOi0n+i0o+err+WPo+eahOa3u+WKoOWIoOmZpO+8jOi0n+i9veWdh+ihoVxyXG4gKiBcclxuICogQGV4cG9ydFxyXG4gKiBAY2xhc3MgU2VuZGluZ01hbmFnZXJcclxuICovXHJcbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBTZW5kaW5nTWFuYWdlciBleHRlbmRzIEVtaXR0ZXIge1xyXG5cclxuICAgIF9jb25Qb3J0OiB7IHBvcnQ6IENvbm5lY3Rpb25Qb3J0LCBzZW5kaW5nOiBib29sZWFuIH1bXSA9IFtdOyAvL+azqOWGjOeahOi/nuaOpeerr+WPo+OAgnNlbmRpbmfooajnpLrlvZPliY3mjqXlj6PmmK/lkKbmraPlnKjlj5HpgIHmlbDmja5cclxuXHJcbiAgICBwcml2YXRlIF9wb3J0SW5kZXggPSAwOyAgICAvL+aMh+ekuuS9v+eUqOWTquS4querr+WPo+adpeWPkemAgea2iOaBr1xyXG5cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX2xvYWRCYWxhbmNlOiBib29sZWFuOyAvL+aYr+WQpuWQr+eUqOi0n+i9veWdh+ihoVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZzogU2VuZGluZ01hbmFnZXJDb25maWcpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuX2xvYWRCYWxhbmNlID0gY29uZmlnLmxvYWRCYWxhbmNlID09PSB1bmRlZmluZWQgPyB0cnVlIDogY29uZmlnLmxvYWRCYWxhbmNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5a2Q57G75aSN5YaZ77yM5pS25Yiw5raI5oGv55qE5Zue6LCDXHJcbiAgICAgKiBcclxuICAgICAqIEBwcm90ZWN0ZWRcclxuICAgICAqIEBhYnN0cmFjdFxyXG4gICAgICogQHBhcmFtIHtTZW5kaW5nRGF0YX0gZGF0YSDmlLbliLDnmoTmlbDmja5cclxuICAgICAqIEBtZW1iZXJvZiBTZW5kaW5nTWFuYWdlclxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0ZWQgYWJzdHJhY3QgX29uTWVzc2FnZShkYXRhOiBTZW5kaW5nRGF0YSk6IHZvaWQ7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjnu5HlrprnmoTnq6/lj6Plj5HpgIHmlbDmja5cclxuICAgICAqIEBwYXJhbSBkYXRhIOimgeiiq+WPkemAgeeahOaVsOaNriBcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIF9zZW5kRGF0YShkYXRhOiBTZW5kaW5nRGF0YSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb25Qb3J0Lmxlbmd0aCA9PT0gMClcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcign5rKh5pyJ5Y+v55So55qE56uv5Y+j5p2l5Y+R6YCB5raI5oGvJykpO1xyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBsZXQgc2VsZWN0ZWRQb3J0OiBhbnk7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5fY29uUG9ydC5sZW5ndGggPiAxICYmIHRoaXMuX2xvYWRCYWxhbmNlKSB7ICAgIC8v6LSf6L295Z2H6KGhXHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMCwgaiA9IHRoaXMuX2NvblBvcnQubGVuZ3RoIC0gMTsgaSA8IGo7IGkrKykgeyAgLy8gLTEg5piv5Li65LqG56Gu5L+d6LWw5a6M5LiA5ZyI77yM5Lmf5LiN5Lya6JC95Yiw5LiK5qyh5L2/55So55qE56uv5Y+j5LiKXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcG9ydCA9IHRoaXMuX2NvblBvcnRbKyt0aGlzLl9wb3J0SW5kZXggPCB0aGlzLl9jb25Qb3J0Lmxlbmd0aCA/IHRoaXMuX3BvcnRJbmRleCA6IHRoaXMuX3BvcnRJbmRleCA9IDBdO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghcG9ydC5zZW5kaW5nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUG9ydCA9IHBvcnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoc2VsZWN0ZWRQb3J0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZWxlY3RlZFBvcnQgPSB0aGlzLl9jb25Qb3J0W3RoaXMuX3BvcnRJbmRleF07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBzZWxlY3RlZFBvcnQgPSB0aGlzLl9jb25Qb3J0WzBdO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBzZWxlY3RlZFBvcnQuc2VuZGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybiBzZWxlY3RlZFBvcnQucG9ydC5zZW5kKGRhdGEpXHJcbiAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB7IHNlbGVjdGVkUG9ydC5zZW5kaW5nID0gZmFsc2UgfSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaCgoZXJyOiBFcnJvcikgPT4geyBzZWxlY3RlZFBvcnQuc2VuZGluZyA9IGZhbHNlOyB0aHJvdyBlcnI7IH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOa3u+WKoOi/nuaOpeerr+WPo+OAguWPr+S7pea3u+WKoOWkmuS4querr+WPo++8jOi/meagt+a1gemHj+WPr+S7peiHquWKqOWIhuaLheWIsOavj+S4querr+WPo+S4iuOAguWmguaenOafkOS4querr+WPo+iiq+WFs+mXre+8jOWImeWug+WwhuiHquWKqOiiq+enu+mZpOOAgiAgICAgXHJcbiAgICAgKiDms6jmhI/vvJrlj6rmnInlvZPnq6/lj6Pov57mjqXmiZPlvIDkuYvlkI7miY3kvJrop6blj5FhZGRDb25uZWN0aW9uUG9ydOS6i+S7tlxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0ge0Nvbm5lY3Rpb25Qb3J0fSBjb25uZWN0aW9uIOi/nuaOpeerr+WPo1xyXG4gICAgICogQG1lbWJlcm9mIFJlbW90ZUludm9rZVxyXG4gICAgICovXHJcbiAgICBhZGRDb25uZWN0aW9uUG9ydChjb25uZWN0aW9uOiBDb25uZWN0aW9uUG9ydCkge1xyXG4gICAgICAgIGlmICh0aGlzLl9jb25Qb3J0LmZpbmQoaXRlbSA9PiBpdGVtLnBvcnQgPT09IGNvbm5lY3Rpb24pKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+ebuOWQjOeahOerr+WPo+S4jeWPr+S7pemHjeWkjea3u+WKoCcpO1xyXG5cclxuICAgICAgICBjb25uZWN0aW9uLm9uT3BlbiA9ICgpID0+IHtcclxuICAgICAgICAgICAgY29ubmVjdGlvbi5vbk1lc3NhZ2UgPSB0aGlzLl9vbk1lc3NhZ2U7XHJcbiAgICAgICAgICAgIGNvbm5lY3Rpb24ub25DbG9zZSA9ICgpID0+IHRoaXMucmVtb3ZlQ29ubmVjdGlvblBvcnQoY29ubmVjdGlvbik7XHJcbiAgICAgICAgICAgIHRoaXMuX2NvblBvcnQucHVzaCh7IHBvcnQ6IGNvbm5lY3Rpb24sIHNlbmRpbmc6IGZhbHNlIH0pO1xyXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2FkZENvbm5lY3Rpb25Qb3J0JywgY29ubmVjdGlvbik7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIoOmZpOi/nuaOpeerr+WPo+OAguWIoOmZpOaIkOWKn+inpuWPkXJlbW92ZUNvbm5lY3Rpb25Qb3J05LqL5Lu2XHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSB7Q29ubmVjdGlvblBvcnR9IGNvbm5lY3Rpb24g6L+e5o6l56uv5Y+jXHJcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZUNvbm5lY3Rpb25Qb3J0KGNvbm5lY3Rpb246IENvbm5lY3Rpb25Qb3J0KSB7XHJcbiAgICAgICAgY29uc3QgYmVmb3JlID0gdGhpcy5fY29uUG9ydC5sZW5ndGg7XHJcbiAgICAgICAgdGhpcy5fY29uUG9ydCA9IHRoaXMuX2NvblBvcnQuZmlsdGVyKGl0ZW0gPT4gaXRlbS5wb3J0ICE9PSBjb25uZWN0aW9uKTtcclxuXHJcbiAgICAgICAgaWYgKGJlZm9yZSA+IHRoaXMuX2NvblBvcnQubGVuZ3RoKVxyXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ3JlbW92ZUNvbm5lY3Rpb25Qb3J0JywgY29ubmVjdGlvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTlubblhbPpl63ov57mjqXnq6/lj6PjgILliKDpmaTmiJDlip/op6blj5FyZW1vdmVDb25uZWN0aW9uUG9ydOS6i+S7tlxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0ge0Nvbm5lY3Rpb25Qb3J0fSBjb25uZWN0aW9uIOi/nuaOpeerr+WPo1xyXG4gICAgICogQG1lbWJlcm9mIFNlbmRpbmdNYW5hZ2VyXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZUFuZENsb3NlQ29ubmVjdGlvblBvcnQoY29ubmVjdGlvbjogQ29ubmVjdGlvblBvcnQpIHtcclxuICAgICAgICBjb25uZWN0aW9uLmNsb3NlKCk7XHJcbiAgICAgICAgdGhpcy5yZW1vdmVDb25uZWN0aW9uUG9ydChjb25uZWN0aW9uKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIoOmZpOaJgOaciei/nuaOpeerr+WPo+OAglxyXG4gICAgICogXHJcbiAgICAgKiBAbWVtYmVyb2YgU2VuZGluZ01hbmFnZXJcclxuICAgICAqL1xyXG4gICAgcmVtb3ZlQWxsQ29ubmVjdGlvblBvcnQoKSB7XHJcbiAgICAgICAgdGhpcy5fY29uUG9ydC5mb3JFYWNoKGl0ZW0gPT4gdGhpcy5yZW1vdmVDb25uZWN0aW9uUG9ydChpdGVtLnBvcnQpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIoOmZpOW5tuWFs+mXreaJgOaciei/nuaOpeerr+WPo+OAglxyXG4gICAgICogXHJcbiAgICAgKiBAbWVtYmVyb2YgU2VuZGluZ01hbmFnZXJcclxuICAgICAqL1xyXG4gICAgcmVtb3ZlQW5kQ2xvc2VBbGxDb25uZWN0aW9uUG9ydCgpIHtcclxuICAgICAgICB0aGlzLl9jb25Qb3J0LmZvckVhY2goaXRlbSA9PiB0aGlzLnJlbW92ZUFuZENsb3NlQ29ubmVjdGlvblBvcnQoaXRlbS5wb3J0KSk7XHJcbiAgICB9XHJcbn0iXX0=
