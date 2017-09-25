import { MessageType } from "./MessageType";
/**
 * 将被发送出去的数据
 *
 * @export
 * @interface SendingData
 */
export interface SendingData {
    /**
     * 发送者的名称
     *
     * @type {string}
     * @memberof SendingData
     */
    sender: string;
    /**
     * 接受者的名称。如果是广播则为空
     *
     * @type {string}
     * @memberof SendingData
     */
    receiver?: string;
    /**
     * 这次调用消息所对应的编号
     *
     * @type {number}
     * @memberof SendingData
     */
    messageID: number;
    /**
     * 要调用的远端方法的名称，或广播名称
     *
     * @type {string}
     * @memberof SendingData
     */
    messageName?: string;
    /**
     * 消息的类型
     *
     * @type {MessageType}
     * @memberof SendingData
     */
    type: MessageType;
    /**
     * 消息产生时的时间戳
     *
     * @type {number}
     * @memberof SendingData
     */
    sendTime: number;
    /**
     * 这条消息的过期时间，为0则表示永不过期。
     * 如果是调用，则过期时间对应的则是从发出到返回的整段时间。
     *
     * @type {number}
     * @memberof SendingData
     */
    expire: number;
    /**
     * 要发送的数据
     *
     * @type {any[]}
     * @memberof SendingData
     */
    data: any[];
    /**
     * 这个主要是用于被调用者用于向向调用者反馈执行异常
     *
     * @type {{ message: string, stack?: string }}  属性名称对应与Error
     * @memberof SendingData
     */
    error?: {
        message: string;
        stack?: string;
    };
}
