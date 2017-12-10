/**
 * 传输消息的类型，也可以把它理解为状态码
 */
export enum MessageType {
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
    invoke_request,

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
    invoke_response,

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
    invoke_finish,

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
    invoke_failed,

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
    invoke_file_request,

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
    invoke_file_response,

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
    invoke_file_failed,

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
    invoke_file_finish,

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
    broadcast,

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
    broadcast_open,

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
    broadcast_open_finish,

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
    broadcast_close,

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
    broadcast_close_finish,

    /* -----------------------------------下面是一些在程序内部使用的消息，不在网络上进行传输------------------------------------ */

    /**
     * ConnectionSocket连接打开
     */
    _onOpen,

    /**
     * ConnectionSocket连接断开
     */
    _onClose,

    /**
     * 划出一块事件空间,记录对方正在对哪些路径的广播展开监听
     */
    _broadcast_white_list
}