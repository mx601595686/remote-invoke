"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 消息传输端口的父类。
 */
class ConnectionSocket {
    constructor(ri, 
        /**
         * ConnectionSocket收到消息后需要执行的回调函数
         */
        onMessage, 
        /**
         * 网络连接打开后需要执行的回调
         */
        onOpen, 
        /**
         * 网络连接断开后需要执行的回调
         */
        onClose) {
        this.ri = ri;
        this.onMessage = onMessage;
        this.onOpen = onOpen;
        this.onClose = onClose;
    }
    /**
     * 发送消息
     * @param header 消息头部部分
     * @param body 消息body部分
     */
    send(header, body) {
        throw new Error('未实现send');
        /**
         * 如果socket支持取消发送，推荐设置一个定时器，超时后就取消发送，例如：
         * setTimeout(() => { 取消发送() }, this.ri.timeout);
         */
    }
    /**
     * 获取当前连接的状态，true：连接正常, false：连接断开
     */
    get connected() {
        throw new Error('未实现connected');
    }
}
exports.ConnectionSocket = ConnectionSocket;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsYXNzZXMvQ29ubmVjdGlvblNvY2tldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBOztHQUVHO0FBQ0g7SUF1QkksWUFDdUIsRUFBZ0I7UUFFbkM7O1dBRUc7UUFDZ0IsU0FBaUQ7UUFFcEU7O1dBRUc7UUFDZ0IsTUFBa0I7UUFFckM7O1dBRUc7UUFDZ0IsT0FBbUI7UUFmbkIsT0FBRSxHQUFGLEVBQUUsQ0FBYztRQUtoQixjQUFTLEdBQVQsU0FBUyxDQUF3QztRQUtqRCxXQUFNLEdBQU4sTUFBTSxDQUFZO1FBS2xCLFlBQU8sR0FBUCxPQUFPLENBQVk7SUFDdEMsQ0FBQztJQXRDTDs7OztPQUlHO0lBQ0gsSUFBSSxDQUFDLE1BQWMsRUFBRSxJQUFZO1FBQzdCLE1BQU0sSUFBSSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFM0I7OztXQUdHO0lBQ1AsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBSSxTQUFTO1FBQ1QsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUNwQyxDQUFDO0NBb0JKO0FBekNELDRDQXlDQyIsImZpbGUiOiJjbGFzc2VzL0Nvbm5lY3Rpb25Tb2NrZXQuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSZW1vdGVJbnZva2UgfSBmcm9tICcuL1JlbW90ZUludm9rZSc7XHJcblxyXG4vKipcclxuICog5raI5oGv5Lyg6L6T56uv5Y+j55qE54i257G744CCXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQ29ubmVjdGlvblNvY2tldCB7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlj5HpgIHmtojmga9cclxuICAgICAqIEBwYXJhbSBoZWFkZXIg5raI5oGv5aS06YOo6YOo5YiGXHJcbiAgICAgKiBAcGFyYW0gYm9keSDmtojmga9ib2R56YOo5YiGXHJcbiAgICAgKi9cclxuICAgIHNlbmQoaGVhZGVyOiBzdHJpbmcsIGJvZHk6IEJ1ZmZlcik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcign5pyq5a6e546wc2VuZCcpO1xyXG5cclxuICAgICAgICAvKipcclxuICAgICAgICAgKiDlpoLmnpxzb2NrZXTmlK/mjIHlj5bmtojlj5HpgIHvvIzmjqjojZDorr7nva7kuIDkuKrlrprml7blmajvvIzotoXml7blkI7lsLHlj5bmtojlj5HpgIHvvIzkvovlpoLvvJpcclxuICAgICAgICAgKiBzZXRUaW1lb3V0KCgpID0+IHsg5Y+W5raI5Y+R6YCBKCkgfSwgdGhpcy5yaS50aW1lb3V0KTtcclxuICAgICAgICAgKi9cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOiOt+WPluW9k+WJjei/nuaOpeeahOeKtuaAge+8jHRydWXvvJrov57mjqXmraPluLgsIGZhbHNl77ya6L+e5o6l5pat5byAXHJcbiAgICAgKi9cclxuICAgIGdldCBjb25uZWN0ZWQoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfmnKrlrp7njrBjb25uZWN0ZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgcmk6IFJlbW90ZUludm9rZSxcclxuXHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgICogQ29ubmVjdGlvblNvY2tldOaUtuWIsOa2iOaBr+WQjumcgOimgeaJp+ihjOeahOWbnuiwg+WHveaVsFxyXG4gICAgICAgICAqL1xyXG4gICAgICAgIHByb3RlY3RlZCByZWFkb25seSBvbk1lc3NhZ2U6IChoZWFkZXI6IHN0cmluZywgYm9keTogQnVmZmVyKSA9PiB2b2lkLFxyXG5cclxuICAgICAgICAvKipcclxuICAgICAgICAgKiDnvZHnu5zov57mjqXmiZPlvIDlkI7pnIDopoHmiafooYznmoTlm57osINcclxuICAgICAgICAgKi9cclxuICAgICAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgb25PcGVuOiAoKSA9PiB2b2lkLFxyXG5cclxuICAgICAgICAvKipcclxuICAgICAgICAgKiDnvZHnu5zov57mjqXmlq3lvIDlkI7pnIDopoHmiafooYznmoTlm57osINcclxuICAgICAgICAgKi9cclxuICAgICAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgb25DbG9zZTogKCkgPT4gdm9pZFxyXG4gICAgKSB7IH1cclxufSJdfQ==
