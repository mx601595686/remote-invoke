/**
 * 消息的类型
 * 
 * @export
 * @enum {number}
 */
export enum MessageType {
    /**
     * 调用远端方法
     */
    invoke,

    /**
     * 被调用者处理完请求，将结果返回给调用端
     */
    replyInvoke,

    /**
     * 对外发出广播
     */
    broadcast
}