import { RemoteInvoke } from './../classes/RemoteInvoke';

/**
 * 消息传输端口的父类。
 * 端口的启动、关闭、断开重连、登陆等都需自行处理，remote-invoke不负责这些问题。
 */
export class ConnectionSocket {

    /**
     * 发送消息
     * @param header 消息头部部分
     * @param body 消息body部分
     */
    send(header: string, body: Buffer): Promise<void> {
        return Promise.reject('网络连接断开');
    }

    constructor(
        protected ri: RemoteInvoke,

        /**
         * ConnectionSocket收到消息后需要执行的回调函数
         */
        protected onMessage: (header: string, body: Buffer) => void
    ) { }
}