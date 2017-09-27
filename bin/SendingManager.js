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
        this._portIndex = 0; //指示使用哪个端口来发送消息
        this._conPort = []; //注册的连接端口。sending表示当前接口是否正在发送数据
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
     * 注意：只有当添加的端口连接打开之后才会触发addConnectionPort事件
     *
     * @param {ConnectionPort} connection 连接端口
     * @memberof RemoteInvoke
     */
    addConnectionPort(connection) {
        if (this._conPort.find(item => item.port === connection))
            throw new Error('相同的端口不可以重复添加');
        connection.onOpen = () => {
            connection.onMessage = this._onMessage.bind(this);
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
     * 删除并关闭连接端口。
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUE0QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7Q0FDSjtBQXRIRCx3Q0FzSEMiLCJmaWxlIjoiU2VuZGluZ01hbmFnZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTZW5kaW5nRGF0YSB9IGZyb20gJy4vY29tbW9uL1NlbmRpbmdEYXRhJztcclxuaW1wb3J0IHsgQ29ubmVjdGlvblBvcnQgfSBmcm9tICcuL2NvbW1vbi9Db25uZWN0aW9uUG9ydCc7XHJcbmltcG9ydCB7IFNlbmRpbmdNYW5hZ2VyQ29uZmlnIH0gZnJvbSAnLi9jb21tb24vU2VuZGluZ01hbmFnZXJDb25maWcnO1xyXG5pbXBvcnQgKiBhcyBFbWl0dGVyIGZyb20gJ2NvbXBvbmVudC1lbWl0dGVyJztcclxuXHJcbi8qKlxyXG4gKiDlj5HpgIHnrqHnkIblmajvvIzotJ/otKPnq6/lj6PnmoTmt7vliqDliKDpmaTvvIzotJ/ovb3lnYfooaFcclxuICogXHJcbiAqIEBleHBvcnRcclxuICogQGNsYXNzIFNlbmRpbmdNYW5hZ2VyXHJcbiAqL1xyXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU2VuZGluZ01hbmFnZXIgZXh0ZW5kcyBFbWl0dGVyIHtcclxuXHJcbiAgICBwcml2YXRlIF9wb3J0SW5kZXggPSAwOyAgICAvL+aMh+ekuuS9v+eUqOWTquS4querr+WPo+adpeWPkemAgea2iOaBr1xyXG5cclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX2xvYWRCYWxhbmNlOiBib29sZWFuOyAvL+aYr+WQpuWQr+eUqOi0n+i9veWdh+ihoVxyXG5cclxuICAgIF9jb25Qb3J0OiB7IHBvcnQ6IENvbm5lY3Rpb25Qb3J0LCBzZW5kaW5nOiBib29sZWFuIH1bXSA9IFtdOyAvL+azqOWGjOeahOi/nuaOpeerr+WPo+OAgnNlbmRpbmfooajnpLrlvZPliY3mjqXlj6PmmK/lkKbmraPlnKjlj5HpgIHmlbDmja5cclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihjb25maWc6IFNlbmRpbmdNYW5hZ2VyQ29uZmlnKSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLl9sb2FkQmFsYW5jZSA9IGNvbmZpZy5sb2FkQmFsYW5jZSA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IGNvbmZpZy5sb2FkQmFsYW5jZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWtkOexu+WkjeWGme+8jOaUtuWIsOa2iOaBr+eahOWbnuiwg1xyXG4gICAgICogXHJcbiAgICAgKiBAcHJvdGVjdGVkXHJcbiAgICAgKiBAYWJzdHJhY3RcclxuICAgICAqIEBwYXJhbSB7U2VuZGluZ0RhdGF9IGRhdGEg5pS25Yiw55qE5pWw5o2uXHJcbiAgICAgKiBAbWVtYmVyb2YgU2VuZGluZ01hbmFnZXJcclxuICAgICAqL1xyXG4gICAgcHJvdGVjdGVkIGFic3RyYWN0IF9vbk1lc3NhZ2UoZGF0YTogU2VuZGluZ0RhdGEpOiB2b2lkO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6LCD55So57uR5a6a55qE56uv5Y+j5Y+R6YCB5pWw5o2uXHJcbiAgICAgKiBAcGFyYW0gZGF0YSDopoHooqvlj5HpgIHnmoTmlbDmja4gXHJcbiAgICAgKi9cclxuICAgIHByb3RlY3RlZCBfc2VuZERhdGEoZGF0YTogU2VuZGluZ0RhdGEpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBpZiAodGhpcy5fY29uUG9ydC5sZW5ndGggPT09IDApXHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ+ayoeacieWPr+eUqOeahOerr+WPo+adpeWPkemAgea2iOaBrycpKTtcclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgbGV0IHNlbGVjdGVkUG9ydDogYW55O1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuX2NvblBvcnQubGVuZ3RoID4gMSAmJiB0aGlzLl9sb2FkQmFsYW5jZSkgeyAgICAvL+i0n+i9veWdh+ihoVxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDAsIGogPSB0aGlzLl9jb25Qb3J0Lmxlbmd0aCAtIDE7IGkgPCBqOyBpKyspIHsgIC8vIC0xIOaYr+S4uuS6huehruS/nei1sOWujOS4gOWciO+8jOS5n+S4jeS8muiQveWIsOS4iuasoeS9v+eUqOeahOerr+WPo+S4ilxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBvcnQgPSB0aGlzLl9jb25Qb3J0WysrdGhpcy5fcG9ydEluZGV4IDwgdGhpcy5fY29uUG9ydC5sZW5ndGggPyB0aGlzLl9wb3J0SW5kZXggOiB0aGlzLl9wb3J0SW5kZXggPSAwXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXBvcnQuc2VuZGluZykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RlZFBvcnQgPSBwb3J0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHNlbGVjdGVkUG9ydCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRQb3J0ID0gdGhpcy5fY29uUG9ydFt0aGlzLl9wb3J0SW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWRQb3J0ID0gdGhpcy5fY29uUG9ydFswXTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgc2VsZWN0ZWRQb3J0LnNlbmRpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gc2VsZWN0ZWRQb3J0LnBvcnQuc2VuZChkYXRhKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4oKCkgPT4geyBzZWxlY3RlZFBvcnQuc2VuZGluZyA9IGZhbHNlIH0pXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goKGVycjogRXJyb3IpID0+IHsgc2VsZWN0ZWRQb3J0LnNlbmRpbmcgPSBmYWxzZTsgdGhyb3cgZXJyOyB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmt7vliqDov57mjqXnq6/lj6PjgILlj6/ku6Xmt7vliqDlpJrkuKrnq6/lj6PvvIzov5nmoLfmtYHph4/lj6/ku6Xoh6rliqjliIbmi4XliLDmr4/kuKrnq6/lj6PkuIrjgILlpoLmnpzmn5DkuKrnq6/lj6PooqvlhbPpl63vvIzliJnlroPlsIboh6rliqjooqvnp7vpmaTjgIIgICAgIFxyXG4gICAgICog5rOo5oSP77ya5Y+q5pyJ5b2T5re75Yqg55qE56uv5Y+j6L+e5o6l5omT5byA5LmL5ZCO5omN5Lya6Kem5Y+RYWRkQ29ubmVjdGlvblBvcnTkuovku7ZcclxuICAgICAqIFxyXG4gICAgICogQHBhcmFtIHtDb25uZWN0aW9uUG9ydH0gY29ubmVjdGlvbiDov57mjqXnq6/lj6NcclxuICAgICAqIEBtZW1iZXJvZiBSZW1vdGVJbnZva2VcclxuICAgICAqL1xyXG4gICAgYWRkQ29ubmVjdGlvblBvcnQoY29ubmVjdGlvbjogQ29ubmVjdGlvblBvcnQpIHtcclxuICAgICAgICBpZiAodGhpcy5fY29uUG9ydC5maW5kKGl0ZW0gPT4gaXRlbS5wb3J0ID09PSBjb25uZWN0aW9uKSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfnm7jlkIznmoTnq6/lj6PkuI3lj6/ku6Xph43lpI3mt7vliqAnKTtcclxuXHJcbiAgICAgICAgY29ubmVjdGlvbi5vbk9wZW4gPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbm5lY3Rpb24ub25NZXNzYWdlID0gdGhpcy5fb25NZXNzYWdlLmJpbmQodGhpcyk7XHJcbiAgICAgICAgICAgIGNvbm5lY3Rpb24ub25DbG9zZSA9ICgpID0+IHRoaXMucmVtb3ZlQ29ubmVjdGlvblBvcnQoY29ubmVjdGlvbik7XHJcbiAgICAgICAgICAgIHRoaXMuX2NvblBvcnQucHVzaCh7IHBvcnQ6IGNvbm5lY3Rpb24sIHNlbmRpbmc6IGZhbHNlIH0pO1xyXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2FkZENvbm5lY3Rpb25Qb3J0JywgY29ubmVjdGlvbik7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIoOmZpOi/nuaOpeerr+WPo+OAguWIoOmZpOaIkOWKn+inpuWPkXJlbW92ZUNvbm5lY3Rpb25Qb3J05LqL5Lu2XHJcbiAgICAgKiBcclxuICAgICAqIEBwYXJhbSB7Q29ubmVjdGlvblBvcnR9IGNvbm5lY3Rpb24g6L+e5o6l56uv5Y+jXHJcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gXHJcbiAgICAgKiBAbWVtYmVyb2YgUmVtb3RlSW52b2tlXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZUNvbm5lY3Rpb25Qb3J0KGNvbm5lY3Rpb246IENvbm5lY3Rpb25Qb3J0KSB7XHJcbiAgICAgICAgY29uc3QgYmVmb3JlID0gdGhpcy5fY29uUG9ydC5sZW5ndGg7XHJcbiAgICAgICAgdGhpcy5fY29uUG9ydCA9IHRoaXMuX2NvblBvcnQuZmlsdGVyKGl0ZW0gPT4gaXRlbS5wb3J0ICE9PSBjb25uZWN0aW9uKTtcclxuXHJcbiAgICAgICAgaWYgKGJlZm9yZSA+IHRoaXMuX2NvblBvcnQubGVuZ3RoKVxyXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ3JlbW92ZUNvbm5lY3Rpb25Qb3J0JywgY29ubmVjdGlvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTlubblhbPpl63ov57mjqXnq6/lj6PjgIJcclxuICAgICAqIFxyXG4gICAgICogQHBhcmFtIHtDb25uZWN0aW9uUG9ydH0gY29ubmVjdGlvbiDov57mjqXnq6/lj6NcclxuICAgICAqIEBtZW1iZXJvZiBTZW5kaW5nTWFuYWdlclxyXG4gICAgICovXHJcbiAgICByZW1vdmVBbmRDbG9zZUNvbm5lY3Rpb25Qb3J0KGNvbm5lY3Rpb246IENvbm5lY3Rpb25Qb3J0KSB7XHJcbiAgICAgICAgY29ubmVjdGlvbi5jbG9zZSgpO1xyXG4gICAgICAgIHRoaXMucmVtb3ZlQ29ubmVjdGlvblBvcnQoY29ubmVjdGlvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTmiYDmnInov57mjqXnq6/lj6PjgIJcclxuICAgICAqIFxyXG4gICAgICogQG1lbWJlcm9mIFNlbmRpbmdNYW5hZ2VyXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZUFsbENvbm5lY3Rpb25Qb3J0KCkge1xyXG4gICAgICAgIHRoaXMuX2NvblBvcnQuZm9yRWFjaChpdGVtID0+IHRoaXMucmVtb3ZlQ29ubmVjdGlvblBvcnQoaXRlbS5wb3J0KSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTlubblhbPpl63miYDmnInov57mjqXnq6/lj6PjgIJcclxuICAgICAqIFxyXG4gICAgICogQG1lbWJlcm9mIFNlbmRpbmdNYW5hZ2VyXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZUFuZENsb3NlQWxsQ29ubmVjdGlvblBvcnQoKSB7XHJcbiAgICAgICAgdGhpcy5fY29uUG9ydC5mb3JFYWNoKGl0ZW0gPT4gdGhpcy5yZW1vdmVBbmRDbG9zZUNvbm5lY3Rpb25Qb3J0KGl0ZW0ucG9ydCkpO1xyXG4gICAgfVxyXG59Il19
