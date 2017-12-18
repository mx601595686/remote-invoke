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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImludGVyZmFjZXMvTWVzc2FnZVR5cGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7R0FFRztBQUNILElBQVksV0ErUlg7QUEvUkQsV0FBWSxXQUFXO0lBQ25COzs7O09BSUc7SUFFSDs7Ozs7T0FLRztJQUVIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQTBCRztJQUNILGlFQUFjLENBQUE7SUFFZDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQW1CRztJQUNILG1FQUFlLENBQUE7SUFFZjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILCtEQUFhLENBQUE7SUFFYjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILCtEQUFhLENBQUE7SUFFYjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQXNCRztJQUNILDJFQUFtQixDQUFBO0lBRW5COzs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FrQkc7SUFDSCw2RUFBb0IsQ0FBQTtJQUVwQjs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FpQkc7SUFDSCx5RUFBa0IsQ0FBQTtJQUVsQjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILHlFQUFrQixDQUFBO0lBRWxCOzs7OztPQUtHO0lBRUg7Ozs7Ozs7Ozs7Ozs7T0FhRztJQUNILHVEQUFTLENBQUE7SUFFVDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQW1CRztJQUNILGlFQUFjLENBQUE7SUFFZDs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsZ0ZBQXFCLENBQUE7SUFFckI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FtQkc7SUFDSCxvRUFBZSxDQUFBO0lBRWYsc0dBQXNHO0lBRXRHOztPQUVHO0lBQ0gsb0RBQU8sQ0FBQTtJQUVQOztPQUVHO0lBQ0gsc0RBQVEsQ0FBQTtJQUVSOztPQUVHO0lBQ0gsZ0ZBQXFCLENBQUE7QUFDekIsQ0FBQyxFQS9SVyxXQUFXLEdBQVgsbUJBQVcsS0FBWCxtQkFBVyxRQStSdEIiLCJmaWxlIjoiaW50ZXJmYWNlcy9NZXNzYWdlVHlwZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiDkvKDovpPmtojmga/nmoTnsbvlnovvvIzkuZ/lj6/ku6XmiorlroPnkIbop6PkuLrnirbmgIHnoIFcclxuICovXHJcbmV4cG9ydCBlbnVtIE1lc3NhZ2VUeXBlIHtcclxuICAgIC8qKlxyXG4gICAgICog5YWo5bGA77yaXHJcbiAgICAgKiAxLuaJgOaciea2iOaBr+WPkemAgeWQju+8jOWktOmDqOmDveS8muiiq+aJk+WMheaIkOS4gOS4qkpTT07mlbDnu4TvvIzlhbbpobrluo/noa7kv53mgLvmmK/nrKzkuIDpobnmmK90eXBl77yM56ys5LqM6aG55pivc2VuZGVy77yM56ys5LiJ6aG55pivcmVjZWl2ZXLvvIznrKzlm5vpobnmmK9wYXRo44CCXHJcbiAgICAgKiAyLnBhdGjnmoTmnIDlpKfplb/luqbkuLoyNTbkuKpVbmljb2Rl5a2X56ymXHJcbiAgICAgKi9cclxuXHJcbiAgICAvKipcclxuICAgICAqIGludm9rZe+8miAgICAgXHJcbiAgICAgKiAxLmludm9rZeWvuXBhdGjnmoTmoLzlvI/msqHmnInopoHmsYLvvIzkvYbmjqjojZDkvb/nlKhgL2DmnaXliJLliIblsYLnuqfvvIzmnIDlkI7kuIDkuKrkuLrmlrnms5XlkI3vvIzliY3pnaLnmoTnp7DkuLrlkb3lkI3nqbrpl7TvvIzov5nmoLflgZrmmK/kuLrkuobkvr/kuo7mnYPpmZDmjqfliLbjgIJcclxuICAgICAqICAg5L6L5aaCXCJuYW1lc3BhY2UvZnVuY3Rpb25OYW1lXCJcclxuICAgICAqIDIu5LiA5LiqcGF0aOS4iuWPquWFgeiuuOWvvOWHuuS4gOS4quaWueazleOAguWmguaenOmHjeWkjeWvvOWHuuWImeWQjumdoueahOW6lOivpeimhuebluaOieWJjemdoueahOOAglxyXG4gICAgICovXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjogIXlkJHooqvosIPnlKjogIXlj5Hlh7rosIPnlKjor7fmsYIgICAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfcmVxdWVzdCAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAvL+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgLy/ooqvosIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHBhdGg6c3RyaW5nICAgICAgICAgICAgIC8v6LCD55So5pa55rOV5omA5Zyo55qE6Lev5b6EICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICByZXF1ZXN0TWVzc2FnZUlEOm51bWJlciAgICAgLy/or7fmsYLmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGRhdGE6YW55ICAgICAgICAgICAgICAgICAgICAvL+imgeWPkemAgeeahOaVsOaNru+8jOi/meS4quWcqOWPkemAgeWJjeS8muiiq+W6j+WIl+WMluaIkEpTT04gICAgICAgXHJcbiAgICAgKiAgICAgIGZpbGVzOiBbICAgICAgICAgICAgICAgICAgICAvL+a2iOaBr+mZhOW4pueahOaWh+S7tiAgICAgICBcclxuICAgICAqICAgICAgICAgIGlkOm51bWJlciAgICAgICAgICAgICAgIC8v5paH5Lu257yW5Y+3ICAgIFxyXG4gICAgICogICAgICAgICAgc2l6ZTpudW1iZXJ8bnVsbCAgICAgICAgLy/mlofku7blpKflsI8oYnl0ZSnjgILlpoLmnpzmlofku7blpKflsI/kuI3noa7lrprliJnkuLpudWxsICAgIFxyXG4gICAgICogICAgICAgICAgc3BsaXROdW1iZXI6bnVtYmVyfG51bGwgLy/mlofku7booqvliIblibLmiJDkuoblpJrlsJHlnZco6IyD5Zu05pivMCA8PSBYIDwgZW5kKeOAguWmguaenOaWh+S7tuWkp+Wwj+S4jeehruWumuWImeS4um51bGwgICBcclxuICAgICAqICAgICAgICAgIG5hbWU6c3RyaW5nICAgICAgICAgICAgIC8v5paH5Lu25ZCNICAgIFxyXG4gICAgICogICAgICBdW10gICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlvZPmioppbnZva2VfcmVxdWVzdOWPkemAgeWHuuWOu+S5i+WQjijkuI3nrqHmtojmga/njrDlnKjmmK/lnKjnvJPlhrLpmJ/liJfkuK3ov5jmmK/nnJ/nmoTlt7Lnu4/lj5Hlh7rljrvkuoYp77yM6LCD55So6ICF5bCx5byA5aeL5YCS6K6h5pe277yM5pe26ZW/5Li6M+WIhumSn++8jOi2hei/hzPliIbpkp/lsLHliKTlrpror7fmsYLotoXml7bjgIJcclxuICAgICAqIOWmguaenOS4remAlOaUtuWIsOS6huiiq+iwg+eUqOiAheS8oOWbnueahGludm9rZV9maWxlX3JlcXVlc3Tor7fmsYLvvIzpgqPkuYjlsLHph43nva7lgJLorqHml7bvvIzov5nkuIDov4fnqIvnm7TliLDmlLbliLDooqvosIPnlKjogIXkvKDlm57nmoRpbnZva2VfcmVzcG9uc2XmiJZpbnZva2VfZmFpbGVk5Li65q2i44CCXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muWmguaenOiwg+eUqOiAheiwg+eUqOeahOaWueazleS4jeWtmOWcqO+8jOiiq+iwg+eUqOiAheimgeWQkeiwg+eUqOiAheaKpemUmVxyXG4gICAgICovXHJcbiAgICBpbnZva2VfcmVxdWVzdCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiiq+iwg+eUqOiAheaIkOWKn+WkhOeQhuWujOivt+axgu+8jOWwhue7k+aenOi/lOWbnue7meiwg+eUqOiAhVxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX3Jlc3BvbnNlICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgLy/ooqvosIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgIC8v6LCD55So6ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICByZXF1ZXN0TWVzc2FnZUlEOm51bWJlciAgICAgLy/or7fmsYLmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIHJlc3BvbnNlTWVzc2FnZUlEOm51bWJlciAgICAvL+WTjeW6lOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgZGF0YTphbnkgICAgICAgICAgICAgICAgICAgIC8v6KaB5Y+N6aaI55qE5pWw5o2u77yM6L+Z5Liq5Zyo5Y+R6YCB5YmN5Lya6KKr5bqP5YiX5YyW5oiQSlNPTiAgICAgICBcclxuICAgICAqICAgICAgZmlsZXM6W2lkOm51bWJlciwgc2l6ZTpudW1iZXJ8bnVsbCwgc3BsaXROdW1iZXI6bnVtYmVyfG51bGwsIG5hbWU6c3RyaW5nXVtdICAgIC8v5Y+N6aaI5raI5oGv6ZmE5bim55qE5paH5Lu2ICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIFxyXG4gICAgICog5aaC5p6c6L+U5Zue55qE57uT5p6c5Lit5YyF5ZCr5paH5Lu277yM6YKj5LmI5b2T5oqKaW52b2tlX3Jlc3BvbnNl5Y+R6YCB5Ye65Y675LmL5ZCOKOS4jeeuoea2iOaBr+eOsOWcqOaYr+WcqOe8k+WGsumYn+WIl+S4rei/mOaYr+ecn+eahOW3sue7j+WPkeWHuuWOu+S6hinvvIzooqvosIPnlKjogIXlsLHlvIDlp4vlgJLorqHml7bvvIzml7bplb/kuLoz5YiG6ZKf77yM6LaF6L+HM+WIhumSn+WwseebtOaOpee7k+adn+WTjeW6lO+8jOa4heeQhui1hOa6kOOAglxyXG4gICAgICog5aaC5p6c5Lit6YCU5pS25Yiw5LqG6LCD55So6ICF5Lyg5Zue55qEaW52b2tlX2ZpbGVfcmVxdWVzdOivt+axgu+8jOmCo+S5iOWwsemHjee9ruWAkuiuoeaXtuOAgui/meS4gOi/h+eoi+ebtOWIsOaUtuWIsOiwg+eUqOiAheS8oOWbnueahGludm9rZV9maW5pc2jkuLrmraLjgIJcclxuICAgICAqL1xyXG4gICAgaW52b2tlX3Jlc3BvbnNlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6LCD55So6ICF5o6l5pS25a6M6KKr6LCD55So6ICF5Lyg5Zue55qE5paH5Lu25LmL5ZCO77yM6YCa55+l6KKr6LCD55So6ICF5q2k5qyh6LCD55So6K+35rGC5b275bqV57uT5p2f44CCXHJcbiAgICAgKiDlpoLmnpzooqvosIPnlKjogIXlnKhpbnZva2VfcmVzcG9uc2XkuK3msqHmnInov5Tlm57mlofku7bliJnkuI3pnIDopoHov5Tlm57or6Xmtojmga/jgIJcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgICAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmluaXNoICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAvL+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgLy/ooqvosIPnlKjogIUgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICByZXNwb25zZU1lc3NhZ2VJRDpudW1iZXIgICAgLy/lk43lupTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiBdICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrooqvosIPnlKjogIXmlLbliLDov5nmnaHmtojmga/lkI7lsLHnq4vljbPmuIXnkIbotYTmupDvvIzkuI3lho3lk43lupTlhbPkuo7ov5nmnaHmtojmga/nmoTku7vkvZXor7fmsYLjgIJcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbmlzaCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiiq+iwg+eUqOiAheWcqOWkhOeQhuivt+axgueahOi/h+eoi+S4reWHuueOsOS6humUmeivryzlkYrnn6XosIPnlKjogIXplJnor6/nmoTljp/lm6DjgIJcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9mYWlsZWQgICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgIC8v6KKr6LCD55So6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAvL+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgcmVxdWVzdE1lc3NhZ2VJRDpudW1iZXIgICAgIC8v6LCD55So6ICF5omA6K6+572u55qE5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICBlcnJvcjpzdHJpbmcgICAgICAgICAgICAgICAgLy/opoHlj43ppojnmoTlpLHotKXljp/lm6AgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrlvZPmiormtojmga/lj5Hlh7rljrvkuYvlkI7ooqvosIPnlKjogIXlsLHnq4vljbPmuIXnkIbotYTmupDvvIzkuI3lho3lk43lupTlhbPkuo7ov5nmnaHmtojmga/nmoTku7vkvZXor7fmsYLjgIJcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZhaWxlZCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiOt+WPlmludm9rZV9yZXF1ZXN05oiWaW52b2tlX3Jlc3BvbnNl6L+H56iL5Lit5omA5YyF5ZCr55qE5paH5Lu254mH5q61XHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmlsZV9yZXF1ZXN0ICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgICAgIC8v5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAgICAgLy/mjqXmlLbogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy/mtojmga/nvJblj7fvvIjor7fmsYLml7bmmK9yZXF1ZXN0TWVzc2FnZUlE77yM5ZON5bqU5pe25pivcmVzcG9uc2VNZXNzYWdlSUTvvIkgICAgICAgXHJcbiAgICAgKiAgICAgIGlkOm51bWJlciAgICAgICAgICAgLy/mlofku7bnvJblj7cgICAgXHJcbiAgICAgKiAgICAgIGluZGV4Om51bWJlciAgICAgICAgLy/mlofku7bniYfmrrXntKLlvJXjgILms6jmhI/vvJrkuYvliY3or7fmsYLov4fnmoTniYfmrrXkuI3lhYHorrjph43lpI3or7fmsYLvvIzor7fmsYLnmoTntKLlvJXnvJblj7flupTlvZPkuIDmrKHmr5TkuIDmrKHlpKfvvIzlkKbliJnkvJrooqvlvZPmiJDkvKDovpPplJnor6/jgIIgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5b2T5oqKaW52b2tlX2ZpbGVfcmVxdWVzdOWPkemAgeWHuuWOu+S5i+WQjijkuI3nrqHmtojmga/njrDlnKjmmK/lnKjnvJPlhrLpmJ/liJfkuK3ov5jmmK/nnJ/nmoTlt7Lnu4/lj5Hlh7rljrvkuoYp77yM5Y+R6YCB6ICF5bCx5byA5aeL5YCS6K6h5pe277yM5pe26ZW/5Li6M+WIhumSn++8jOi2hei/hzPliIbpkp/lsLHliKTlrpror7fmsYLotoXml7bjgIJcclxuICAgICAqIOi/meS4gOi/h+eoi+ebtOWIsOaUtuWIsOaOpeaUtuiAheS8oOWbnueahGludm9rZV9maWxlX3Jlc3BvbnNl5oiWaW52b2tlX2ZpbGVfZmFpbGVk5oiWaW52b2tlX2ZpbGVfZmluaXNo5Li65q2i44CCICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrmlofku7bnmoTmjqXmlLbogIXlupTlvZPpqozor4EgICAgIFxyXG4gICAgICogMS7mlofku7blnKjkvKDovpPov4fnqIvkuK3vvIzpobrluo8oaW5kZXgp5piv5ZCm5Y+R55Sf6ZSZ5LmxICAgICAgIFxyXG4gICAgICogMi7kuIvovb3liLDnmoTnnJ/lrp7mlofku7blpKflsI/lupTlvZPnrYnkuo7lj5HpgIHogIXmiYDmj4/ov7DnmoTlpKflsI9cclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbGVfcmVxdWVzdCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWTjeW6lGludm9rZV9maWxlX3JlcXVlc3Tor7fmsYJcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9maWxlX3Jlc3BvbnNlIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAgICAgLy/lj5HpgIHogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgICAgICAvL+aOpeaUtuiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL2ludm9rZV9maWxlX3JlcXVlc3TnmoTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGlkOm51bWJlciAgICAgICAgICAgLy/mlofku7bnvJblj7cgICAgXHJcbiAgICAgKiAgICAgIGluZGV4Om51bWJlciAgICAgICAgLy/mlofku7bniYfmrrXntKLlvJXnvJblj7cgICAgXHJcbiAgICAgKiAgICAgIGRhdGE6QnVmZmVyICAgICAgICAgLy/mlofku7bniYfmrrXlhoXlrrnvvIjpu5jorqTnmoTkuIDkuKrmlofku7bniYfmrrXnmoTlpKflsI/mmK81MTJrYu+8iSAgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrmlofku7bnmoTlj5HpgIHogIXlupTlvZPnoa7kv53kuI3lhYHorrjmjqXmlLbogIXph43lpI3kuIvovb3mn5DkuIDmlofku7bniYfmrrXjgIIgICAgXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9maWxlX3Jlc3BvbnNlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6YCa55+l6K+35rGC6ICFLOiOt+WPluaWh+S7tueJh+auteWksei0pSAgICAgICBcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9maWxlX2ZhaWxlZCAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAgICAgLy/lj5HpgIHogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgICAgICAvL+aOpeaUtuiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL2ludm9rZV9maWxlX3JlcXVlc3TnmoTmtojmga/nvJblj7cgICAgXHJcbiAgICAgKiAgICAgIGlkOm51bWJlciAgICAgICAgICAgLy/mlofku7bnvJblj7cgICAgICBcclxuICAgICAqICAgICAgZXJyb3I6c3RyaW5nICAgICAgICAvL+imgeWPjemmiOeahOWksei0peWOn+WboCAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muaKpemUmeWPquWPkemAgeS4gOasoe+8jOW5tuS4lOWPkemAgeS5i+WQjuWwseeri+WNs+a4heeQhuebuOWFs+i1hOa6kO+8jOS4jeWFgeiuuOWGjeivt+axguivpeaWh+S7tuS6hlxyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmlsZV9mYWlsZWQsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDpgJrnn6Xor7fmsYLogIUs5omA6K+35rGC55qE5paH5Lu254mH5q61aW5kZXjlt7Lnu4/otoXlh7rkuobojIPlm7TvvIjooajnpLrmlofku7bkvKDovpPlrozmiJDvvInjgILkuLvopoHmmK/pkojlr7nkuo7lj5HpgIHkuI3noa7lrprlpKflsI/mlofku7bogIzlh4blpIfnmoTjgIJcclxuICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbGVfZmluaXNoICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgICAgICAvL+WPkemAgeiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgICAgIC8v5o6l5pS26ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8vaW52b2tlX2ZpbGVfcmVxdWVzdOeahOa2iOaBr+e8luWPtyAgICAgIFxyXG4gICAgICogICAgICBpZDpudW1iZXIgICAgICAgICAgIC8v5paH5Lu257yW5Y+3ICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya6YCa55+l5Y+q5Y+R6YCB5LiA5qyh77yM5bm25LiU5Y+R6YCB5LmL5ZCO5bCx56uL5Y2z5riF55CG55u45YWz6LWE5rqQ77yM5LiN5YWB6K645YaN6K+35rGC6K+l5paH5Lu25LqGXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9maWxlX2ZpbmlzaCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIGJyb2FkY2FzdO+8miAgICAgXHJcbiAgICAgKiAxLmJyb2FkY2FzdOWvuXBhdGjnmoTmoLzlvI/mnInnibnmroropoHmsYLvvIxwYXRo6YCa6L+HXCIuXCLmnaXliJLliIblsYLnuqfvvIzms6jlhozlnKjkuIrnuqfnmoTnm5HlkKzlmajlj6/ku6XmlLbliLDmiYDmnInlj5Hnu5nlhbbkuIvnuqfnmoTlub/mkq3jgIIgICBcclxuICAgICAqICAg5L6L5aaCXCJuYW1lc3BhY2UuYS5iXCIsIOazqOWGjOWcqFwibmFtZXNwYWNlLmFcIuS4iueahOebkeWQrOWZqOS4jeS7heWPr+S7peaUtuWIsHBhdGjkuLpcIm5hbWVzcGFjZS5hXCLnmoTlub/mkq3vvIzov5jlj6/ku6XmlLbliLBwYXRo5Li6XCJuYW1lc3BhY2UuYS5iXCLnmoTlub/mkq3jgIJcclxuICAgICAqICAg5ZCM55CG77yM5rOo5YaM5ZyoXCJuYW1lc3BhY2VcIuS4iueahOebkeWQrOWZqOWPr+S7peaUtuWIsFwibmFtZXNwYWNlXCLjgIFcIm5hbWVzcGFjZS5hXCLjgIFcIm5hbWVzcGFjZS5hLmJcIuOAglxyXG4gICAgICovXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlj5HpgIHogIXlr7nlpJblj5Hlh7rlub/mkq1cclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGJyb2FkY2FzdCAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAvL+W5v+aSreeahOWPkemAgeiAhSAgICAgICBcclxuICAgICAqICAgICAgcGF0aDpzdHJpbmcgICAgICAgICAvL+W5v+aSreeahOi3r+W+hCAgICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBkYXRhOmFueSAgICAgICAgICAgIC8v6KaB5Y+R6YCB55qE5pWw5o2u77yM6L+Z5Liq5Zyo5Y+R6YCB5YmN5Lya6KKr5bqP5YiX5YyW5oiQSlNPTiAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWRiuefpXdlYnNvY2tldOeahOWPpuS4gOerr++8jOeOsOWcqOafkOS4gOi3r+W+hOS4iueahOW5v+aSreacieS6uuWcqOebkeWQrOS6hlxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gYnJvYWRjYXN0X29wZW4gICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiBdICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgICAgICAvL+a2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgYnJvYWRjYXN0U2VuZGVyOnN0cmluZyAgIC8v5bm/5pKt55qE5Y+R6YCB6ICFICAgICAgXHJcbiAgICAgKiAgICAgIHBhdGg6c3RyaW5nICAgICAgICAgICAgICAvL+W5v+aSreeahOi3r+W+hCAgICAgICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOWcqOS4i+mdouS4pOenjeaDheWGteS4i+aJjemcgOimgeWPkemAgeivpea2iOaBr1xyXG4gICAgICogMS4g55So5oi35Zyo5paw55qE6Lev5b6E5LiK5rOo5YaM5LqG5bm/5pKtXHJcbiAgICAgKiAyLiDlvZPnvZHnu5zov57mjqXmlq3lvIDvvIzph43mlrDov57mjqXkuYvlkI7vvIzpnIDopoHlsIbkuYvliY3ms6jlhozov4fnmoTlub/mkq3ot6/lvoTlho3ph43mlrDpgJrnn6Xlr7nmlrnkuIDpgY3jgIIgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya5aaC5p6c5a+55pa55ZyoM+WIhumSn+S5i+WGheayoeacieWbnuW6lOWImemHjeaWsOWGjeWPkeS4gOasoe+8jOebtOWIsOaUtuWIsOWvueaWueWbnuW6lOaIlue9kee7nOaWreW8gOS4uuatouOAglxyXG4gICAgICovXHJcbiAgICBicm9hZGNhc3Rfb3BlbixcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWRiuefpXdlYnNvY2tldOeahOWPpuS4gOerr++8jOS5i+WJjeeahGJyb2FkY2FzdF9vcGVu5bey57uP6KKr5q2j56Gu5aSE55CG5LqGXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3Rfb3Blbl9maW5pc2ggICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy9icm9hZGNhc3Rfb3BlbuaJgOiuvue9rueahOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrlvZPnvZHnu5zov57mjqXmlq3lvIDlkI7vvIzlj4zmlrnpg73lupTnm7TmjqXmuIXnkIbmjonlr7nmlrnkuYvliY3ms6jlhozov4fnmoTlub/mkq3ot6/lvoTjgIJcclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0X29wZW5fZmluaXNoLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZGK55+ld2Vic29ja2V055qE5Y+m5LiA56uv77yM546w5Zyo5p+Q5LiA6Lev5b6E5LiK55qE5bm/5pKt5bey57uP5rKh5pyJ5Lq655uR5ZCs5LqGXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3RfY2xvc2UgICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIGJyb2FkY2FzdFNlbmRlcjpzdHJpbmcgICAgLy/lub/mkq3nmoTlj5HpgIHogIUgICAgICBcclxuICAgICAqICAgICAgcGF0aDpzdHJpbmcgICAgICAgICAgICAgICAvL+W5v+aSreeahOi3r+W+hCAgICAgICAgIFxyXG4gICAgICogICAgICBpbmNsdWRlQW5jZXN0b3IgICAgICAgICAgIC8v5piv5ZCm5oqKcGF0aOeahOaJgOacieeItue6p+ebkeWQrOWZqOS5n+S4gOW5tuWPlua2iOS6hu+8jOm7mOiupGZhbHNl44CC6L+Z5Liq5Li76KaB55So5LqO77yM5b2T5pS25Yiw5LqG5LiA5Liq6Ieq5bex5rKh5pyJ5rOo5YaM6L+H55qE5bm/5pKt77yM6ZyA6KaB5ZGK55+l5Y+R6YCB6ICF5Lul5ZCO5LiN6KaB5YaN5Y+R6YCB6K+l5bm/5pKt5Lul5Y+K5YW254i257qn55qE5omA5pyJ5bm/5pKt44CCICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlnKjkuIvpnaLkuKTnp43mg4XlhrXkuIvmiY3pnIDopoHlj5HpgIHor6Xmtojmga9cclxuICAgICAqIDEuIOeUqOaIt+WcqOafkOadoei3r+W+hOS4iuW3sue7j+ayoeacieazqOWGjOeahOacieW5v+aSreebkeWQrOWZqOS6hlxyXG4gICAgICogMi4g5b2T55So5oi35pS25Yiw5LqG6Ieq5bex5rKh5pyJ5rOo5YaM6L+H55qE5bm/5pKt55qE5pe25YCZ6YCa55+l5a+55pa544CC77yI5rOo5oSP77ya55Sx5LqO5LiN55+l6YGT5Zyo5a+55pa56Ieq5bex6L+Y5rOo5YaM5LqG5ZOq5Lqb55uR5ZCs5Zmo77yM5omA5Lul6ZyA6KaB5bCGaW5jbHVkZUFuY2VzdG9y6K6+572u5Li6dHJ1Ze+8iSAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlpIfms6jvvJrnlLHkuo7lr7nmlrnmmK/lkKbmlLbliLDku6Xlj4rmmK/lkKbmraPnoa7lpITnkIZicm9hZGNhc3RfY2xvc2Xlr7nns7vnu5/mraPluLjov5DooYzlubbkuI3kuqfnlJ/lvbHlk43vvIzmiYDku6XmsqHmnInmt7vliqBicm9hZGNhc3RfY2xvc2XlpITnkIblkI7lj43ppojmtojmga/nsbvlnotcclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0X2Nsb3NlLFxyXG5cclxuICAgIC8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t5LiL6Z2i5piv5LiA5Lqb5Zyo56iL5bqP5YaF6YOo5L2/55So55qE5raI5oGv77yM5LiN5Zyo572R57uc5LiK6L+b6KGM5Lyg6L6TLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb25uZWN0aW9uU29ja2V06L+e5o6l5omT5byAXHJcbiAgICAgKi9cclxuICAgIF9vbk9wZW4sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDb25uZWN0aW9uU29ja2V06L+e5o6l5pat5byAXHJcbiAgICAgKi9cclxuICAgIF9vbkNsb3NlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5YiS5Ye65LiA5Z2X5LqL5Lu256m66Ze0LOiusOW9leWvueaWueato+WcqOWvueWTquS6m+i3r+W+hOeahOW5v+aSreWxleW8gOebkeWQrFxyXG4gICAgICovXHJcbiAgICBfYnJvYWRjYXN0X3doaXRlX2xpc3RcclxufSJdfQ==
