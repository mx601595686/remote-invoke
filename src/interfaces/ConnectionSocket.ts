import { RemoteInvoke } from '../classes/RemoteInvoke';

/**
 * 消息传输端口。
 */
export interface ConnectionSocket {

    /**
     * 由remote-invoke赋值
     */
    ri: RemoteInvoke;

    /**
     * 由remote-invoke注册的接收消息回调函数
     */
    onMessage: (header: string, body: Buffer) => void;

    /**
     * 由remote-invoke注册的网络连接打开回调
     */
    onOpen: () => void;

    /**
     * 由remote-invoke注册的网络连接断开回调。    
     */
    onClose: () => void;

    /**
     * 获取当前连接的状态，true：连接正常, false：连接断开
     */
    readonly connected: boolean;

    /**
     * 发送消息
     * @param header 消息头部部分
     * @param body 消息body部分
     */
    send(header: string, body: Buffer): Promise<void>;
    /**
     * 如果socket支持取消发送，推荐设置一个定时器，超时后就取消发送，例如：
     * setTimeout(() => { 取消发送() }, RemoteInvoke.timeout);
     */
}