/**
 * 传输消息的类型
 */
export declare enum MessageType {
    /**
     * 调用远端公开的方法。
     */
    invoke = 0,
    /**
     * 被调用者处理完请求，将结果返回给调用者
     */
    invokeCallback = 1,
    /**
     * 对外发出广播
     */
    broadcast = 2,
    /**
     * 请求对方打开某一频段的广播
     */
    requestBroadCast = 3,
    /**
     * 当打开某一广播频段后回应请求者
     */
    requestBroadCastCallback = 4,
    /**
     * 请求对方关闭某一频段的广播
     */
    cancelBroadCast = 5,
    /**
     * 当关闭某一广播频段后回应请求者
     */
    cancelBroadCastCallback = 6,
    /**
     * 请求对方发送文件片段
     */
    requestFilePiece = 7,
    /**
     * 响应发送文件片段请求
     */
    requestFilePieceCallback = 8,
}
