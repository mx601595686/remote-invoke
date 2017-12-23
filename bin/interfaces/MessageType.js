"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 传输消息的类型，也可以把它理解为状态码
 */
var MessageType;
(function (MessageType) {
    /**
     * 全局：
     * 1.所有消息发送后，头部都会被打包成一个JSON数组，其顺序确保总是第一项是type，第二项是sender，第三项是receiver，第四项是path，第五项是requestMessageID(这个只有invoke_request才有)。
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
     *      requestMessageID:number //请求消息编号
     * ]
     * body格式：
     * [
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
     *      broadcastSender:string    //广播的发送者
     *      path:string               //广播的路径
     *      includeAncestor           //是否把path的所有父级监听器也一并取消了，默认false。这个主要用于，当收到了一个自己没有注册过的广播，需要告知发送者以后不要再发送该广播以及其父级的所有广播。
     * ]
     *
     * 在下面两种情况下才需要发送该消息
     * 1. 用户在某条路径上已经没有注册的有广播监听器了
     * 2. 当用户收到了自己没有注册过的广播的时候通知对方。（注意：由于不知道在对方自己还注册了哪些监听器，所以需要将includeAncestor设置为true）
     *
     * 备注：由于对方是否收到以及是否正确处理broadcast_close对系统正常运行并不产生影响，所以没有添加broadcast_close处理后反馈消息类型
     */
    MessageType[MessageType["broadcast_close"] = 11] = "broadcast_close";
    /* -----------------------------------下面是一些在程序内部使用的消息，不在网络上进行传输------------------------------------ */
    /**
     * ConnectionSocket连接打开
     */
    MessageType[MessageType["_onOpen"] = 12] = "_onOpen";
    /**
     * ConnectionSocket连接断开
     */
    MessageType[MessageType["_onClose"] = 13] = "_onClose";
    /**
     * 划出一块事件空间,记录对方正在对哪些路径的广播展开监听
     */
    MessageType[MessageType["_broadcast_white_list"] = 14] = "_broadcast_white_list";
})(MessageType = exports.MessageType || (exports.MessageType = {}));

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImludGVyZmFjZXMvTWVzc2FnZVR5cGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7R0FFRztBQUNILElBQVksV0ErUlg7QUEvUkQsV0FBWSxXQUFXO0lBQ25COzs7O09BSUc7SUFFSDs7Ozs7T0FLRztJQUVIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQTBCRztJQUNILGlFQUFjLENBQUE7SUFFZDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQW1CRztJQUNILG1FQUFlLENBQUE7SUFFZjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILCtEQUFhLENBQUE7SUFFYjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILCtEQUFhLENBQUE7SUFFYjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQXNCRztJQUNILDJFQUFtQixDQUFBO0lBRW5COzs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FrQkc7SUFDSCw2RUFBb0IsQ0FBQTtJQUVwQjs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FpQkc7SUFDSCx5RUFBa0IsQ0FBQTtJQUVsQjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILHlFQUFrQixDQUFBO0lBRWxCOzs7OztPQUtHO0lBRUg7Ozs7Ozs7Ozs7Ozs7T0FhRztJQUNILHVEQUFTLENBQUE7SUFFVDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQW1CRztJQUNILGlFQUFjLENBQUE7SUFFZDs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsZ0ZBQXFCLENBQUE7SUFFckI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FtQkc7SUFDSCxvRUFBZSxDQUFBO0lBRWYsc0dBQXNHO0lBRXRHOztPQUVHO0lBQ0gsb0RBQU8sQ0FBQTtJQUVQOztPQUVHO0lBQ0gsc0RBQVEsQ0FBQTtJQUVSOztPQUVHO0lBQ0gsZ0ZBQXFCLENBQUE7QUFDekIsQ0FBQyxFQS9SVyxXQUFXLEdBQVgsbUJBQVcsS0FBWCxtQkFBVyxRQStSdEIiLCJmaWxlIjoiaW50ZXJmYWNlcy9NZXNzYWdlVHlwZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiDkvKDovpPmtojmga/nmoTnsbvlnovvvIzkuZ/lj6/ku6XmiorlroPnkIbop6PkuLrnirbmgIHnoIFcclxuICovXHJcbmV4cG9ydCBlbnVtIE1lc3NhZ2VUeXBlIHtcclxuICAgIC8qKlxyXG4gICAgICog5YWo5bGA77yaXHJcbiAgICAgKiAxLuaJgOaciea2iOaBr+WPkemAgeWQju+8jOWktOmDqOmDveS8muiiq+aJk+WMheaIkOS4gOS4qkpTT07mlbDnu4TvvIzlhbbpobrluo/noa7kv53mgLvmmK/nrKzkuIDpobnmmK90eXBl77yM56ys5LqM6aG55pivc2VuZGVy77yM56ys5LiJ6aG55pivcmVjZWl2ZXLvvIznrKzlm5vpobnmmK9wYXRo77yM56ys5LqU6aG55pivcmVxdWVzdE1lc3NhZ2VJRCjov5nkuKrlj6rmnIlpbnZva2VfcmVxdWVzdOaJjeaciSnjgIJcclxuICAgICAqIDIucGF0aOeahOacgOWkp+mVv+W6puS4ujI1NuS4qlVuaWNvZGXlrZfnrKZcclxuICAgICAqL1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogaW52b2tl77yaICAgICBcclxuICAgICAqIDEuaW52b2tl5a+5cGF0aOeahOagvOW8j+ayoeacieimgeaxgu+8jOS9huaOqOiNkOS9v+eUqGAvYOadpeWIkuWIhuWxgue6p++8jOacgOWQjuS4gOS4quS4uuaWueazleWQje+8jOWJjemdoueahOensOS4uuWRveWQjeepuumXtO+8jOi/meagt+WBmuaYr+S4uuS6huS+v+S6juadg+mZkOaOp+WItuOAglxyXG4gICAgICogICDkvovlpoJcIm5hbWVzcGFjZS9mdW5jdGlvbk5hbWVcIlxyXG4gICAgICogMi7kuIDkuKpwYXRo5LiK5Y+q5YWB6K645a+85Ye65LiA5Liq5pa55rOV44CC5aaC5p6c6YeN5aSN5a+85Ye65YiZ5ZCO6Z2i55qE5bqU6K+l6KaG55uW5o6J5YmN6Z2i55qE44CCXHJcbiAgICAgKi9cclxuXHJcbiAgICAvKipcclxuICAgICAqIOiwg+eUqOiAheWQkeiiq+iwg+eUqOiAheWPkeWHuuiwg+eUqOivt+axgiAgICAgICBcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9yZXF1ZXN0ICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgIC8v6LCD55So6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAvL+iiq+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcGF0aDpzdHJpbmcgICAgICAgICAgICAgLy/osIPnlKjmlrnms5XmiYDlnKjnmoTot6/lvoQgICAgICAgXHJcbiAgICAgKiAgICAgIHJlcXVlc3RNZXNzYWdlSUQ6bnVtYmVyIC8v6K+35rGC5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBkYXRhOmFueSAgICAgICAgICAgICAgICAgICAgLy/opoHlj5HpgIHnmoTmlbDmja7vvIzov5nkuKrlnKjlj5HpgIHliY3kvJrooqvluo/liJfljJbmiJBKU09OICAgICAgIFxyXG4gICAgICogICAgICBmaWxlczogWyAgICAgICAgICAgICAgICAgICAgLy/mtojmga/pmYTluKbnmoTmlofku7YgICAgICAgXHJcbiAgICAgKiAgICAgICAgICBpZDpudW1iZXIgICAgICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgICBcclxuICAgICAqICAgICAgICAgIHNpemU6bnVtYmVyfG51bGwgICAgICAgIC8v5paH5Lu25aSn5bCPKGJ5dGUp44CC5aaC5p6c5paH5Lu25aSn5bCP5LiN56Gu5a6a5YiZ5Li6bnVsbCAgICBcclxuICAgICAqICAgICAgICAgIHNwbGl0TnVtYmVyOm51bWJlcnxudWxsIC8v5paH5Lu26KKr5YiG5Ymy5oiQ5LqG5aSa5bCR5Z2XKOiMg+WbtOaYrzAgPD0gWCA8IGVuZCnjgILlpoLmnpzmlofku7blpKflsI/kuI3noa7lrprliJnkuLpudWxsICAgXHJcbiAgICAgKiAgICAgICAgICBuYW1lOnN0cmluZyAgICAgICAgICAgICAvL+aWh+S7tuWQjSAgICBcclxuICAgICAqICAgICAgXVtdICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIFxyXG4gICAgICog5b2T5oqKaW52b2tlX3JlcXVlc3Tlj5HpgIHlh7rljrvkuYvlkI4o5LiN566h5raI5oGv546w5Zyo5piv5Zyo57yT5Yay6Zif5YiX5Lit6L+Y5piv55yf55qE5bey57uP5Y+R5Ye65Y675LqGKe+8jOiwg+eUqOiAheWwseW8gOWni+WAkuiuoeaXtu+8jOaXtumVv+S4ujPliIbpkp/vvIzotoXov4cz5YiG6ZKf5bCx5Yik5a6a6K+35rGC6LaF5pe244CCXHJcbiAgICAgKiDlpoLmnpzkuK3pgJTmlLbliLDkuobooqvosIPnlKjogIXkvKDlm57nmoRpbnZva2VfZmlsZV9yZXF1ZXN06K+35rGC77yM6YKj5LmI5bCx6YeN572u5YCS6K6h5pe277yM6L+Z5LiA6L+H56iL55u05Yiw5pS25Yiw6KKr6LCD55So6ICF5Lyg5Zue55qEaW52b2tlX3Jlc3BvbnNl5oiWaW52b2tlX2ZhaWxlZOS4uuatouOAglxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrlpoLmnpzosIPnlKjogIXosIPnlKjnmoTmlrnms5XkuI3lrZjlnKjvvIzooqvosIPnlKjogIXopoHlkJHosIPnlKjogIXmiqXplJlcclxuICAgICAqL1xyXG4gICAgaW52b2tlX3JlcXVlc3QsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDooqvosIPnlKjogIXmiJDlip/lpITnkIblrozor7fmsYLvvIzlsIbnu5Pmnpzov5Tlm57nu5nosIPnlKjogIVcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9yZXNwb25zZSAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgIC8v6KKr6LCD55So6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAvL+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgcmVxdWVzdE1lc3NhZ2VJRDpudW1iZXIgICAgIC8v6K+35rGC5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICByZXNwb25zZU1lc3NhZ2VJRDpudW1iZXIgICAgLy/lk43lupTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGRhdGE6YW55ICAgICAgICAgICAgICAgICAgICAvL+imgeWPjemmiOeahOaVsOaNru+8jOi/meS4quWcqOWPkemAgeWJjeS8muiiq+W6j+WIl+WMluaIkEpTT04gICAgICAgXHJcbiAgICAgKiAgICAgIGZpbGVzOltpZDpudW1iZXIsIHNpemU6bnVtYmVyfG51bGwsIHNwbGl0TnVtYmVyOm51bWJlcnxudWxsLCBuYW1lOnN0cmluZ11bXSAgICAvL+WPjemmiOa2iOaBr+mZhOW4pueahOaWh+S7tiAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOWmguaenOi/lOWbnueahOe7k+aenOS4reWMheWQq+aWh+S7tu+8jOmCo+S5iOW9k+aKimludm9rZV9yZXNwb25zZeWPkemAgeWHuuWOu+S5i+WQjijkuI3nrqHmtojmga/njrDlnKjmmK/lnKjnvJPlhrLpmJ/liJfkuK3ov5jmmK/nnJ/nmoTlt7Lnu4/lj5Hlh7rljrvkuoYp77yM6KKr6LCD55So6ICF5bCx5byA5aeL5YCS6K6h5pe277yM5pe26ZW/5Li6M+WIhumSn++8jOi2hei/hzPliIbpkp/lsLHnm7TmjqXnu5PmnZ/lk43lupTvvIzmuIXnkIbotYTmupDjgIJcclxuICAgICAqIOWmguaenOS4remAlOaUtuWIsOS6huiwg+eUqOiAheS8oOWbnueahGludm9rZV9maWxlX3JlcXVlc3Tor7fmsYLvvIzpgqPkuYjlsLHph43nva7lgJLorqHml7bjgILov5nkuIDov4fnqIvnm7TliLDmlLbliLDosIPnlKjogIXkvKDlm57nmoRpbnZva2VfZmluaXNo5Li65q2i44CCXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9yZXNwb25zZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiwg+eUqOiAheaOpeaUtuWujOiiq+iwg+eUqOiAheS8oOWbnueahOaWh+S7tuS5i+WQju+8jOmAmuefpeiiq+iwg+eUqOiAheatpOasoeiwg+eUqOivt+axguW9u+W6lee7k+adn+OAglxyXG4gICAgICog5aaC5p6c6KKr6LCD55So6ICF5ZyoaW52b2tlX3Jlc3BvbnNl5Lit5rKh5pyJ6L+U5Zue5paH5Lu25YiZ5LiN6ZyA6KaB6L+U5Zue6K+l5raI5oGv44CCXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICAgICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbmlzaCAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgLy/osIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgIC8v6KKr6LCD55So6ICFICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgcmVzcG9uc2VNZXNzYWdlSUQ6bnVtYmVyICAgIC8v5ZON5bqU5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogXSAgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya6KKr6LCD55So6ICF5pS25Yiw6L+Z5p2h5raI5oGv5ZCO5bCx56uL5Y2z5riF55CG6LWE5rqQ77yM5LiN5YaN5ZON5bqU5YWz5LqO6L+Z5p2h5raI5oGv55qE5Lu75L2V6K+35rGC44CCXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9maW5pc2gsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDooqvosIPnlKjogIXlnKjlpITnkIbor7fmsYLnmoTov4fnqIvkuK3lh7rnjrDkuobplJnor68s5ZGK55+l6LCD55So6ICF6ZSZ6K+v55qE5Y6f5Zug44CCXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmFpbGVkICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAvL+iiq+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgLy/osIPnlKjogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHJlcXVlc3RNZXNzYWdlSUQ6bnVtYmVyICAgICAvL+iwg+eUqOiAheaJgOiuvue9rueahOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgZXJyb3I6c3RyaW5nICAgICAgICAgICAgICAgIC8v6KaB5Y+N6aaI55qE5aSx6LSl5Y6f5ZugICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya5b2T5oqK5raI5oGv5Y+R5Ye65Y675LmL5ZCO6KKr6LCD55So6ICF5bCx56uL5Y2z5riF55CG6LWE5rqQ77yM5LiN5YaN5ZON5bqU5YWz5LqO6L+Z5p2h5raI5oGv55qE5Lu75L2V6K+35rGC44CCXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9mYWlsZWQsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDojrflj5ZpbnZva2VfcmVxdWVzdOaIlmludm9rZV9yZXNwb25zZei/h+eoi+S4reaJgOWMheWQq+eahOaWh+S7tueJh+autVxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbGVfcmVxdWVzdCAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgICAgICAvL+WPkemAgeiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgICAgIC8v5o6l5pS26ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8v5raI5oGv57yW5Y+377yI6K+35rGC5pe25pivcmVxdWVzdE1lc3NhZ2VJRO+8jOWTjeW6lOaXtuaYr3Jlc3BvbnNlTWVzc2FnZUlE77yJICAgICAgIFxyXG4gICAgICogICAgICBpZDpudW1iZXIgICAgICAgICAgIC8v5paH5Lu257yW5Y+3ICAgIFxyXG4gICAgICogICAgICBpbmRleDpudW1iZXIgICAgICAgIC8v5paH5Lu254mH5q6157Si5byV44CC5rOo5oSP77ya5LmL5YmN6K+35rGC6L+H55qE54mH5q615LiN5YWB6K646YeN5aSN6K+35rGC77yM6K+35rGC55qE57Si5byV57yW5Y+35bqU5b2T5LiA5qyh5q+U5LiA5qyh5aSn77yM5ZCm5YiZ5Lya6KKr5b2T5oiQ5Lyg6L6T6ZSZ6K+v44CCICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOW9k+aKimludm9rZV9maWxlX3JlcXVlc3Tlj5HpgIHlh7rljrvkuYvlkI4o5LiN566h5raI5oGv546w5Zyo5piv5Zyo57yT5Yay6Zif5YiX5Lit6L+Y5piv55yf55qE5bey57uP5Y+R5Ye65Y675LqGKe+8jOWPkemAgeiAheWwseW8gOWni+WAkuiuoeaXtu+8jOaXtumVv+S4ujPliIbpkp/vvIzotoXov4cz5YiG6ZKf5bCx5Yik5a6a6K+35rGC6LaF5pe244CCXHJcbiAgICAgKiDov5nkuIDov4fnqIvnm7TliLDmlLbliLDmjqXmlLbogIXkvKDlm57nmoRpbnZva2VfZmlsZV9yZXNwb25zZeaIlmludm9rZV9maWxlX2ZhaWxlZOaIlmludm9rZV9maWxlX2ZpbmlzaOS4uuatouOAgiAgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya5paH5Lu255qE5o6l5pS26ICF5bqU5b2T6aqM6K+BICAgICBcclxuICAgICAqIDEu5paH5Lu25Zyo5Lyg6L6T6L+H56iL5Lit77yM6aG65bqPKGluZGV4KeaYr+WQpuWPkeeUn+mUmeS5sSAgICAgICBcclxuICAgICAqIDIu5LiL6L295Yiw55qE55yf5a6e5paH5Lu25aSn5bCP5bqU5b2T562J5LqO5Y+R6YCB6ICF5omA5o+P6L+w55qE5aSn5bCPXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9maWxlX3JlcXVlc3QsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlk43lupRpbnZva2VfZmlsZV9yZXF1ZXN06K+35rGCXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmlsZV9yZXNwb25zZSAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgICAgIC8v5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAgICAgLy/mjqXmlLbogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy9pbnZva2VfZmlsZV9yZXF1ZXN055qE5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICBpZDpudW1iZXIgICAgICAgICAgIC8v5paH5Lu257yW5Y+3ICAgIFxyXG4gICAgICogICAgICBpbmRleDpudW1iZXIgICAgICAgIC8v5paH5Lu254mH5q6157Si5byV57yW5Y+3ICAgIFxyXG4gICAgICogICAgICBkYXRhOkJ1ZmZlciAgICAgICAgIC8v5paH5Lu254mH5q615YaF5a6577yI6buY6K6k55qE5LiA5Liq5paH5Lu254mH5q6155qE5aSn5bCP5pivNTEya2LvvIkgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya5paH5Lu255qE5Y+R6YCB6ICF5bqU5b2T56Gu5L+d5LiN5YWB6K645o6l5pS26ICF6YeN5aSN5LiL6L295p+Q5LiA5paH5Lu254mH5q6144CCICAgIFxyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmlsZV9yZXNwb25zZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOmAmuefpeivt+axguiAhSzojrflj5bmlofku7bniYfmrrXlpLHotKUgICAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmlsZV9mYWlsZWQgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgICAgIC8v5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAgICAgLy/mjqXmlLbogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy9pbnZva2VfZmlsZV9yZXF1ZXN055qE5raI5oGv57yW5Y+3ICAgIFxyXG4gICAgICogICAgICBpZDpudW1iZXIgICAgICAgICAgIC8v5paH5Lu257yW5Y+3ICAgICAgXHJcbiAgICAgKiAgICAgIGVycm9yOnN0cmluZyAgICAgICAgLy/opoHlj43ppojnmoTlpLHotKXljp/lm6AgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrmiqXplJnlj6rlj5HpgIHkuIDmrKHvvIzlubbkuJTlj5HpgIHkuYvlkI7lsLHnq4vljbPmuIXnkIbnm7jlhbPotYTmupDvvIzkuI3lhYHorrjlho3or7fmsYLor6Xmlofku7bkuoZcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbGVfZmFpbGVkLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6YCa55+l6K+35rGC6ICFLOaJgOivt+axgueahOaWh+S7tueJh+autWluZGV45bey57uP6LaF5Ye65LqG6IyD5Zu077yI6KGo56S65paH5Lu25Lyg6L6T5a6M5oiQ77yJ44CC5Li76KaB5piv6ZKI5a+55LqO5Y+R6YCB5LiN56Gu5a6a5aSn5bCP5paH5Lu26ICM5YeG5aSH55qE44CCXHJcbiAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9maWxlX2ZpbmlzaCAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAgICAgLy/lj5HpgIHogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgICAgICAvL+aOpeaUtuiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL2ludm9rZV9maWxlX3JlcXVlc3TnmoTmtojmga/nvJblj7cgICAgICBcclxuICAgICAqICAgICAgaWQ6bnVtYmVyICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8mumAmuefpeWPquWPkemAgeS4gOasoe+8jOW5tuS4lOWPkemAgeS5i+WQjuWwseeri+WNs+a4heeQhuebuOWFs+i1hOa6kO+8jOS4jeWFgeiuuOWGjeivt+axguivpeaWh+S7tuS6hlxyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmlsZV9maW5pc2gsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBicm9hZGNhc3TvvJogICAgIFxyXG4gICAgICogMS5icm9hZGNhc3Tlr7lwYXRo55qE5qC85byP5pyJ54m55q6K6KaB5rGC77yMcGF0aOmAmui/h1wiLlwi5p2l5YiS5YiG5bGC57qn77yM5rOo5YaM5Zyo5LiK57qn55qE55uR5ZCs5Zmo5Y+v5Lul5pS25Yiw5omA5pyJ5Y+R57uZ5YW25LiL57qn55qE5bm/5pKt44CCICAgXHJcbiAgICAgKiAgIOS+i+WmglwibmFtZXNwYWNlLmEuYlwiLCDms6jlhozlnKhcIm5hbWVzcGFjZS5hXCLkuIrnmoTnm5HlkKzlmajkuI3ku4Xlj6/ku6XmlLbliLBwYXRo5Li6XCJuYW1lc3BhY2UuYVwi55qE5bm/5pKt77yM6L+Y5Y+v5Lul5pS25YiwcGF0aOS4ulwibmFtZXNwYWNlLmEuYlwi55qE5bm/5pKt44CCXHJcbiAgICAgKiAgIOWQjOeQhu+8jOazqOWGjOWcqFwibmFtZXNwYWNlXCLkuIrnmoTnm5HlkKzlmajlj6/ku6XmlLbliLBcIm5hbWVzcGFjZVwi44CBXCJuYW1lc3BhY2UuYVwi44CBXCJuYW1lc3BhY2UuYS5iXCLjgIJcclxuICAgICAqL1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+R6YCB6ICF5a+55aSW5Y+R5Ye65bm/5pKtXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3QgICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgLy/lub/mkq3nmoTlj5HpgIHogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHBhdGg6c3RyaW5nICAgICAgICAgLy/lub/mkq3nmoTot6/lvoQgICAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgZGF0YTphbnkgICAgICAgICAgICAvL+imgeWPkemAgeeahOaVsOaNru+8jOi/meS4quWcqOWPkemAgeWJjeS8muiiq+W6j+WIl+WMluaIkEpTT04gICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICovXHJcbiAgICBicm9hZGNhc3QsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkYrnn6V3ZWJzb2NrZXTnmoTlj6bkuIDnq6/vvIznjrDlnKjmn5DkuIDot6/lvoTkuIrnmoTlub/mkq3mnInkurrlnKjnm5HlkKzkuoZcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGJyb2FkY2FzdF9vcGVuICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogXSAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgICAgICAgLy/mtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGJyb2FkY2FzdFNlbmRlcjpzdHJpbmcgICAvL+W5v+aSreeahOWPkemAgeiAhSAgICAgIFxyXG4gICAgICogICAgICBwYXRoOnN0cmluZyAgICAgICAgICAgICAgLy/lub/mkq3nmoTot6/lvoQgICAgICAgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlnKjkuIvpnaLkuKTnp43mg4XlhrXkuIvmiY3pnIDopoHlj5HpgIHor6Xmtojmga9cclxuICAgICAqIDEuIOeUqOaIt+WcqOaWsOeahOi3r+W+hOS4iuazqOWGjOS6huW5v+aSrVxyXG4gICAgICogMi4g5b2T572R57uc6L+e5o6l5pat5byA77yM6YeN5paw6L+e5o6l5LmL5ZCO77yM6ZyA6KaB5bCG5LmL5YmN5rOo5YaM6L+H55qE5bm/5pKt6Lev5b6E5YaN6YeN5paw6YCa55+l5a+55pa55LiA6YGN44CCICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muWmguaenOWvueaWueWcqDPliIbpkp/kuYvlhoXmsqHmnInlm57lupTliJnph43mlrDlho3lj5HkuIDmrKHvvIznm7TliLDmlLbliLDlr7nmlrnlm57lupTmiJbnvZHnu5zmlq3lvIDkuLrmraLjgIJcclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0X29wZW4sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkYrnn6V3ZWJzb2NrZXTnmoTlj6bkuIDnq6/vvIzkuYvliY3nmoRicm9hZGNhc3Rfb3BlbuW3sue7j+iiq+ato+ehruWkhOeQhuS6hlxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gYnJvYWRjYXN0X29wZW5fZmluaXNoICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8vYnJvYWRjYXN0X29wZW7miYDorr7nva7nmoTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya5b2T572R57uc6L+e5o6l5pat5byA5ZCO77yM5Y+M5pa56YO95bqU55u05o6l5riF55CG5o6J5a+55pa55LmL5YmN5rOo5YaM6L+H55qE5bm/5pKt6Lev5b6E44CCXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdF9vcGVuX2ZpbmlzaCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWRiuefpXdlYnNvY2tldOeahOWPpuS4gOerr++8jOeOsOWcqOafkOS4gOi3r+W+hOS4iueahOW5v+aSreW3sue7j+ayoeacieS6uuebkeWQrOS6hlxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gYnJvYWRjYXN0X2Nsb3NlICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBicm9hZGNhc3RTZW5kZXI6c3RyaW5nICAgIC8v5bm/5pKt55qE5Y+R6YCB6ICFICAgICAgXHJcbiAgICAgKiAgICAgIHBhdGg6c3RyaW5nICAgICAgICAgICAgICAgLy/lub/mkq3nmoTot6/lvoQgICAgICAgICBcclxuICAgICAqICAgICAgaW5jbHVkZUFuY2VzdG9yICAgICAgICAgICAvL+aYr+WQpuaKinBhdGjnmoTmiYDmnInniLbnuqfnm5HlkKzlmajkuZ/kuIDlubblj5bmtojkuobvvIzpu5jorqRmYWxzZeOAgui/meS4quS4u+imgeeUqOS6ju+8jOW9k+aUtuWIsOS6huS4gOS4quiHquW3seayoeacieazqOWGjOi/h+eahOW5v+aSre+8jOmcgOimgeWRiuefpeWPkemAgeiAheS7peWQjuS4jeimgeWGjeWPkemAgeivpeW5v+aSreS7peWPiuWFtueItue6p+eahOaJgOacieW5v+aSreOAgiAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5Zyo5LiL6Z2i5Lik56eN5oOF5Ya15LiL5omN6ZyA6KaB5Y+R6YCB6K+l5raI5oGvXHJcbiAgICAgKiAxLiDnlKjmiLflnKjmn5DmnaHot6/lvoTkuIrlt7Lnu4/msqHmnInms6jlhoznmoTmnInlub/mkq3nm5HlkKzlmajkuoZcclxuICAgICAqIDIuIOW9k+eUqOaIt+aUtuWIsOS6huiHquW3seayoeacieazqOWGjOi/h+eahOW5v+aSreeahOaXtuWAmemAmuefpeWvueaWueOAgu+8iOazqOaEj++8mueUseS6juS4jeefpemBk+WcqOWvueaWueiHquW3sei/mOazqOWGjOS6huWTquS6m+ebkeWQrOWZqO+8jOaJgOS7pemcgOimgeWwhmluY2x1ZGVBbmNlc3Rvcuiuvue9ruS4unRydWXvvIkgICBcclxuICAgICAqIFxyXG4gICAgICog5aSH5rOo77ya55Sx5LqO5a+55pa55piv5ZCm5pS25Yiw5Lul5Y+K5piv5ZCm5q2j56Gu5aSE55CGYnJvYWRjYXN0X2Nsb3Nl5a+557O757uf5q2j5bi46L+Q6KGM5bm25LiN5Lqn55Sf5b2x5ZON77yM5omA5Lul5rKh5pyJ5re75YqgYnJvYWRjYXN0X2Nsb3Nl5aSE55CG5ZCO5Y+N6aaI5raI5oGv57G75Z6LXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdF9jbG9zZSxcclxuXHJcbiAgICAvKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLeS4i+mdouaYr+S4gOS6m+WcqOeoi+W6j+WGhemDqOS9v+eUqOeahOa2iOaBr++8jOS4jeWcqOe9kee7nOS4iui/m+ihjOS8oOi+ky0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSAqL1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29ubmVjdGlvblNvY2tldOi/nuaOpeaJk+W8gFxyXG4gICAgICovXHJcbiAgICBfb25PcGVuLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29ubmVjdGlvblNvY2tldOi/nuaOpeaWreW8gFxyXG4gICAgICovXHJcbiAgICBfb25DbG9zZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIkuWHuuS4gOWdl+S6i+S7tuepuumXtCzorrDlvZXlr7nmlrnmraPlnKjlr7nlk6rkupvot6/lvoTnmoTlub/mkq3lsZXlvIDnm5HlkKxcclxuICAgICAqL1xyXG4gICAgX2Jyb2FkY2FzdF93aGl0ZV9saXN0XHJcbn0iXX0=
