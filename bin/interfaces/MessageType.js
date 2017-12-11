"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 传输消息的类型，也可以把它理解为状态码
 */
var MessageType;
(function (MessageType) {
    /**
     * 全局：
     * 1.所有消息发送后，头部都会被打包成一个JSON数组，其顺序确保总是第一项是type，第二项是sender，第三项是receiver，第四项是path。
     * 2.path的最大长度为256个Unicode字符
     */
    /**
     * invoke：
     * 1.invoke对path的格式没有要求，但推荐使用`/`来划分层级，最后一个为方法名，前面的称为命名空间，这样做是为了便于权限控制。
     *   例如"namespace/functionName"
     * 2.一个path上只允许导出一个方法。如果重复导出则后面的应该覆盖掉前面的。
     */
    /**
     * 调用者向被调用者发出调用请求
     *
     * 头部格式：
     * [
     *      type = invoke_request   //消息类型
     *      sender:string           //调用者
     *      receiver:string         //被调用者
     *      path:string             //调用方法所在的路径
     * ]
     * body格式：
     * [
     *      requestMessageID:number     //请求消息编号
     *      data:any                    //要发送的数据，这个在发送前会被序列化成JSON
     *      files: [                    //消息附带的文件
     *          id:number               //文件编号
     *          size:number|null        //文件大小(byte)。如果文件大小不确定则为null
     *          splitNumber:number|null //文件被分割成了多少块(范围是0 <= X < end)。如果文件大小不确定则为null
     *          name:string             //文件名
     *      ][]
     * ]
     *
     * 当把invoke_request发送出去之后(不管消息现在是在缓冲队列中还是真的已经发出去了)，调用者就开始倒计时，时长为3分钟，超过3分钟就判定请求超时。
     * 如果中途收到了被调用者传回的invoke_file_request请求，那么就重置倒计时，这一过程直到收到被调用者传回的invoke_response或invoke_failed为止。
     *
     * 注意：如果调用者调用的方法不存在，被调用者要向调用者报错
     */
    MessageType[MessageType["invoke_request"] = 0] = "invoke_request";
    /**
     * 被调用者成功处理完请求，将结果返回给调用者
     *
     * 头部格式：
     * [
     *      type = invoke_response  //消息类型
     *      sender:string           //被调用者
     *      receiver:string         //调用者
     * ]
     * body格式：
     * [
     *      requestMessageID:number     //请求消息编号
     *      responseMessageID:number    //响应消息编号
     *      data:any                    //要反馈的数据，这个在发送前会被序列化成JSON
     *      files:[id:number, size:number|null, splitNumber:number|null, name:string][]    //反馈消息附带的文件
     * ]
     *
     * 如果返回的结果中包含文件，那么当把invoke_response发送出去之后(不管消息现在是在缓冲队列中还是真的已经发出去了)，被调用者就开始倒计时，时长为3分钟，超过3分钟就直接结束响应，清理资源。
     * 如果中途收到了调用者传回的invoke_file_request请求，那么就重置倒计时。这一过程直到收到调用者传回的invoke_finish为止。
     */
    MessageType[MessageType["invoke_response"] = 1] = "invoke_response";
    /**
     * 调用者接收完被调用者传回的文件之后，通知被调用者此次调用请求彻底结束。
     * 如果被调用者在invoke_response中没有返回文件则不需要返回该消息。
     *
     * 头部格式：
     * [
     *      type = invoke_finish    //消息类型
     *      sender:string           //调用者
     *      receiver:string         //被调用者
     * ]
     * body格式：
     * [
     *      responseMessageID:number    //响应消息编号
     * ]
     *
     * 注意：被调用者收到这条消息后就立即清理资源，不再响应关于这条消息的任何请求。
     */
    MessageType[MessageType["invoke_finish"] = 2] = "invoke_finish";
    /**
     * 被调用者在处理请求的过程中出现了错误,告知调用者错误的原因。
     *
     * 头部格式：
     * [
     *      type = invoke_failed    //消息类型
     *      sender:string           //被调用者
     *      receiver:string         //调用者
     * ]
     * body格式：
     * [
     *      requestMessageID:number     //调用者所设置的消息编号
     *      error:string                //要反馈的失败原因
     * ]
     *
     * 注意：当把消息发出去之后被调用者就立即清理资源，不再响应关于这条消息的任何请求。
     */
    MessageType[MessageType["invoke_failed"] = 3] = "invoke_failed";
    /**
     * 获取invoke_request或invoke_response过程中所包含的文件片段
     *
     * 头部格式：
     * [
     *      type = invoke_file_request  //消息类型
     *      sender:string               //发送者
     *      receiver:string             //接收者
     * ]
     * body格式：
     * [
     *      messageID:number    //消息编号（请求时是requestMessageID，响应时是responseMessageID）
     *      id:number           //文件编号
     *      index:number        //文件片段索引。注意：之前请求过的片段不允许重复请求，请求的索引编号应当一次比一次大，否则会被当成传输错误。
     * ]
     *
     * 当把invoke_file_request发送出去之后(不管消息现在是在缓冲队列中还是真的已经发出去了)，发送者就开始倒计时，时长为3分钟，超过3分钟就判定请求超时。
     * 这一过程直到收到接收者传回的invoke_file_response或invoke_file_failed或invoke_file_finish为止。
     *
     * 注意：文件的接收者应当验证
     * 1.文件在传输过程中，顺序(index)是否发生错乱
     * 2.下载到的真实文件大小应当等于发送者所描述的大小
     */
    MessageType[MessageType["invoke_file_request"] = 4] = "invoke_file_request";
    /**
     * 响应invoke_file_request请求
     *
     * 头部格式：
     * [
     *      type = invoke_file_response //消息类型
     *      sender:string               //发送者
     *      receiver:string             //接收者
     * ]
     * body格式：
     * [
     *      messageID:number    //invoke_file_request的消息编号
     *      id:number           //文件编号
     *      index:number        //文件片段索引编号
     *      data:Buffer         //文件片段内容（默认的一个文件片段的大小是512kb）
     * ]
     *
     * 注意：文件的发送者应当确保不允许接收者重复下载某一文件片段。
     */
    MessageType[MessageType["invoke_file_response"] = 5] = "invoke_file_response";
    /**
     * 通知请求者,获取文件片段失败
     *
     * 头部格式：
     * [
     *      type = invoke_file_failed   //消息类型
     *      sender:string               //发送者
     *      receiver:string             //接收者
     * ]
     * body格式：
     * [
     *      messageID:number    //invoke_file_request的消息编号
     *      id:number           //文件编号
     *      error:string        //要反馈的失败原因
     * ]
     *
     * 注意：报错只发送一次，并且发送之后就立即清理相关资源，不允许再请求该文件了
     */
    MessageType[MessageType["invoke_file_failed"] = 6] = "invoke_file_failed";
    /**
     * 通知请求者,所请求的文件片段index已经超出了范围（表示文件传输完成）。主要是针对于发送不确定大小文件而准备的。
    *
     * 头部格式：
     * [
     *      type = invoke_file_finish   //消息类型
     *      sender:string               //发送者
     *      receiver:string             //接收者
     * ]
     * body格式：
     * [
     *      messageID:number    //invoke_file_request的消息编号
     *      id:number           //文件编号
     * ]
     *
     * 注意：通知只发送一次，并且发送之后就立即清理相关资源，不允许再请求该文件了
     */
    MessageType[MessageType["invoke_file_finish"] = 7] = "invoke_file_finish";
    /**
     * broadcast：
     * 1.broadcast对path的格式有特殊要求，path通过"."来划分层级，注册在上级的监听器可以收到所有发给其下级的广播。
     *   例如"namespace.a.b", 注册在"namespace.a"上的监听器不仅可以收到path为"namespace.a"的广播，还可以收到path为"namespace.a.b"的广播。
     *   同理，注册在"namespace"上的监听器可以收到"namespace"、"namespace.a"、"namespace.a.b"。
     */
    /**
     * 发送者对外发出广播
     *
     * 头部格式：
     * [
     *      type = broadcast    //消息类型
     *      sender:string       //广播的发送者
     *      path:string         //广播的路径
     * ]
     * body格式：
     * [
     *      data:any            //要发送的数据，这个在发送前会被序列化成JSON
     * ]
     */
    MessageType[MessageType["broadcast"] = 8] = "broadcast";
    /**
     * 告知websocket的另一端，现在某一路径上的广播有人在监听了
     *
     * 头部格式：
     * [
     *      type = broadcast_open    //消息类型
     * ]
     * body格式：
     * [
     *      messageID:number         //消息编号
     *      broadcastSender:string   //广播的发送者
     *      path:string              //广播的路径
     * ]
     *
     * 在下面两种情况下才需要发送该消息
     * 1. 用户在新的路径上注册了广播
     * 2. 当网络连接断开，重新连接之后，需要将之前注册过的广播路径再重新通知对方一遍。
     *
     * 注意：如果对方在3分钟之内没有回应则重新再发一次，直到收到对方回应或网络断开为止。
     */
    MessageType[MessageType["broadcast_open"] = 9] = "broadcast_open";
    /**
     * 告知websocket的另一端，之前的broadcast_open已经被正确处理了
     *
     * 头部格式：
     * [
     *      type = broadcast_open_finish    //消息类型
     * ]
     * body格式：
     * [
     *      messageID:number    //broadcast_open所设置的消息编号
     * ]
     *
     * 注意：当网络连接断开后，双方都应直接清理掉对方之前注册过的广播路径。
     */
    MessageType[MessageType["broadcast_open_finish"] = 10] = "broadcast_open_finish";
    /**
     * 告知websocket的另一端，现在某一路径上的广播已经没有人监听了
     *
     * 头部格式：
     * [
     *      type = broadcast_close    //消息类型
     * ]
     * body格式：
     * [
     *      messageID:number          //消息编号
     *      broadcastSender:string    //广播的发送者
     *      path:string               //广播的路径
     * ]
     *
     * 在下面两种情况下才需要发送该消息
     * 1. 用户在某条路径上已经没有注册的有广播监听器了
     * 2. 当用户收到了自己没有注册过的广播的时候通知对方。
     *
     * 注意：如果对方在3分钟之内没有回应则重新再发一次，直到收到对方回应或网络断开为止。
     */
    MessageType[MessageType["broadcast_close"] = 11] = "broadcast_close";
    /**
     * 告知websocket的另一端，之前的broadcast_close已经被正确处理了
     *
     * 头部格式：
     * [
     *      type = broadcast_close_finish    //消息类型
     * ]
     * body格式：
     * [
     *      messageID:number    //broadcast_close所设置的消息编号
     * ]
     */
    MessageType[MessageType["broadcast_close_finish"] = 12] = "broadcast_close_finish";
    /* -----------------------------------下面是一些在程序内部使用的消息，不在网络上进行传输------------------------------------ */
    /**
     * ConnectionSocket连接打开
     */
    MessageType[MessageType["_onOpen"] = 13] = "_onOpen";
    /**
     * ConnectionSocket连接断开
     */
    MessageType[MessageType["_onClose"] = 14] = "_onClose";
    /**
     * 划出一块事件空间,记录对方正在对哪些路径的广播展开监听
     */
    MessageType[MessageType["_broadcast_white_list"] = 15] = "_broadcast_white_list";
})(MessageType = exports.MessageType || (exports.MessageType = {}));

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImludGVyZmFjZXMvTWVzc2FnZVR5cGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7R0FFRztBQUNILElBQVksV0E2U1g7QUE3U0QsV0FBWSxXQUFXO0lBQ25COzs7O09BSUc7SUFFSDs7Ozs7T0FLRztJQUVIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQTBCRztJQUNILGlFQUFjLENBQUE7SUFFZDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQW1CRztJQUNILG1FQUFlLENBQUE7SUFFZjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILCtEQUFhLENBQUE7SUFFYjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILCtEQUFhLENBQUE7SUFFYjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQXNCRztJQUNILDJFQUFtQixDQUFBO0lBRW5COzs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FrQkc7SUFDSCw2RUFBb0IsQ0FBQTtJQUVwQjs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FpQkc7SUFDSCx5RUFBa0IsQ0FBQTtJQUVsQjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILHlFQUFrQixDQUFBO0lBRWxCOzs7OztPQUtHO0lBRUg7Ozs7Ozs7Ozs7Ozs7T0FhRztJQUNILHVEQUFTLENBQUE7SUFFVDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQW1CRztJQUNILGlFQUFjLENBQUE7SUFFZDs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsZ0ZBQXFCLENBQUE7SUFFckI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FtQkc7SUFDSCxvRUFBZSxDQUFBO0lBRWY7Ozs7Ozs7Ozs7O09BV0c7SUFDSCxrRkFBc0IsQ0FBQTtJQUV0QixzR0FBc0c7SUFFdEc7O09BRUc7SUFDSCxvREFBTyxDQUFBO0lBRVA7O09BRUc7SUFDSCxzREFBUSxDQUFBO0lBRVI7O09BRUc7SUFDSCxnRkFBcUIsQ0FBQTtBQUN6QixDQUFDLEVBN1NXLFdBQVcsR0FBWCxtQkFBVyxLQUFYLG1CQUFXLFFBNlN0QiIsImZpbGUiOiJpbnRlcmZhY2VzL01lc3NhZ2VUeXBlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIOS8oOi+k+a2iOaBr+eahOexu+Wei++8jOS5n+WPr+S7peaKiuWug+eQhuino+S4uueKtuaAgeeggVxyXG4gKi9cclxuZXhwb3J0IGVudW0gTWVzc2FnZVR5cGUge1xyXG4gICAgLyoqXHJcbiAgICAgKiDlhajlsYDvvJpcclxuICAgICAqIDEu5omA5pyJ5raI5oGv5Y+R6YCB5ZCO77yM5aS06YOo6YO95Lya6KKr5omT5YyF5oiQ5LiA5LiqSlNPTuaVsOe7hO+8jOWFtumhuuW6j+ehruS/neaAu+aYr+esrOS4gOmhueaYr3R5cGXvvIznrKzkuozpobnmmK9zZW5kZXLvvIznrKzkuInpobnmmK9yZWNlaXZlcu+8jOesrOWbm+mhueaYr3BhdGjjgIJcclxuICAgICAqIDIucGF0aOeahOacgOWkp+mVv+W6puS4ujI1NuS4qlVuaWNvZGXlrZfnrKZcclxuICAgICAqL1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogaW52b2tl77yaICAgICBcclxuICAgICAqIDEuaW52b2tl5a+5cGF0aOeahOagvOW8j+ayoeacieimgeaxgu+8jOS9huaOqOiNkOS9v+eUqGAvYOadpeWIkuWIhuWxgue6p++8jOacgOWQjuS4gOS4quS4uuaWueazleWQje+8jOWJjemdoueahOensOS4uuWRveWQjeepuumXtO+8jOi/meagt+WBmuaYr+S4uuS6huS+v+S6juadg+mZkOaOp+WItuOAglxyXG4gICAgICogICDkvovlpoJcIm5hbWVzcGFjZS9mdW5jdGlvbk5hbWVcIlxyXG4gICAgICogMi7kuIDkuKpwYXRo5LiK5Y+q5YWB6K645a+85Ye65LiA5Liq5pa55rOV44CC5aaC5p6c6YeN5aSN5a+85Ye65YiZ5ZCO6Z2i55qE5bqU6K+l6KaG55uW5o6J5YmN6Z2i55qE44CCXHJcbiAgICAgKi9cclxuXHJcbiAgICAvKipcclxuICAgICAqIOiwg+eUqOiAheWQkeiiq+iwg+eUqOiAheWPkeWHuuiwg+eUqOivt+axgiAgICAgICBcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9yZXF1ZXN0ICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgIC8v6LCD55So6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAvL+iiq+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcGF0aDpzdHJpbmcgICAgICAgICAgICAgLy/osIPnlKjmlrnms5XmiYDlnKjnmoTot6/lvoQgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHJlcXVlc3RNZXNzYWdlSUQ6bnVtYmVyICAgICAvL+ivt+axgua2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgZGF0YTphbnkgICAgICAgICAgICAgICAgICAgIC8v6KaB5Y+R6YCB55qE5pWw5o2u77yM6L+Z5Liq5Zyo5Y+R6YCB5YmN5Lya6KKr5bqP5YiX5YyW5oiQSlNPTiAgICAgICBcclxuICAgICAqICAgICAgZmlsZXM6IFsgICAgICAgICAgICAgICAgICAgIC8v5raI5oGv6ZmE5bim55qE5paH5Lu2ICAgICAgIFxyXG4gICAgICogICAgICAgICAgaWQ6bnVtYmVyICAgICAgICAgICAgICAgLy/mlofku7bnvJblj7cgICAgXHJcbiAgICAgKiAgICAgICAgICBzaXplOm51bWJlcnxudWxsICAgICAgICAvL+aWh+S7tuWkp+WwjyhieXRlKeOAguWmguaenOaWh+S7tuWkp+Wwj+S4jeehruWumuWImeS4um51bGwgICAgXHJcbiAgICAgKiAgICAgICAgICBzcGxpdE51bWJlcjpudW1iZXJ8bnVsbCAvL+aWh+S7tuiiq+WIhuWJsuaIkOS6huWkmuWwkeWdlyjojIPlm7TmmK8wIDw9IFggPCBlbmQp44CC5aaC5p6c5paH5Lu25aSn5bCP5LiN56Gu5a6a5YiZ5Li6bnVsbCAgIFxyXG4gICAgICogICAgICAgICAgbmFtZTpzdHJpbmcgICAgICAgICAgICAgLy/mlofku7blkI0gICAgXHJcbiAgICAgKiAgICAgIF1bXSAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOW9k+aKimludm9rZV9yZXF1ZXN05Y+R6YCB5Ye65Y675LmL5ZCOKOS4jeeuoea2iOaBr+eOsOWcqOaYr+WcqOe8k+WGsumYn+WIl+S4rei/mOaYr+ecn+eahOW3sue7j+WPkeWHuuWOu+S6hinvvIzosIPnlKjogIXlsLHlvIDlp4vlgJLorqHml7bvvIzml7bplb/kuLoz5YiG6ZKf77yM6LaF6L+HM+WIhumSn+WwseWIpOWumuivt+axgui2heaXtuOAglxyXG4gICAgICog5aaC5p6c5Lit6YCU5pS25Yiw5LqG6KKr6LCD55So6ICF5Lyg5Zue55qEaW52b2tlX2ZpbGVfcmVxdWVzdOivt+axgu+8jOmCo+S5iOWwsemHjee9ruWAkuiuoeaXtu+8jOi/meS4gOi/h+eoi+ebtOWIsOaUtuWIsOiiq+iwg+eUqOiAheS8oOWbnueahGludm9rZV9yZXNwb25zZeaIlmludm9rZV9mYWlsZWTkuLrmraLjgIJcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya5aaC5p6c6LCD55So6ICF6LCD55So55qE5pa55rOV5LiN5a2Y5Zyo77yM6KKr6LCD55So6ICF6KaB5ZCR6LCD55So6ICF5oql6ZSZXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9yZXF1ZXN0LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6KKr6LCD55So6ICF5oiQ5Yqf5aSE55CG5a6M6K+35rGC77yM5bCG57uT5p6c6L+U5Zue57uZ6LCD55So6ICFXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfcmVzcG9uc2UgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAvL+iiq+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgLy/osIPnlKjogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHJlcXVlc3RNZXNzYWdlSUQ6bnVtYmVyICAgICAvL+ivt+axgua2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgcmVzcG9uc2VNZXNzYWdlSUQ6bnVtYmVyICAgIC8v5ZON5bqU5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICBkYXRhOmFueSAgICAgICAgICAgICAgICAgICAgLy/opoHlj43ppojnmoTmlbDmja7vvIzov5nkuKrlnKjlj5HpgIHliY3kvJrooqvluo/liJfljJbmiJBKU09OICAgICAgIFxyXG4gICAgICogICAgICBmaWxlczpbaWQ6bnVtYmVyLCBzaXplOm51bWJlcnxudWxsLCBzcGxpdE51bWJlcjpudW1iZXJ8bnVsbCwgbmFtZTpzdHJpbmddW10gICAgLy/lj43ppojmtojmga/pmYTluKbnmoTmlofku7YgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlpoLmnpzov5Tlm57nmoTnu5PmnpzkuK3ljIXlkKvmlofku7bvvIzpgqPkuYjlvZPmioppbnZva2VfcmVzcG9uc2Xlj5HpgIHlh7rljrvkuYvlkI4o5LiN566h5raI5oGv546w5Zyo5piv5Zyo57yT5Yay6Zif5YiX5Lit6L+Y5piv55yf55qE5bey57uP5Y+R5Ye65Y675LqGKe+8jOiiq+iwg+eUqOiAheWwseW8gOWni+WAkuiuoeaXtu+8jOaXtumVv+S4ujPliIbpkp/vvIzotoXov4cz5YiG6ZKf5bCx55u05o6l57uT5p2f5ZON5bqU77yM5riF55CG6LWE5rqQ44CCXHJcbiAgICAgKiDlpoLmnpzkuK3pgJTmlLbliLDkuobosIPnlKjogIXkvKDlm57nmoRpbnZva2VfZmlsZV9yZXF1ZXN06K+35rGC77yM6YKj5LmI5bCx6YeN572u5YCS6K6h5pe244CC6L+Z5LiA6L+H56iL55u05Yiw5pS25Yiw6LCD55So6ICF5Lyg5Zue55qEaW52b2tlX2ZpbmlzaOS4uuatouOAglxyXG4gICAgICovXHJcbiAgICBpbnZva2VfcmVzcG9uc2UsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjogIXmjqXmlLblrozooqvosIPnlKjogIXkvKDlm57nmoTmlofku7bkuYvlkI7vvIzpgJrnn6XooqvosIPnlKjogIXmraTmrKHosIPnlKjor7fmsYLlvbvlupXnu5PmnZ/jgIJcclxuICAgICAqIOWmguaenOiiq+iwg+eUqOiAheWcqGludm9rZV9yZXNwb25zZeS4reayoeaciei/lOWbnuaWh+S7tuWImeS4jemcgOimgei/lOWbnuivpea2iOaBr+OAglxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9maW5pc2ggICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgIC8v6LCD55So6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAvL+iiq+iwg+eUqOiAhSAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHJlc3BvbnNlTWVzc2FnZUlEOm51bWJlciAgICAvL+WTjeW6lOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqIF0gICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muiiq+iwg+eUqOiAheaUtuWIsOi/meadoea2iOaBr+WQjuWwseeri+WNs+a4heeQhui1hOa6kO+8jOS4jeWGjeWTjeW6lOWFs+S6jui/meadoea2iOaBr+eahOS7u+S9leivt+axguOAglxyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmluaXNoLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6KKr6LCD55So6ICF5Zyo5aSE55CG6K+35rGC55qE6L+H56iL5Lit5Ye6546w5LqG6ZSZ6K+vLOWRiuefpeiwg+eUqOiAhemUmeivr+eahOWOn+WboOOAglxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZhaWxlZCAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgLy/ooqvosIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgIC8v6LCD55So6ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICByZXF1ZXN0TWVzc2FnZUlEOm51bWJlciAgICAgLy/osIPnlKjogIXmiYDorr7nva7nmoTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGVycm9yOnN0cmluZyAgICAgICAgICAgICAgICAvL+imgeWPjemmiOeahOWksei0peWOn+WboCAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muW9k+aKiua2iOaBr+WPkeWHuuWOu+S5i+WQjuiiq+iwg+eUqOiAheWwseeri+WNs+a4heeQhui1hOa6kO+8jOS4jeWGjeWTjeW6lOWFs+S6jui/meadoea2iOaBr+eahOS7u+S9leivt+axguOAglxyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmFpbGVkLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6I635Y+WaW52b2tlX3JlcXVlc3TmiJZpbnZva2VfcmVzcG9uc2Xov4fnqIvkuK3miYDljIXlkKvnmoTmlofku7bniYfmrrVcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9maWxlX3JlcXVlc3QgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAgICAgLy/lj5HpgIHogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgICAgICAvL+aOpeaUtuiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL+a2iOaBr+e8luWPt++8iOivt+axguaXtuaYr3JlcXVlc3RNZXNzYWdlSUTvvIzlk43lupTml7bmmK9yZXNwb25zZU1lc3NhZ2VJRO+8iSAgICAgICBcclxuICAgICAqICAgICAgaWQ6bnVtYmVyICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgICBcclxuICAgICAqICAgICAgaW5kZXg6bnVtYmVyICAgICAgICAvL+aWh+S7tueJh+autee0ouW8leOAguazqOaEj++8muS5i+WJjeivt+axgui/h+eahOeJh+auteS4jeWFgeiuuOmHjeWkjeivt+axgu+8jOivt+axgueahOe0ouW8lee8luWPt+W6lOW9k+S4gOasoeavlOS4gOasoeWkp++8jOWQpuWImeS8muiiq+W9k+aIkOS8oOi+k+mUmeivr+OAgiAgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlvZPmioppbnZva2VfZmlsZV9yZXF1ZXN05Y+R6YCB5Ye65Y675LmL5ZCOKOS4jeeuoea2iOaBr+eOsOWcqOaYr+WcqOe8k+WGsumYn+WIl+S4rei/mOaYr+ecn+eahOW3sue7j+WPkeWHuuWOu+S6hinvvIzlj5HpgIHogIXlsLHlvIDlp4vlgJLorqHml7bvvIzml7bplb/kuLoz5YiG6ZKf77yM6LaF6L+HM+WIhumSn+WwseWIpOWumuivt+axgui2heaXtuOAglxyXG4gICAgICog6L+Z5LiA6L+H56iL55u05Yiw5pS25Yiw5o6l5pS26ICF5Lyg5Zue55qEaW52b2tlX2ZpbGVfcmVzcG9uc2XmiJZpbnZva2VfZmlsZV9mYWlsZWTmiJZpbnZva2VfZmlsZV9maW5pc2jkuLrmraLjgIIgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muaWh+S7tueahOaOpeaUtuiAheW6lOW9k+mqjOivgSAgICAgXHJcbiAgICAgKiAxLuaWh+S7tuWcqOS8oOi+k+i/h+eoi+S4re+8jOmhuuW6jyhpbmRleCnmmK/lkKblj5HnlJ/plJnkubEgICAgICAgXHJcbiAgICAgKiAyLuS4i+i9veWIsOeahOecn+WunuaWh+S7tuWkp+Wwj+W6lOW9k+etieS6juWPkemAgeiAheaJgOaPj+i/sOeahOWkp+Wwj1xyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmlsZV9yZXF1ZXN0LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZON5bqUaW52b2tlX2ZpbGVfcmVxdWVzdOivt+axglxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbGVfcmVzcG9uc2UgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgICAgICAvL+WPkemAgeiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgICAgIC8v5o6l5pS26ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8vaW52b2tlX2ZpbGVfcmVxdWVzdOeahOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgaWQ6bnVtYmVyICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgICBcclxuICAgICAqICAgICAgaW5kZXg6bnVtYmVyICAgICAgICAvL+aWh+S7tueJh+autee0ouW8lee8luWPtyAgICBcclxuICAgICAqICAgICAgZGF0YTpCdWZmZXIgICAgICAgICAvL+aWh+S7tueJh+auteWGheWuue+8iOm7mOiupOeahOS4gOS4quaWh+S7tueJh+auteeahOWkp+Wwj+aYrzUxMmti77yJICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muaWh+S7tueahOWPkemAgeiAheW6lOW9k+ehruS/neS4jeWFgeiuuOaOpeaUtuiAhemHjeWkjeS4i+i9veafkOS4gOaWh+S7tueJh+auteOAgiAgICBcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbGVfcmVzcG9uc2UsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDpgJrnn6Xor7fmsYLogIUs6I635Y+W5paH5Lu254mH5q615aSx6LSlICAgICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbGVfZmFpbGVkICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgICAgICAvL+WPkemAgeiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgICAgIC8v5o6l5pS26ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8vaW52b2tlX2ZpbGVfcmVxdWVzdOeahOa2iOaBr+e8luWPtyAgICBcclxuICAgICAqICAgICAgaWQ6bnVtYmVyICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgICAgIFxyXG4gICAgICogICAgICBlcnJvcjpzdHJpbmcgICAgICAgIC8v6KaB5Y+N6aaI55qE5aSx6LSl5Y6f5ZugICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya5oql6ZSZ5Y+q5Y+R6YCB5LiA5qyh77yM5bm25LiU5Y+R6YCB5LmL5ZCO5bCx56uL5Y2z5riF55CG55u45YWz6LWE5rqQ77yM5LiN5YWB6K645YaN6K+35rGC6K+l5paH5Lu25LqGXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9maWxlX2ZhaWxlZCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOmAmuefpeivt+axguiAhSzmiYDor7fmsYLnmoTmlofku7bniYfmrrVpbmRleOW3sue7j+i2heWHuuS6huiMg+WbtO+8iOihqOekuuaWh+S7tuS8oOi+k+WujOaIkO+8ieOAguS4u+imgeaYr+mSiOWvueS6juWPkemAgeS4jeehruWumuWkp+Wwj+aWh+S7tuiAjOWHhuWkh+eahOOAglxyXG4gICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmlsZV9maW5pc2ggICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgICAgIC8v5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAgICAgLy/mjqXmlLbogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy9pbnZva2VfZmlsZV9yZXF1ZXN055qE5raI5oGv57yW5Y+3ICAgICAgXHJcbiAgICAgKiAgICAgIGlkOm51bWJlciAgICAgICAgICAgLy/mlofku7bnvJblj7cgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrpgJrnn6Xlj6rlj5HpgIHkuIDmrKHvvIzlubbkuJTlj5HpgIHkuYvlkI7lsLHnq4vljbPmuIXnkIbnm7jlhbPotYTmupDvvIzkuI3lhYHorrjlho3or7fmsYLor6Xmlofku7bkuoZcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbGVfZmluaXNoLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogYnJvYWRjYXN077yaICAgICBcclxuICAgICAqIDEuYnJvYWRjYXN05a+5cGF0aOeahOagvOW8j+acieeJueauiuimgeaxgu+8jHBhdGjpgJrov4dcIi5cIuadpeWIkuWIhuWxgue6p++8jOazqOWGjOWcqOS4iue6p+eahOebkeWQrOWZqOWPr+S7peaUtuWIsOaJgOacieWPkee7meWFtuS4i+e6p+eahOW5v+aSreOAgiAgIFxyXG4gICAgICogICDkvovlpoJcIm5hbWVzcGFjZS5hLmJcIiwg5rOo5YaM5ZyoXCJuYW1lc3BhY2UuYVwi5LiK55qE55uR5ZCs5Zmo5LiN5LuF5Y+v5Lul5pS25YiwcGF0aOS4ulwibmFtZXNwYWNlLmFcIueahOW5v+aSre+8jOi/mOWPr+S7peaUtuWIsHBhdGjkuLpcIm5hbWVzcGFjZS5hLmJcIueahOW5v+aSreOAglxyXG4gICAgICogICDlkIznkIbvvIzms6jlhozlnKhcIm5hbWVzcGFjZVwi5LiK55qE55uR5ZCs5Zmo5Y+v5Lul5pS25YiwXCJuYW1lc3BhY2VcIuOAgVwibmFtZXNwYWNlLmFcIuOAgVwibmFtZXNwYWNlLmEuYlwi44CCXHJcbiAgICAgKi9cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWPkemAgeiAheWvueWkluWPkeWHuuW5v+aSrVxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gYnJvYWRjYXN0ICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgIC8v5bm/5pKt55qE5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICBwYXRoOnN0cmluZyAgICAgICAgIC8v5bm/5pKt55qE6Lev5b6EICAgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIGRhdGE6YW55ICAgICAgICAgICAgLy/opoHlj5HpgIHnmoTmlbDmja7vvIzov5nkuKrlnKjlj5HpgIHliY3kvJrooqvluo/liJfljJbmiJBKU09OICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZGK55+ld2Vic29ja2V055qE5Y+m5LiA56uv77yM546w5Zyo5p+Q5LiA6Lev5b6E5LiK55qE5bm/5pKt5pyJ5Lq65Zyo55uR5ZCs5LqGXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3Rfb3BlbiAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqIF0gICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAgICAgIC8v5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICBicm9hZGNhc3RTZW5kZXI6c3RyaW5nICAgLy/lub/mkq3nmoTlj5HpgIHogIUgICAgICBcclxuICAgICAqICAgICAgcGF0aDpzdHJpbmcgICAgICAgICAgICAgIC8v5bm/5pKt55qE6Lev5b6EICAgICAgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5Zyo5LiL6Z2i5Lik56eN5oOF5Ya15LiL5omN6ZyA6KaB5Y+R6YCB6K+l5raI5oGvXHJcbiAgICAgKiAxLiDnlKjmiLflnKjmlrDnmoTot6/lvoTkuIrms6jlhozkuoblub/mkq1cclxuICAgICAqIDIuIOW9k+e9kee7nOi/nuaOpeaWreW8gO+8jOmHjeaWsOi/nuaOpeS5i+WQju+8jOmcgOimgeWwhuS5i+WJjeazqOWGjOi/h+eahOW5v+aSrei3r+W+hOWGjemHjeaWsOmAmuefpeWvueaWueS4gOmBjeOAgiAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrlpoLmnpzlr7nmlrnlnKgz5YiG6ZKf5LmL5YaF5rKh5pyJ5Zue5bqU5YiZ6YeN5paw5YaN5Y+R5LiA5qyh77yM55u05Yiw5pS25Yiw5a+55pa55Zue5bqU5oiW572R57uc5pat5byA5Li65q2i44CCXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdF9vcGVuLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZGK55+ld2Vic29ja2V055qE5Y+m5LiA56uv77yM5LmL5YmN55qEYnJvYWRjYXN0X29wZW7lt7Lnu4/ooqvmraPnoa7lpITnkIbkuoZcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGJyb2FkY2FzdF9vcGVuX2ZpbmlzaCAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL2Jyb2FkY2FzdF9vcGVu5omA6K6+572u55qE5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muW9k+e9kee7nOi/nuaOpeaWreW8gOWQju+8jOWPjOaWuemDveW6lOebtOaOpea4heeQhuaOieWvueaWueS5i+WJjeazqOWGjOi/h+eahOW5v+aSrei3r+W+hOOAglxyXG4gICAgICovXHJcbiAgICBicm9hZGNhc3Rfb3Blbl9maW5pc2gsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkYrnn6V3ZWJzb2NrZXTnmoTlj6bkuIDnq6/vvIznjrDlnKjmn5DkuIDot6/lvoTkuIrnmoTlub/mkq3lt7Lnu4/msqHmnInkurrnm5HlkKzkuoZcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGJyb2FkY2FzdF9jbG9zZSAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAgICAgICAvL+a2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgYnJvYWRjYXN0U2VuZGVyOnN0cmluZyAgICAvL+W5v+aSreeahOWPkemAgeiAhSAgICAgIFxyXG4gICAgICogICAgICBwYXRoOnN0cmluZyAgICAgICAgICAgICAgIC8v5bm/5pKt55qE6Lev5b6EICAgICAgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5Zyo5LiL6Z2i5Lik56eN5oOF5Ya15LiL5omN6ZyA6KaB5Y+R6YCB6K+l5raI5oGvXHJcbiAgICAgKiAxLiDnlKjmiLflnKjmn5DmnaHot6/lvoTkuIrlt7Lnu4/msqHmnInms6jlhoznmoTmnInlub/mkq3nm5HlkKzlmajkuoZcclxuICAgICAqIDIuIOW9k+eUqOaIt+aUtuWIsOS6huiHquW3seayoeacieazqOWGjOi/h+eahOW5v+aSreeahOaXtuWAmemAmuefpeWvueaWueOAgiAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrlpoLmnpzlr7nmlrnlnKgz5YiG6ZKf5LmL5YaF5rKh5pyJ5Zue5bqU5YiZ6YeN5paw5YaN5Y+R5LiA5qyh77yM55u05Yiw5pS25Yiw5a+55pa55Zue5bqU5oiW572R57uc5pat5byA5Li65q2i44CCXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdF9jbG9zZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWRiuefpXdlYnNvY2tldOeahOWPpuS4gOerr++8jOS5i+WJjeeahGJyb2FkY2FzdF9jbG9zZeW3sue7j+iiq+ato+ehruWkhOeQhuS6hlxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL2Jyb2FkY2FzdF9jbG9zZeaJgOiuvue9rueahOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICovXHJcbiAgICBicm9hZGNhc3RfY2xvc2VfZmluaXNoLFxyXG5cclxuICAgIC8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t5LiL6Z2i5piv5LiA5Lqb5Zyo56iL5bqP5YaF6YOo5L2/55So55qE5raI5oGv77yM5LiN5Zyo572R57uc5LiK6L+b6KGM5Lyg6L6TLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb25uZWN0aW9uU29ja2V06L+e5o6l5omT5byAXHJcbiAgICAgKi9cclxuICAgIF9vbk9wZW4sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb25uZWN0aW9uU29ja2V06L+e5o6l5pat5byAXHJcbiAgICAgKi9cclxuICAgIF9vbkNsb3NlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5YiS5Ye65LiA5Z2X5LqL5Lu256m66Ze0LOiusOW9leWvueaWueato+WcqOWvueWTquS6m+i3r+W+hOeahOW5v+aSreWxleW8gOebkeWQrFxyXG4gICAgICovXHJcbiAgICBfYnJvYWRjYXN0X3doaXRlX2xpc3RcclxufSJdfQ==
