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
     * 被调用者收到这条消息后就立即清理资源，不再响应关于这条消息的任何请求。
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
     */
    MessageType[MessageType["invoke_finish"] = 2] = "invoke_finish";
    /**
     * 被调用者在处理请求的过程中出现了错误,告知调用者错误的原因。
     * 当把消息发出去之后被调用者就立即清理资源，不再响应关于这条消息的任何请求。
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
     * 注意：文件的接收者应当验证
     * 1.文件在传输过程中，顺序(index)是否发生错乱，正确的应当是后一个index比前一个大1
     * 2.下载到的真实文件大小应当等于发送者所描述的大小
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
    /* -----------------------------------下面是一些在程序内部使用的消息，不再网络上进行传输------------------------------------ */
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImludGVyZmFjZXMvTWVzc2FnZVR5cGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7R0FFRztBQUNILElBQVksV0FvU1g7QUFwU0QsV0FBWSxXQUFXO0lBQ25COzs7O09BSUc7SUFFSDs7Ozs7T0FLRztJQUVIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0F3Qkc7SUFDSCxpRUFBYyxDQUFBO0lBRWQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FtQkc7SUFDSCxtRUFBZSxDQUFBO0lBRWY7Ozs7Ozs7Ozs7Ozs7OztPQWVHO0lBQ0gsK0RBQWEsQ0FBQTtJQUViOzs7Ozs7Ozs7Ozs7Ozs7T0FlRztJQUNILCtEQUFhLENBQUE7SUFFYjs7Ozs7Ozs7Ozs7Ozs7Ozs7O09Ba0JHO0lBQ0gsMkVBQW1CLENBQUE7SUFFbkI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQXFCRztJQUNILDZFQUFvQixDQUFBO0lBRXBCOzs7Ozs7Ozs7Ozs7Ozs7OztPQWlCRztJQUNILHlFQUFrQixDQUFBO0lBRWxCOzs7Ozs7Ozs7Ozs7Ozs7O09BZ0JHO0lBQ0gseUVBQWtCLENBQUE7SUFFbEI7Ozs7O09BS0c7SUFFSDs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsdURBQVMsQ0FBQTtJQUVUOzs7Ozs7Ozs7Ozs7Ozs7OztPQWlCRztJQUNILGlFQUFjLENBQUE7SUFFZDs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsZ0ZBQXFCLENBQUE7SUFFckI7Ozs7Ozs7Ozs7Ozs7Ozs7O09BaUJHO0lBQ0gsb0VBQWUsQ0FBQTtJQUVmOzs7Ozs7Ozs7OztPQVdHO0lBQ0gsa0ZBQXNCLENBQUE7SUFFdEIsc0dBQXNHO0lBRXRHOztPQUVHO0lBQ0gsb0RBQU8sQ0FBQTtJQUVQOztPQUVHO0lBQ0gsc0RBQVEsQ0FBQTtJQUVSOztPQUVHO0lBQ0gsZ0ZBQXFCLENBQUE7QUFDekIsQ0FBQyxFQXBTVyxXQUFXLEdBQVgsbUJBQVcsS0FBWCxtQkFBVyxRQW9TdEIiLCJmaWxlIjoiaW50ZXJmYWNlcy9NZXNzYWdlVHlwZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiDkvKDovpPmtojmga/nmoTnsbvlnovvvIzkuZ/lj6/ku6XmiorlroPnkIbop6PkuLrnirbmgIHnoIFcclxuICovXHJcbmV4cG9ydCBlbnVtIE1lc3NhZ2VUeXBlIHtcclxuICAgIC8qKlxyXG4gICAgICog5YWo5bGA77yaXHJcbiAgICAgKiAxLuaJgOaciea2iOaBr+WPkemAgeWQju+8jOWktOmDqOmDveS8muiiq+aJk+WMheaIkOS4gOS4qkpTT07mlbDnu4TvvIzlhbbpobrluo/noa7kv53mgLvmmK/nrKzkuIDpobnmmK90eXBl77yM56ys5LqM6aG55pivc2VuZGVy77yM56ys5LiJ6aG55pivcmVjZWl2ZXLvvIznrKzlm5vpobnmmK9wYXRo44CCXHJcbiAgICAgKiAyLnBhdGjnmoTmnIDlpKfplb/luqbkuLoyNTbkuKpVbmljb2Rl5a2X56ymXHJcbiAgICAgKi9cclxuXHJcbiAgICAvKipcclxuICAgICAqIGludm9rZe+8miAgICAgXHJcbiAgICAgKiAxLmludm9rZeWvuXBhdGjnmoTmoLzlvI/msqHmnInopoHmsYLvvIzkvYbmjqjojZDkvb/nlKhgL2DmnaXliJLliIblsYLnuqfvvIzmnIDlkI7kuIDkuKrkuLrmlrnms5XlkI3vvIzliY3pnaLnmoTnp7DkuLrlkb3lkI3nqbrpl7TvvIzov5nmoLflgZrmmK/kuLrkuobkvr/kuo7mnYPpmZDmjqfliLbjgIJcclxuICAgICAqICAg5L6L5aaCXCJuYW1lc3BhY2UvZnVuY3Rpb25OYW1lXCJcclxuICAgICAqIDIu5LiA5LiqcGF0aOS4iuWPquWFgeiuuOWvvOWHuuS4gOS4quaWueazleOAguWmguaenOmHjeWkjeWvvOWHuuWImeWQjumdoueahOW6lOivpeimhuebluaOieWJjemdoueahOOAglxyXG4gICAgICovXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjogIXlkJHooqvosIPnlKjogIXlj5Hlh7rosIPnlKjor7fmsYIgICAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfcmVxdWVzdCAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAvL+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgLy/ooqvosIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHBhdGg6c3RyaW5nICAgICAgICAgICAgIC8v6LCD55So5pa55rOV5omA5Zyo55qE6Lev5b6EICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICByZXF1ZXN0TWVzc2FnZUlEOm51bWJlciAgICAgLy/or7fmsYLmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGRhdGE6YW55ICAgICAgICAgICAgICAgICAgICAvL+imgeWPkemAgeeahOaVsOaNru+8jOi/meS4quWcqOWPkemAgeWJjeS8muiiq+W6j+WIl+WMluaIkEpTT04gICAgICAgXHJcbiAgICAgKiAgICAgIGZpbGVzOiBbICAgICAgICAgICAgICAgICAgICAvL+a2iOaBr+mZhOW4pueahOaWh+S7tiAgICAgICBcclxuICAgICAqICAgICAgICAgIGlkOm51bWJlciAgICAgICAgICAgICAgIC8v5paH5Lu257yW5Y+3ICAgIFxyXG4gICAgICogICAgICAgICAgc2l6ZTpudW1iZXJ8bnVsbCAgICAgICAgLy/mlofku7blpKflsI8oYnl0ZSnjgILlpoLmnpzmlofku7blpKflsI/kuI3noa7lrprliJnkuLpudWxsICAgIFxyXG4gICAgICogICAgICAgICAgc3BsaXROdW1iZXI6bnVtYmVyfG51bGwgLy/mlofku7booqvliIblibLmiJDkuoblpJrlsJHlnZco6IyD5Zu05pivMCA8PSBYIDwgZW5kKeOAguWmguaenOaWh+S7tuWkp+Wwj+S4jeehruWumuWImeS4um51bGwgICBcclxuICAgICAqICAgICAgICAgIG5hbWU6c3RyaW5nICAgICAgICAgICAgIC8v5paH5Lu25ZCNICAgIFxyXG4gICAgICogICAgICBdW10gICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlvZPmioppbnZva2VfcmVxdWVzdOWPkemAgeWHuuWOu+S5i+WQjijkuI3nrqHmtojmga/njrDlnKjmmK/lnKjnvJPlhrLpmJ/liJfkuK3ov5jmmK/nnJ/nmoTlt7Lnu4/lj5Hlh7rljrvkuoYp77yM6LCD55So6ICF5bCx5byA5aeL5YCS6K6h5pe277yM5pe26ZW/5Li6M+WIhumSn++8jOi2hei/hzPliIbpkp/lsLHliKTlrpror7fmsYLotoXml7bjgIJcclxuICAgICAqIOWmguaenOS4remAlOaUtuWIsOS6huiiq+iwg+eUqOiAheS8oOWbnueahGludm9rZV9maWxlX3JlcXVlc3Tor7fmsYLvvIzpgqPkuYjlsLHph43nva7lgJLorqHml7bvvIzov5nkuIDov4fnqIvnm7TliLDmlLbliLDooqvosIPnlKjogIXkvKDlm57nmoRpbnZva2VfcmVzcG9uc2XmiJZpbnZva2VfZmFpbGVk5Li65q2i44CCXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9yZXF1ZXN0LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6KKr6LCD55So6ICF5oiQ5Yqf5aSE55CG5a6M6K+35rGC77yM5bCG57uT5p6c6L+U5Zue57uZ6LCD55So6ICFXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfcmVzcG9uc2UgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAvL+iiq+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgLy/osIPnlKjogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHJlcXVlc3RNZXNzYWdlSUQ6bnVtYmVyICAgICAvL+ivt+axgua2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgcmVzcG9uc2VNZXNzYWdlSUQ6bnVtYmVyICAgIC8v5ZON5bqU5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICBkYXRhOmFueSAgICAgICAgICAgICAgICAgICAgLy/opoHlj43ppojnmoTmlbDmja7vvIzov5nkuKrlnKjlj5HpgIHliY3kvJrooqvluo/liJfljJbmiJBKU09OICAgICAgIFxyXG4gICAgICogICAgICBmaWxlczpbaWQ6bnVtYmVyLCBzaXplOm51bWJlcnxudWxsLCBzcGxpdE51bWJlcjpudW1iZXJ8bnVsbCwgbmFtZTpzdHJpbmddW10gICAgLy/lj43ppojmtojmga/pmYTluKbnmoTmlofku7YgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlpoLmnpzov5Tlm57nmoTnu5PmnpzkuK3ljIXlkKvmlofku7bvvIzpgqPkuYjlvZPmioppbnZva2VfcmVzcG9uc2Xlj5HpgIHlh7rljrvkuYvlkI4o5LiN566h5raI5oGv546w5Zyo5piv5Zyo57yT5Yay6Zif5YiX5Lit6L+Y5piv55yf55qE5bey57uP5Y+R5Ye65Y675LqGKe+8jOiiq+iwg+eUqOiAheWwseW8gOWni+WAkuiuoeaXtu+8jOaXtumVv+S4ujPliIbpkp/vvIzotoXov4cz5YiG6ZKf5bCx55u05o6l57uT5p2f5ZON5bqU77yM5riF55CG6LWE5rqQ44CCXHJcbiAgICAgKiDlpoLmnpzkuK3pgJTmlLbliLDkuobosIPnlKjogIXkvKDlm57nmoRpbnZva2VfZmlsZV9yZXF1ZXN06K+35rGC77yM6YKj5LmI5bCx6YeN572u5YCS6K6h5pe244CC6L+Z5LiA6L+H56iL55u05Yiw5pS25Yiw6LCD55So6ICF5Lyg5Zue55qEaW52b2tlX2ZpbmlzaOS4uuatouOAglxyXG4gICAgICovXHJcbiAgICBpbnZva2VfcmVzcG9uc2UsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjogIXmjqXmlLblrozooqvosIPnlKjogIXkvKDlm57nmoTmlofku7bkuYvlkI7vvIzpgJrnn6XooqvosIPnlKjogIXmraTmrKHosIPnlKjor7fmsYLlvbvlupXnu5PmnZ/jgIJcclxuICAgICAqIOWmguaenOiiq+iwg+eUqOiAheWcqGludm9rZV9yZXNwb25zZeS4reayoeaciei/lOWbnuaWh+S7tuWImeS4jemcgOimgei/lOWbnuivpea2iOaBr+OAglxyXG4gICAgICog6KKr6LCD55So6ICF5pS25Yiw6L+Z5p2h5raI5oGv5ZCO5bCx56uL5Y2z5riF55CG6LWE5rqQ77yM5LiN5YaN5ZON5bqU5YWz5LqO6L+Z5p2h5raI5oGv55qE5Lu75L2V6K+35rGC44CCXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICAgICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbmlzaCAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgLy/osIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgIC8v6KKr6LCD55So6ICFICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgcmVzcG9uc2VNZXNzYWdlSUQ6bnVtYmVyICAgIC8v5ZON5bqU5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogXSAgICBcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbmlzaCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiiq+iwg+eUqOiAheWcqOWkhOeQhuivt+axgueahOi/h+eoi+S4reWHuueOsOS6humUmeivryzlkYrnn6XosIPnlKjogIXplJnor6/nmoTljp/lm6DjgIJcclxuICAgICAqIOW9k+aKiua2iOaBr+WPkeWHuuWOu+S5i+WQjuiiq+iwg+eUqOiAheWwseeri+WNs+a4heeQhui1hOa6kO+8jOS4jeWGjeWTjeW6lOWFs+S6jui/meadoea2iOaBr+eahOS7u+S9leivt+axguOAglxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZhaWxlZCAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgLy/ooqvosIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgIC8v6LCD55So6ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICByZXF1ZXN0TWVzc2FnZUlEOm51bWJlciAgICAgLy/osIPnlKjogIXmiYDorr7nva7nmoTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGVycm9yOnN0cmluZyAgICAgICAgICAgICAgICAvL+imgeWPjemmiOeahOWksei0peWOn+WboCAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9mYWlsZWQsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDojrflj5ZpbnZva2VfcmVxdWVzdOaIlmludm9rZV9yZXNwb25zZei/h+eoi+S4reaJgOWMheWQq+eahOaWh+S7tueJh+autVxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbGVfcmVxdWVzdCAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgICAgICAvL+WPkemAgeiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgICAgIC8v5o6l5pS26ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8v5raI5oGv57yW5Y+377yI6K+35rGC5pe25pivcmVxdWVzdE1lc3NhZ2VJRO+8jOWTjeW6lOaXtuaYr3Jlc3BvbnNlTWVzc2FnZUlE77yJICAgICAgIFxyXG4gICAgICogICAgICBpZDpudW1iZXIgICAgICAgICAgIC8v5paH5Lu257yW5Y+3ICAgIFxyXG4gICAgICogICAgICBpbmRleDpudW1iZXIgICAgICAgIC8v5paH5Lu254mH5q6157Si5byV44CC5rOo5oSP77ya5LmL5YmN6K+35rGC6L+H55qE54mH5q615LiN5YWB6K646YeN5aSN6K+35rGC77yM6K+35rGC55qE57Si5byV57yW5Y+35bqU5b2T5LiA5qyh5q+U5LiA5qyh5aSn77yM5ZCm5YiZ5Lya6KKr5b2T5oiQ5Lyg6L6T6ZSZ6K+v44CCICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOW9k+aKimludm9rZV9maWxlX3JlcXVlc3Tlj5HpgIHlh7rljrvkuYvlkI4o5LiN566h5raI5oGv546w5Zyo5piv5Zyo57yT5Yay6Zif5YiX5Lit6L+Y5piv55yf55qE5bey57uP5Y+R5Ye65Y675LqGKe+8jOWPkemAgeiAheWwseW8gOWni+WAkuiuoeaXtu+8jOaXtumVv+S4ujPliIbpkp/vvIzotoXov4cz5YiG6ZKf5bCx5Yik5a6a6K+35rGC6LaF5pe244CCXHJcbiAgICAgKiDov5nkuIDov4fnqIvnm7TliLDmlLbliLDmjqXmlLbogIXkvKDlm57nmoRpbnZva2VfZmlsZV9yZXNwb25zZeaIlmludm9rZV9maWxlX2ZhaWxlZOaIlmludm9rZV9maWxlX2ZpbmlzaOS4uuatouOAgiAgICBcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbGVfcmVxdWVzdCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWTjeW6lGludm9rZV9maWxlX3JlcXVlc3Tor7fmsYJcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9maWxlX3Jlc3BvbnNlIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAgICAgLy/lj5HpgIHogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgICAgICAvL+aOpeaUtuiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL2ludm9rZV9maWxlX3JlcXVlc3TnmoTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGlkOm51bWJlciAgICAgICAgICAgLy/mlofku7bnvJblj7cgICAgXHJcbiAgICAgKiAgICAgIGluZGV4Om51bWJlciAgICAgICAgLy/mlofku7bniYfmrrXntKLlvJXnvJblj7cgICAgXHJcbiAgICAgKiAgICAgIGRhdGE6QnVmZmVyICAgICAgICAgLy/mlofku7bniYfmrrXlhoXlrrnvvIjpu5jorqTnmoTkuIDkuKrmlofku7bniYfmrrXnmoTlpKflsI/mmK81MTJrYu+8iSAgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrmlofku7bnmoTlj5HpgIHogIXlupTlvZPnoa7kv53kuI3lhYHorrjmjqXmlLbogIXph43lpI3kuIvovb3mn5DkuIDmlofku7bniYfmrrXjgIIgICAgXHJcbiAgICAgKiDms6jmhI/vvJrmlofku7bnmoTmjqXmlLbogIXlupTlvZPpqozor4EgICAgIFxyXG4gICAgICogMS7mlofku7blnKjkvKDovpPov4fnqIvkuK3vvIzpobrluo8oaW5kZXgp5piv5ZCm5Y+R55Sf6ZSZ5Lmx77yM5q2j56Gu55qE5bqU5b2T5piv5ZCO5LiA5LiqaW5kZXjmr5TliY3kuIDkuKrlpKcxICAgICAgIFxyXG4gICAgICogMi7kuIvovb3liLDnmoTnnJ/lrp7mlofku7blpKflsI/lupTlvZPnrYnkuo7lj5HpgIHogIXmiYDmj4/ov7DnmoTlpKflsI9cclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbGVfcmVzcG9uc2UsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDpgJrnn6Xor7fmsYLogIUs6I635Y+W5paH5Lu254mH5q615aSx6LSlICAgICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbGVfZmFpbGVkICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgICAgICAvL+WPkemAgeiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgICAgIC8v5o6l5pS26ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8vaW52b2tlX2ZpbGVfcmVxdWVzdOeahOa2iOaBr+e8luWPtyAgICBcclxuICAgICAqICAgICAgaWQ6bnVtYmVyICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgICAgIFxyXG4gICAgICogICAgICBlcnJvcjpzdHJpbmcgICAgICAgIC8v6KaB5Y+N6aaI55qE5aSx6LSl5Y6f5ZugICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5rOo5oSP77ya5oql6ZSZ5Y+q5Y+R6YCB5LiA5qyh77yM5bm25LiU5Y+R6YCB5LmL5ZCO5bCx56uL5Y2z5riF55CG55u45YWz6LWE5rqQ77yM5LiN5YWB6K645YaN6K+35rGC6K+l5paH5Lu25LqGXHJcbiAgICAgKi9cclxuICAgIGludm9rZV9maWxlX2ZhaWxlZCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOmAmuefpeivt+axguiAhSzmiYDor7fmsYLnmoTmlofku7bniYfmrrVpbmRleOW3sue7j+i2heWHuuS6huiMg+WbtO+8iOihqOekuuaWh+S7tuS8oOi+k+WujOaIkO+8ieOAguS4u+imgeaYr+mSiOWvueS6juWPkemAgeS4jeehruWumuWkp+Wwj+aWh+S7tuiAjOWHhuWkh+eahOOAglxyXG4gICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmlsZV9maW5pc2ggICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgICAgIC8v5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAgICAgLy/mjqXmlLbogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy9pbnZva2VfZmlsZV9yZXF1ZXN055qE5raI5oGv57yW5Y+3ICAgICAgXHJcbiAgICAgKiAgICAgIGlkOm51bWJlciAgICAgICAgICAgLy/mlofku7bnvJblj7cgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrpgJrnn6Xlj6rlj5HpgIHkuIDmrKHvvIzlubbkuJTlj5HpgIHkuYvlkI7lsLHnq4vljbPmuIXnkIbnm7jlhbPotYTmupDvvIzkuI3lhYHorrjlho3or7fmsYLor6Xmlofku7bkuoZcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbGVfZmluaXNoLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogYnJvYWRjYXN077yaICAgICBcclxuICAgICAqIDEuYnJvYWRjYXN05a+5cGF0aOeahOagvOW8j+acieeJueauiuimgeaxgu+8jHBhdGjpgJrov4dcIi5cIuadpeWIkuWIhuWxgue6p++8jOazqOWGjOWcqOS4iue6p+eahOebkeWQrOWZqOWPr+S7peaUtuWIsOaJgOacieWPkee7meWFtuS4i+e6p+eahOW5v+aSreOAgiAgIFxyXG4gICAgICogICDkvovlpoJcIm5hbWVzcGFjZS5hLmJcIiwg5rOo5YaM5ZyoXCJuYW1lc3BhY2UuYVwi5LiK55qE55uR5ZCs5Zmo5LiN5LuF5Y+v5Lul5pS25YiwcGF0aOS4ulwibmFtZXNwYWNlLmFcIueahOW5v+aSre+8jOi/mOWPr+S7peaUtuWIsHBhdGjkuLpcIm5hbWVzcGFjZS5hLmJcIueahOW5v+aSreOAglxyXG4gICAgICogICDlkIznkIbvvIzms6jlhozlnKhcIm5hbWVzcGFjZVwi5LiK55qE55uR5ZCs5Zmo5Y+v5Lul5pS25YiwXCJuYW1lc3BhY2VcIuOAgVwibmFtZXNwYWNlLmFcIuOAgVwibmFtZXNwYWNlLmEuYlwi44CCXHJcbiAgICAgKi9cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWPkemAgeiAheWvueWkluWPkeWHuuW5v+aSrVxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gYnJvYWRjYXN0ICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgIC8v5bm/5pKt55qE5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICBwYXRoOnN0cmluZyAgICAgICAgIC8v5bm/5pKt55qE6Lev5b6EICAgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIGRhdGE6YW55ICAgICAgICAgICAgLy/opoHlj5HpgIHnmoTmlbDmja7vvIzov5nkuKrlnKjlj5HpgIHliY3kvJrooqvluo/liJfljJbmiJBKU09OICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZGK55+ld2Vic29ja2V055qE5Y+m5LiA56uv77yM546w5Zyo5p+Q5LiA6Lev5b6E5LiK55qE5bm/5pKt5pyJ5Lq65Zyo55uR5ZCs5LqGXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3Rfb3BlbiAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqIF0gICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAgICAgIC8v5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICBicm9hZGNhc3RTZW5kZXI6c3RyaW5nICAgLy/lub/mkq3nmoTlj5HpgIHogIUgICAgICBcclxuICAgICAqICAgICAgcGF0aDpzdHJpbmcgICAgICAgICAgICAgIC8v5bm/5pKt55qE6Lev5b6EICAgICAgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5Zyo5LiL6Z2i5Lik56eN5oOF5Ya15LiL5omN6ZyA6KaB5Y+R6YCB6K+l5raI5oGvXHJcbiAgICAgKiAxLiDnlKjmiLflnKjmlrDnmoTot6/lvoTkuIrms6jlhozkuoblub/mkq1cclxuICAgICAqIDIuIOW9k+e9kee7nOi/nuaOpeaWreW8gO+8jOmHjeaWsOi/nuaOpeS5i+WQju+8jOmcgOimgeWwhuS5i+WJjeazqOWGjOi/h+eahOW5v+aSrei3r+W+hOWGjemHjeaWsOmAmuefpeWvueaWueS4gOmBjeOAglxyXG4gICAgICovXHJcbiAgICBicm9hZGNhc3Rfb3BlbixcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWRiuefpXdlYnNvY2tldOeahOWPpuS4gOerr++8jOS5i+WJjeeahGJyb2FkY2FzdF9vcGVu5bey57uP6KKr5q2j56Gu5aSE55CG5LqGXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3Rfb3Blbl9maW5pc2ggICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy9icm9hZGNhc3Rfb3BlbuaJgOiuvue9rueahOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrlvZPnvZHnu5zov57mjqXmlq3lvIDlkI7vvIzlj4zmlrnpg73lupTnm7TmjqXmuIXnkIbmjonlr7nmlrnkuYvliY3ms6jlhozov4fnmoTlub/mkq3ot6/lvoTjgIJcclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0X29wZW5fZmluaXNoLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZGK55+ld2Vic29ja2V055qE5Y+m5LiA56uv77yM546w5Zyo5p+Q5LiA6Lev5b6E5LiK55qE5bm/5pKt5bey57uP5rKh5pyJ5Lq655uR5ZCs5LqGXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3RfY2xvc2UgICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgICAgICAgLy/mtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGJyb2FkY2FzdFNlbmRlcjpzdHJpbmcgICAgLy/lub/mkq3nmoTlj5HpgIHogIUgICAgICBcclxuICAgICAqICAgICAgcGF0aDpzdHJpbmcgICAgICAgICAgICAgICAvL+W5v+aSreeahOi3r+W+hCAgICAgICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOWcqOS4i+mdouS4pOenjeaDheWGteS4i+aJjemcgOimgeWPkemAgeivpea2iOaBr1xyXG4gICAgICogMS4g55So5oi35Zyo5p+Q5p2h6Lev5b6E5LiK5bey57uP5rKh5pyJ5rOo5YaM55qE5pyJ5bm/5pKt55uR5ZCs5Zmo5LqGXHJcbiAgICAgKiAyLiDlvZPnlKjmiLfmlLbliLDkuoboh6rlt7HmsqHmnInms6jlhozov4fnmoTlub/mkq3nmoTml7blgJnpgJrnn6Xlr7nmlrnjgIJcclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0X2Nsb3NlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZGK55+ld2Vic29ja2V055qE5Y+m5LiA56uv77yM5LmL5YmN55qEYnJvYWRjYXN0X2Nsb3Nl5bey57uP6KKr5q2j56Gu5aSE55CG5LqGXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3RfY2xvc2VfZmluaXNoICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8vYnJvYWRjYXN0X2Nsb3Nl5omA6K6+572u55qE5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdF9jbG9zZV9maW5pc2gsXHJcblxyXG4gICAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS3kuIvpnaLmmK/kuIDkupvlnKjnqIvluo/lhoXpg6jkvb/nlKjnmoTmtojmga/vvIzkuI3lho3nvZHnu5zkuIrov5vooYzkvKDovpMtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gKi9cclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbm5lY3Rpb25Tb2NrZXTov57mjqXmiZPlvIBcclxuICAgICAqL1xyXG4gICAgX29uT3BlbixcclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbm5lY3Rpb25Tb2NrZXTov57mjqXmlq3lvIBcclxuICAgICAqL1xyXG4gICAgX29uQ2xvc2UsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliJLlh7rkuIDlnZfkuovku7bnqbrpl7Qs6K6w5b2V5a+55pa55q2j5Zyo5a+55ZOq5Lqb6Lev5b6E55qE5bm/5pKt5bGV5byA55uR5ZCsXHJcbiAgICAgKi9cclxuICAgIF9icm9hZGNhc3Rfd2hpdGVfbGlzdFxyXG59Il19
