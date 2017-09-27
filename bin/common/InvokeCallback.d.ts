/**
 * 远程调用的回调
 *
 * @export
 * @interface InvokeCallback
 */
export interface InvokeCallback {
    /**
     * 对应的消息编号
     *
     * @type {number}
     * @memberof InvokeCallback
     */
    messageID: number;
    /**
     * 接收端的名称
     *
     * @type {string}
     * @memberof InvokeCallback
     */
    targetName: string;
    /**
     * 失败的回调
     *
     * @memberof InvokeCallback
     */
    reject: (err: Error) => void;
    /**
     * 成功的回调
     *
     * @memberof InvokeCallback
     */
    resolve: (data: any) => void;
}
