/**
 * 系统内部消息类型
 */
export enum InternalMessageType {
    /**
     * 当网络连接打开
     */
    onConnectionOpen,

    /**
     * 当网络连接断开
     */
    onConnectionClose,
}