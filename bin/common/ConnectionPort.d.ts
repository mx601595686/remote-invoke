import { SendingData } from './SendingData';
/**
 * 连接端口。
 *
 * @export
 * @interface ConnectionPort
 */
export interface ConnectionPort {
    /**
     * 发送消息
     *
     * @param {SendingData} data 要被发送的数据
     * @memberof ConnectionPort
     */
    send(data: SendingData): Promise<void>;
    /**
     * 关闭端口
     *
     * @memberof ConnectionPort
     */
    close(): void;
    /**
     * 这个回调方法由RemoteInvoke来进行注册。当收到消息后需要触发该方法
     *
     * @memberof ConnectionPort
     */
    onMessage?: (data: SendingData) => void;
    /**
     * 这个回调方法由RemoteInvoke来进行注册。当接口关闭时需要触发该方法。
     *
     * @memberof ConnectionPort
     */
    onClose?: () => void;
    /**
     * 这个回调方法由RemoteInvoke来进行注册。当接口打开后需要触发该方法。
     *
     * @memberof ConnectionPort
     */
    onOpen?: () => void;
}
