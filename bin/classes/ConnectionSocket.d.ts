/// <reference types="node" />
import { RemoteInvoke } from './RemoteInvoke';
/**
 * 消息传输端口的父类。
 */
export declare class ConnectionSocket {
    protected readonly ri: RemoteInvoke;
    /**
     * ConnectionSocket收到消息后需要执行的回调函数
     */
    protected readonly onMessage: (header: string, body: Buffer) => void;
    /**
     * 网络连接打开后需要执行的回调
     */
    protected readonly onOpen: () => void;
    /**
     * 网络连接断开后需要执行的回调
     */
    protected readonly onClose: () => void;
    /**
     * 发送消息
     * @param header 消息头部部分
     * @param body 消息body部分
     */
    send(header: string, body: Buffer): Promise<void>;
    /**
     * 获取当前连接的状态，true：连接正常, false：连接断开
     */
    readonly connected: boolean;
    constructor(ri: RemoteInvoke, 
        /**
         * ConnectionSocket收到消息后需要执行的回调函数
         */
        onMessage: (header: string, body: Buffer) => void, 
        /**
         * 网络连接打开后需要执行的回调
         */
        onOpen: () => void, 
        /**
         * 网络连接断开后需要执行的回调
         */
        onClose: () => void);
}
