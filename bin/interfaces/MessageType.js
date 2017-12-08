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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImludGVyZmFjZXMvTWVzc2FnZVR5cGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7R0FFRztBQUNILElBQVksV0FzU1g7QUF0U0QsV0FBWSxXQUFXO0lBQ25COzs7O09BSUc7SUFFSDs7Ozs7T0FLRztJQUVIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0F3Qkc7SUFDSCxpRUFBYyxDQUFBO0lBRWQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FtQkc7SUFDSCxtRUFBZSxDQUFBO0lBRWY7Ozs7Ozs7Ozs7Ozs7Ozs7T0FnQkc7SUFDSCwrREFBYSxDQUFBO0lBRWI7Ozs7Ozs7Ozs7Ozs7Ozs7T0FnQkc7SUFDSCwrREFBYSxDQUFBO0lBRWI7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQWtCRztJQUNILDJFQUFtQixDQUFBO0lBRW5COzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FxQkc7SUFDSCw2RUFBb0IsQ0FBQTtJQUVwQjs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FpQkc7SUFDSCx5RUFBa0IsQ0FBQTtJQUVsQjs7Ozs7Ozs7Ozs7Ozs7OztPQWdCRztJQUNILHlFQUFrQixDQUFBO0lBRWxCOzs7OztPQUtHO0lBRUg7Ozs7Ozs7Ozs7Ozs7T0FhRztJQUNILHVEQUFTLENBQUE7SUFFVDs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FpQkc7SUFDSCxpRUFBYyxDQUFBO0lBRWQ7Ozs7Ozs7Ozs7Ozs7T0FhRztJQUNILGdGQUFxQixDQUFBO0lBRXJCOzs7Ozs7Ozs7Ozs7Ozs7OztPQWlCRztJQUNILG9FQUFlLENBQUE7SUFFZjs7Ozs7Ozs7Ozs7T0FXRztJQUNILGtGQUFzQixDQUFBO0lBRXRCLHNHQUFzRztJQUV0Rzs7T0FFRztJQUNILG9EQUFPLENBQUE7SUFFUDs7T0FFRztJQUNILHNEQUFRLENBQUE7SUFFUjs7T0FFRztJQUNILGdGQUFxQixDQUFBO0FBQ3pCLENBQUMsRUF0U1csV0FBVyxHQUFYLG1CQUFXLEtBQVgsbUJBQVcsUUFzU3RCIiwiZmlsZSI6ImludGVyZmFjZXMvTWVzc2FnZVR5cGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICog5Lyg6L6T5raI5oGv55qE57G75Z6L77yM5Lmf5Y+v5Lul5oqK5a6D55CG6Kej5Li654q25oCB56CBXHJcbiAqL1xyXG5leHBvcnQgZW51bSBNZXNzYWdlVHlwZSB7XHJcbiAgICAvKipcclxuICAgICAqIOWFqOWxgO+8mlxyXG4gICAgICogMS7miYDmnInmtojmga/lj5HpgIHlkI7vvIzlpLTpg6jpg73kvJrooqvmiZPljIXmiJDkuIDkuKpKU09O5pWw57uE77yM5YW26aG65bqP56Gu5L+d5oC75piv56ys5LiA6aG55pivdHlwZe+8jOesrOS6jOmhueaYr3NlbmRlcu+8jOesrOS4iemhueaYr3JlY2VpdmVy77yM56ys5Zub6aG55pivcGF0aOOAglxyXG4gICAgICogMi5wYXRo55qE5pyA5aSn6ZW/5bqm5Li6MjU25LiqVW5pY29kZeWtl+esplxyXG4gICAgICovXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBpbnZva2XvvJogICAgIFxyXG4gICAgICogMS5pbnZva2Xlr7lwYXRo55qE5qC85byP5rKh5pyJ6KaB5rGC77yM5L2G5o6o6I2Q5L2/55SoYC9g5p2l5YiS5YiG5bGC57qn77yM5pyA5ZCO5LiA5Liq5Li65pa55rOV5ZCN77yM5YmN6Z2i55qE56ew5Li65ZG95ZCN56m66Ze077yM6L+Z5qC35YGa5piv5Li65LqG5L6/5LqO5p2D6ZmQ5o6n5Yi244CCXHJcbiAgICAgKiAgIOS+i+WmglwibmFtZXNwYWNlL2Z1bmN0aW9uTmFtZVwiXHJcbiAgICAgKiAyLuS4gOS4qnBhdGjkuIrlj6rlhYHorrjlr7zlh7rkuIDkuKrmlrnms5XjgILlpoLmnpzph43lpI3lr7zlh7rliJnlkI7pnaLnmoTlupTor6Xopobnm5bmjonliY3pnaLnmoTjgIJcclxuICAgICAqL1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6LCD55So6ICF5ZCR6KKr6LCD55So6ICF5Y+R5Ye66LCD55So6K+35rGCICAgICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX3JlcXVlc3QgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgLy/osIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgIC8v6KKr6LCD55So6ICFICAgICAgIFxyXG4gICAgICogICAgICBwYXRoOnN0cmluZyAgICAgICAgICAgICAvL+iwg+eUqOaWueazleaJgOWcqOeahOi3r+W+hCAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgcmVxdWVzdE1lc3NhZ2VJRDpudW1iZXIgICAgIC8v6K+35rGC5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICBkYXRhOmFueSAgICAgICAgICAgICAgICAgICAgLy/opoHlj5HpgIHnmoTmlbDmja7vvIzov5nkuKrlnKjlj5HpgIHliY3kvJrooqvluo/liJfljJbmiJBKU09OICAgICAgIFxyXG4gICAgICogICAgICBmaWxlczogWyAgICAgICAgICAgICAgICAgICAgLy/mtojmga/pmYTluKbnmoTmlofku7YgICAgICAgXHJcbiAgICAgKiAgICAgICAgICBpZDpudW1iZXIgICAgICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgICBcclxuICAgICAqICAgICAgICAgIHNpemU6bnVtYmVyfG51bGwgICAgICAgIC8v5paH5Lu25aSn5bCPKGJ5dGUp44CC5aaC5p6c5paH5Lu25aSn5bCP5LiN56Gu5a6a5YiZ5Li6bnVsbCAgICBcclxuICAgICAqICAgICAgICAgIHNwbGl0TnVtYmVyOm51bWJlcnxudWxsIC8v5paH5Lu26KKr5YiG5Ymy5oiQ5LqG5aSa5bCR5Z2XKOiMg+WbtOaYrzAgPD0gWCA8IGVuZCnjgILlpoLmnpzmlofku7blpKflsI/kuI3noa7lrprliJnkuLpudWxsICAgXHJcbiAgICAgKiAgICAgICAgICBuYW1lOnN0cmluZyAgICAgICAgICAgICAvL+aWh+S7tuWQjSAgICBcclxuICAgICAqICAgICAgXVtdICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIFxyXG4gICAgICog5b2T5oqKaW52b2tlX3JlcXVlc3Tlj5HpgIHlh7rljrvkuYvlkI4o5LiN566h5raI5oGv546w5Zyo5piv5Zyo57yT5Yay6Zif5YiX5Lit6L+Y5piv55yf55qE5bey57uP5Y+R5Ye65Y675LqGKe+8jOiwg+eUqOiAheWwseW8gOWni+WAkuiuoeaXtu+8jOaXtumVv+S4ujPliIbpkp/vvIzotoXov4cz5YiG6ZKf5bCx5Yik5a6a6K+35rGC6LaF5pe244CCXHJcbiAgICAgKiDlpoLmnpzkuK3pgJTmlLbliLDkuobooqvosIPnlKjogIXkvKDlm57nmoRpbnZva2VfZmlsZV9yZXF1ZXN06K+35rGC77yM6YKj5LmI5bCx6YeN572u5YCS6K6h5pe277yM6L+Z5LiA6L+H56iL55u05Yiw5pS25Yiw6KKr6LCD55So6ICF5Lyg5Zue55qEaW52b2tlX3Jlc3BvbnNl5oiWaW52b2tlX2ZhaWxlZOS4uuatouOAglxyXG4gICAgICovXHJcbiAgICBpbnZva2VfcmVxdWVzdCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiiq+iwg+eUqOiAheaIkOWKn+WkhOeQhuWujOivt+axgu+8jOWwhue7k+aenOi/lOWbnue7meiwg+eUqOiAhVxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX3Jlc3BvbnNlICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgLy/ooqvosIPnlKjogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgIC8v6LCD55So6ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICByZXF1ZXN0TWVzc2FnZUlEOm51bWJlciAgICAgLy/or7fmsYLmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIHJlc3BvbnNlTWVzc2FnZUlEOm51bWJlciAgICAvL+WTjeW6lOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgZGF0YTphbnkgICAgICAgICAgICAgICAgICAgIC8v6KaB5Y+N6aaI55qE5pWw5o2u77yM6L+Z5Liq5Zyo5Y+R6YCB5YmN5Lya6KKr5bqP5YiX5YyW5oiQSlNPTiAgICAgICBcclxuICAgICAqICAgICAgZmlsZXM6W2lkOm51bWJlciwgc2l6ZTpudW1iZXJ8bnVsbCwgc3BsaXROdW1iZXI6bnVtYmVyfG51bGwsIG5hbWU6c3RyaW5nXVtdICAgIC8v5Y+N6aaI5raI5oGv6ZmE5bim55qE5paH5Lu2ICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIFxyXG4gICAgICog5aaC5p6c6L+U5Zue55qE57uT5p6c5Lit5YyF5ZCr5paH5Lu277yM6YKj5LmI5b2T5oqKaW52b2tlX3Jlc3BvbnNl5Y+R6YCB5Ye65Y675LmL5ZCOKOS4jeeuoea2iOaBr+eOsOWcqOaYr+WcqOe8k+WGsumYn+WIl+S4rei/mOaYr+ecn+eahOW3sue7j+WPkeWHuuWOu+S6hinvvIzooqvosIPnlKjogIXlsLHlvIDlp4vlgJLorqHml7bvvIzml7bplb/kuLoz5YiG6ZKf77yM6LaF6L+HM+WIhumSn+WwseebtOaOpee7k+adn+WTjeW6lO+8jOa4heeQhui1hOa6kOOAglxyXG4gICAgICog5aaC5p6c5Lit6YCU5pS25Yiw5LqG6LCD55So6ICF5Lyg5Zue55qEaW52b2tlX2ZpbGVfcmVxdWVzdOivt+axgu+8jOmCo+S5iOWwsemHjee9ruWAkuiuoeaXtuOAgui/meS4gOi/h+eoi+ebtOWIsOaUtuWIsOiwg+eUqOiAheS8oOWbnueahGludm9rZV9maW5pc2jkuLrmraLjgIJcclxuICAgICAqL1xyXG4gICAgaW52b2tlX3Jlc3BvbnNlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6LCD55So6ICF5o6l5pS25a6M6KKr6LCD55So6ICF5Lyg5Zue55qE5paH5Lu25LmL5ZCO77yM6YCa55+l6KKr6LCD55So6ICF5q2k5qyh6LCD55So6K+35rGC5b275bqV57uT5p2f44CCXHJcbiAgICAgKiDlpoLmnpzooqvosIPnlKjogIXlnKhpbnZva2VfcmVzcG9uc2XkuK3msqHmnInov5Tlm57mlofku7bliJnkuI3pnIDopoHov5Tlm57or6Xmtojmga/jgIJcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgICAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmluaXNoICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAvL+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgLy/ooqvosIPnlKjogIUgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICByZXNwb25zZU1lc3NhZ2VJRDpudW1iZXIgICAgLy/lk43lupTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiBdICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrooqvosIPnlKjogIXmlLbliLDov5nmnaHmtojmga/lkI7lsLHnq4vljbPmuIXnkIbotYTmupDvvIzkuI3lho3lk43lupTlhbPkuo7ov5nmnaHmtojmga/nmoTku7vkvZXor7fmsYLjgIJcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbmlzaCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiiq+iwg+eUqOiAheWcqOWkhOeQhuivt+axgueahOi/h+eoi+S4reWHuueOsOS6humUmeivryzlkYrnn6XosIPnlKjogIXplJnor6/nmoTljp/lm6DjgIJcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9mYWlsZWQgICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgIC8v6KKr6LCD55So6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAvL+iwg+eUqOiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgcmVxdWVzdE1lc3NhZ2VJRDpudW1iZXIgICAgIC8v6LCD55So6ICF5omA6K6+572u55qE5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogICAgICBlcnJvcjpzdHJpbmcgICAgICAgICAgICAgICAgLy/opoHlj43ppojnmoTlpLHotKXljp/lm6AgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrlvZPmiormtojmga/lj5Hlh7rljrvkuYvlkI7ooqvosIPnlKjogIXlsLHnq4vljbPmuIXnkIbotYTmupDvvIzkuI3lho3lk43lupTlhbPkuo7ov5nmnaHmtojmga/nmoTku7vkvZXor7fmsYLjgIJcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZhaWxlZCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOiOt+WPlmludm9rZV9yZXF1ZXN05oiWaW52b2tlX3Jlc3BvbnNl6L+H56iL5Lit5omA5YyF5ZCr55qE5paH5Lu254mH5q61XHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmlsZV9yZXF1ZXN0ICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgICAgIC8v5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAgICAgLy/mjqXmlLbogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy/mtojmga/nvJblj7fvvIjor7fmsYLml7bmmK9yZXF1ZXN0TWVzc2FnZUlE77yM5ZON5bqU5pe25pivcmVzcG9uc2VNZXNzYWdlSUTvvIkgICAgICAgXHJcbiAgICAgKiAgICAgIGlkOm51bWJlciAgICAgICAgICAgLy/mlofku7bnvJblj7cgICAgXHJcbiAgICAgKiAgICAgIGluZGV4Om51bWJlciAgICAgICAgLy/mlofku7bniYfmrrXntKLlvJXjgILms6jmhI/vvJrkuYvliY3or7fmsYLov4fnmoTniYfmrrXkuI3lhYHorrjph43lpI3or7fmsYLvvIzor7fmsYLnmoTntKLlvJXnvJblj7flupTlvZPkuIDmrKHmr5TkuIDmrKHlpKfvvIzlkKbliJnkvJrooqvlvZPmiJDkvKDovpPplJnor6/jgIIgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5b2T5oqKaW52b2tlX2ZpbGVfcmVxdWVzdOWPkemAgeWHuuWOu+S5i+WQjijkuI3nrqHmtojmga/njrDlnKjmmK/lnKjnvJPlhrLpmJ/liJfkuK3ov5jmmK/nnJ/nmoTlt7Lnu4/lj5Hlh7rljrvkuoYp77yM5Y+R6YCB6ICF5bCx5byA5aeL5YCS6K6h5pe277yM5pe26ZW/5Li6M+WIhumSn++8jOi2hei/hzPliIbpkp/lsLHliKTlrpror7fmsYLotoXml7bjgIJcclxuICAgICAqIOi/meS4gOi/h+eoi+ebtOWIsOaUtuWIsOaOpeaUtuiAheS8oOWbnueahGludm9rZV9maWxlX3Jlc3BvbnNl5oiWaW52b2tlX2ZpbGVfZmFpbGVk5oiWaW52b2tlX2ZpbGVfZmluaXNo5Li65q2i44CCICAgIFxyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmlsZV9yZXF1ZXN0LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZON5bqUaW52b2tlX2ZpbGVfcmVxdWVzdOivt+axglxyXG4gICAgICogXHJcbiAgICAgKiDlpLTpg6jmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICB0eXBlID0gaW52b2tlX2ZpbGVfcmVzcG9uc2UgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgICAgICAgICAvL+WPkemAgeiAhSAgICAgICBcclxuICAgICAqICAgICAgcmVjZWl2ZXI6c3RyaW5nICAgICAgICAgICAgIC8v5o6l5pS26ICFICAgICAgIFxyXG4gICAgICogXSAgICAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgIC8vaW52b2tlX2ZpbGVfcmVxdWVzdOeahOa2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgaWQ6bnVtYmVyICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgICBcclxuICAgICAqICAgICAgaW5kZXg6bnVtYmVyICAgICAgICAvL+aWh+S7tueJh+autee0ouW8lee8luWPtyAgICBcclxuICAgICAqICAgICAgZGF0YTpCdWZmZXIgICAgICAgICAvL+aWh+S7tueJh+auteWGheWuue+8iOm7mOiupOeahOS4gOS4quaWh+S7tueJh+auteeahOWkp+Wwj+aYrzUxMmti77yJICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muaWh+S7tueahOWPkemAgeiAheW6lOW9k+ehruS/neS4jeWFgeiuuOaOpeaUtuiAhemHjeWkjeS4i+i9veafkOS4gOaWh+S7tueJh+auteOAgiAgICBcclxuICAgICAqIOazqOaEj++8muaWh+S7tueahOaOpeaUtuiAheW6lOW9k+mqjOivgSAgICAgXHJcbiAgICAgKiAxLuaWh+S7tuWcqOS8oOi+k+i/h+eoi+S4re+8jOmhuuW6jyhpbmRleCnmmK/lkKblj5HnlJ/plJnkubHvvIzmraPnoa7nmoTlupTlvZPmmK/lkI7kuIDkuKppbmRleOavlOWJjeS4gOS4quWkpzEgICAgICAgXHJcbiAgICAgKiAyLuS4i+i9veWIsOeahOecn+WunuaWh+S7tuWkp+Wwj+W6lOW9k+etieS6juWPkemAgeiAheaJgOaPj+i/sOeahOWkp+Wwj1xyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmlsZV9yZXNwb25zZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOmAmuefpeivt+axguiAhSzojrflj5bmlofku7bniYfmrrXlpLHotKUgICAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBpbnZva2VfZmlsZV9mYWlsZWQgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqICAgICAgc2VuZGVyOnN0cmluZyAgICAgICAgICAgICAgIC8v5Y+R6YCB6ICFICAgICAgIFxyXG4gICAgICogICAgICByZWNlaXZlcjpzdHJpbmcgICAgICAgICAgICAgLy/mjqXmlLbogIUgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy9pbnZva2VfZmlsZV9yZXF1ZXN055qE5raI5oGv57yW5Y+3ICAgIFxyXG4gICAgICogICAgICBpZDpudW1iZXIgICAgICAgICAgIC8v5paH5Lu257yW5Y+3ICAgICAgXHJcbiAgICAgKiAgICAgIGVycm9yOnN0cmluZyAgICAgICAgLy/opoHlj43ppojnmoTlpLHotKXljp/lm6AgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrmiqXplJnlj6rlj5HpgIHkuIDmrKHvvIzlubbkuJTlj5HpgIHkuYvlkI7lsLHnq4vljbPmuIXnkIbnm7jlhbPotYTmupDvvIzkuI3lhYHorrjlho3or7fmsYLor6Xmlofku7bkuoZcclxuICAgICAqL1xyXG4gICAgaW52b2tlX2ZpbGVfZmFpbGVkLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6YCa55+l6K+35rGC6ICFLOaJgOivt+axgueahOaWh+S7tueJh+autWluZGV45bey57uP6LaF5Ye65LqG6IyD5Zu077yI6KGo56S65paH5Lu25Lyg6L6T5a6M5oiQ77yJ44CC5Li76KaB5piv6ZKI5a+55LqO5Y+R6YCB5LiN56Gu5a6a5aSn5bCP5paH5Lu26ICM5YeG5aSH55qE44CCXHJcbiAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGludm9rZV9maWxlX2ZpbmlzaCAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogICAgICBzZW5kZXI6c3RyaW5nICAgICAgICAgICAgICAgLy/lj5HpgIHogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHJlY2VpdmVyOnN0cmluZyAgICAgICAgICAgICAvL+aOpeaUtuiAhSAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL2ludm9rZV9maWxlX3JlcXVlc3TnmoTmtojmga/nvJblj7cgICAgICBcclxuICAgICAqICAgICAgaWQ6bnVtYmVyICAgICAgICAgICAvL+aWh+S7tue8luWPtyAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8mumAmuefpeWPquWPkemAgeS4gOasoe+8jOW5tuS4lOWPkemAgeS5i+WQjuWwseeri+WNs+a4heeQhuebuOWFs+i1hOa6kO+8jOS4jeWFgeiuuOWGjeivt+axguivpeaWh+S7tuS6hlxyXG4gICAgICovXHJcbiAgICBpbnZva2VfZmlsZV9maW5pc2gsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBicm9hZGNhc3TvvJogICAgIFxyXG4gICAgICogMS5icm9hZGNhc3Tlr7lwYXRo55qE5qC85byP5pyJ54m55q6K6KaB5rGC77yMcGF0aOmAmui/h1wiLlwi5p2l5YiS5YiG5bGC57qn77yM5rOo5YaM5Zyo5LiK57qn55qE55uR5ZCs5Zmo5Y+v5Lul5pS25Yiw5omA5pyJ5Y+R57uZ5YW25LiL57qn55qE5bm/5pKt44CCICAgXHJcbiAgICAgKiAgIOS+i+WmglwibmFtZXNwYWNlLmEuYlwiLCDms6jlhozlnKhcIm5hbWVzcGFjZS5hXCLkuIrnmoTnm5HlkKzlmajkuI3ku4Xlj6/ku6XmlLbliLBwYXRo5Li6XCJuYW1lc3BhY2UuYVwi55qE5bm/5pKt77yM6L+Y5Y+v5Lul5pS25YiwcGF0aOS4ulwibmFtZXNwYWNlLmEuYlwi55qE5bm/5pKt44CCXHJcbiAgICAgKiAgIOWQjOeQhu+8jOazqOWGjOWcqFwibmFtZXNwYWNlXCLkuIrnmoTnm5HlkKzlmajlj6/ku6XmlLbliLBcIm5hbWVzcGFjZVwi44CBXCJuYW1lc3BhY2UuYVwi44CBXCJuYW1lc3BhY2UuYS5iXCLjgIJcclxuICAgICAqL1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Y+R6YCB6ICF5a+55aSW5Y+R5Ye65bm/5pKtXHJcbiAgICAgKiBcclxuICAgICAqIOWktOmDqOagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIHR5cGUgPSBicm9hZGNhc3QgICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiAgICAgIHNlbmRlcjpzdHJpbmcgICAgICAgLy/lub/mkq3nmoTlj5HpgIHogIUgICAgICAgXHJcbiAgICAgKiAgICAgIHBhdGg6c3RyaW5nICAgICAgICAgLy/lub/mkq3nmoTot6/lvoQgICAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgZGF0YTphbnkgICAgICAgICAgICAvL+imgeWPkemAgeeahOaVsOaNru+8jOi/meS4quWcqOWPkemAgeWJjeS8muiiq+W6j+WIl+WMluaIkEpTT04gICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICovXHJcbiAgICBicm9hZGNhc3QsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkYrnn6V3ZWJzb2NrZXTnmoTlj6bkuIDnq6/vvIznjrDlnKjmn5DkuIDot6/lvoTkuIrnmoTlub/mkq3mnInkurrlnKjnm5HlkKzkuoZcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGJyb2FkY2FzdF9vcGVuICAgIC8v5raI5oGv57G75Z6LICAgICAgIFxyXG4gICAgICogXSAgICBcclxuICAgICAqIGJvZHnmoLzlvI/vvJogICAgICAgXHJcbiAgICAgKiBbICAgICAgIFxyXG4gICAgICogICAgICBtZXNzYWdlSUQ6bnVtYmVyICAgICAgICAgLy/mtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiAgICAgIGJyb2FkY2FzdFNlbmRlcjpzdHJpbmcgICAvL+W5v+aSreeahOWPkemAgeiAhSAgICAgIFxyXG4gICAgICogICAgICBwYXRoOnN0cmluZyAgICAgICAgICAgICAgLy/lub/mkq3nmoTot6/lvoQgICAgICAgICBcclxuICAgICAqIF0gICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDlnKjkuIvpnaLkuKTnp43mg4XlhrXkuIvmiY3pnIDopoHlj5HpgIHor6Xmtojmga9cclxuICAgICAqIDEuIOeUqOaIt+WcqOaWsOeahOi3r+W+hOS4iuazqOWGjOS6huW5v+aSrVxyXG4gICAgICogMi4g5b2T572R57uc6L+e5o6l5pat5byA77yM6YeN5paw6L+e5o6l5LmL5ZCO77yM6ZyA6KaB5bCG5LmL5YmN5rOo5YaM6L+H55qE5bm/5pKt6Lev5b6E5YaN6YeN5paw6YCa55+l5a+55pa55LiA6YGN44CCXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdF9vcGVuLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZGK55+ld2Vic29ja2V055qE5Y+m5LiA56uv77yM5LmL5YmN55qEYnJvYWRjYXN0X29wZW7lt7Lnu4/ooqvmraPnoa7lpITnkIbkuoZcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGJyb2FkY2FzdF9vcGVuX2ZpbmlzaCAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAvL2Jyb2FkY2FzdF9vcGVu5omA6K6+572u55qE5raI5oGv57yW5Y+3ICAgICAgIFxyXG4gICAgICogXSAgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muW9k+e9kee7nOi/nuaOpeaWreW8gOWQju+8jOWPjOaWuemDveW6lOebtOaOpea4heeQhuaOieWvueaWueS5i+WJjeazqOWGjOi/h+eahOW5v+aSrei3r+W+hOOAglxyXG4gICAgICovXHJcbiAgICBicm9hZGNhc3Rfb3Blbl9maW5pc2gsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkYrnn6V3ZWJzb2NrZXTnmoTlj6bkuIDnq6/vvIznjrDlnKjmn5DkuIDot6/lvoTkuIrnmoTlub/mkq3lt7Lnu4/msqHmnInkurrnm5HlkKzkuoZcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGJyb2FkY2FzdF9jbG9zZSAgICAvL+a2iOaBr+exu+WeiyAgICAgICBcclxuICAgICAqIF0gICAgICAgXHJcbiAgICAgKiBib2R55qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgbWVzc2FnZUlEOm51bWJlciAgICAgICAgICAvL+a2iOaBr+e8luWPtyAgICAgICBcclxuICAgICAqICAgICAgYnJvYWRjYXN0U2VuZGVyOnN0cmluZyAgICAvL+W5v+aSreeahOWPkemAgeiAhSAgICAgIFxyXG4gICAgICogICAgICBwYXRoOnN0cmluZyAgICAgICAgICAgICAgIC8v5bm/5pKt55qE6Lev5b6EICAgICAgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqIFxyXG4gICAgICog5Zyo5LiL6Z2i5Lik56eN5oOF5Ya15LiL5omN6ZyA6KaB5Y+R6YCB6K+l5raI5oGvXHJcbiAgICAgKiAxLiDnlKjmiLflnKjmn5DmnaHot6/lvoTkuIrlt7Lnu4/msqHmnInms6jlhoznmoTmnInlub/mkq3nm5HlkKzlmajkuoZcclxuICAgICAqIDIuIOW9k+eUqOaIt+aUtuWIsOS6huiHquW3seayoeacieazqOWGjOi/h+eahOW5v+aSreeahOaXtuWAmemAmuefpeWvueaWueOAglxyXG4gICAgICovXHJcbiAgICBicm9hZGNhc3RfY2xvc2UsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkYrnn6V3ZWJzb2NrZXTnmoTlj6bkuIDnq6/vvIzkuYvliY3nmoRicm9hZGNhc3RfY2xvc2Xlt7Lnu4/ooqvmraPnoa7lpITnkIbkuoZcclxuICAgICAqIFxyXG4gICAgICog5aS06YOo5qC85byP77yaICAgICAgIFxyXG4gICAgICogWyAgICAgICBcclxuICAgICAqICAgICAgdHlwZSA9IGJyb2FkY2FzdF9jbG9zZV9maW5pc2ggICAgLy/mtojmga/nsbvlnosgICAgICAgXHJcbiAgICAgKiBdICAgICAgIFxyXG4gICAgICogYm9keeagvOW8j++8miAgICAgICBcclxuICAgICAqIFsgICAgICAgXHJcbiAgICAgKiAgICAgIG1lc3NhZ2VJRDpudW1iZXIgICAgLy9icm9hZGNhc3RfY2xvc2XmiYDorr7nva7nmoTmtojmga/nvJblj7cgICAgICAgXHJcbiAgICAgKiBdICAgICBcclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaCxcclxuXHJcbiAgICAvKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLeS4i+mdouaYr+S4gOS6m+WcqOeoi+W6j+WGhemDqOS9v+eUqOeahOa2iOaBr++8jOS4jeWcqOe9kee7nOS4iui/m+ihjOS8oOi+ky0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSAqL1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29ubmVjdGlvblNvY2tldOi/nuaOpeaJk+W8gFxyXG4gICAgICovXHJcbiAgICBfb25PcGVuLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ29ubmVjdGlvblNvY2tldOi/nuaOpeaWreW8gFxyXG4gICAgICovXHJcbiAgICBfb25DbG9zZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIkuWHuuS4gOWdl+S6i+S7tuepuumXtCzorrDlvZXlr7nmlrnmraPlnKjlr7nlk6rkupvot6/lvoTnmoTlub/mkq3lsZXlvIDnm5HlkKxcclxuICAgICAqL1xyXG4gICAgX2Jyb2FkY2FzdF93aGl0ZV9saXN0XHJcbn0iXX0=
