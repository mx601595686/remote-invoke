import { RemoteInvoke } from './RemoteInvoke';

/**
 * 消息传输端口的父类。
 */
export class ConnectionSocket {

    /**
     * 发送消息
     * @param header 消息头部部分
     * @param body 消息body部分
     */
    send(header: string, body: Buffer): Promise<void> {
        throw new Error('未实现send');

        /**
         * 如果socket支持取消发送，推荐设置一个定时器，超时后就取消发送，例如：
         * setTimeout(() => { 取消发送() }, this.ri.timeout);
         */
    }

    /**
     * 获取当前连接的状态，true：连接正常, false：连接断开
     */
    get connected(): boolean {
        throw new Error('未实现connected');
    }

    constructor(
        protected readonly ri: RemoteInvoke,

        /**
         * ConnectionSocket收到消息后需要执行的回调函数
         */
        protected readonly onMessage: (header: string, body: Buffer) => void,

        /**
         * 网络连接打开后需要执行的回调
         */
        protected readonly onOpen: () => void,

        /**
         * 网络连接断开后需要执行的回调
         */
        protected readonly onClose: () => void
    ) { }
}