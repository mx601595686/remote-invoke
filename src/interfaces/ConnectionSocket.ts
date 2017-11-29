/**
 * 消息传输端口。
 * 端口的启动、关闭、断开重连、登陆等都需自行处理，remote-invoke不负责这些问题。
 */
export interface ConnectionSocket {

    /**
     * 发送消息
     * @param header 消息头部部分
     * @param body 消息body部分
     */
    send(header: string, body: Buffer): Promise<void>;

    /**
     * 这个回调方法由remote-invoke来进行注册。当收到消息后需要触发该方法
     */
    onMessage?: (header: string, body: Buffer) => void;
}