//path格式：通过`/`来进行分割，最后一个是方法名，前面的称为命名空间，用于权限控制，例如"namespace/functionName"
//接收到的真实文件大小应当与size一致



/**
 * 传输消息的类型，也可以把它理解为状态码
 */
export enum MessageType {
    /**
     * 调用者向被调用者发出调用请求       
     * 
     * 头部格式：       
     * {       
     *      type = invoke_request   //消息类型       
     *      sender:string           //调用者       
     *      receiver:string         //被调用者       
     *      path:string             //调用方法所在的路径       
     * }       
     * body格式：       
     * {       
     *      requestMessageID:number     //请求消息编号       
     *      data:any                    //要发送的数据，这个在发送前会被序列化成JSON       
     *      files: {                    //消息附带的文件       
     *          id:number           //文件编号    
     *          size:number         //文件大小(byte)。如果文件大小不确定则为0    
     *          splitNumber:number  //文件被分割成了多少块。如果文件大小不确定则为0    
     *          name:string         //文件名    
     *      }[]    
     * }       
     * 
     * 当把invoke_request发送出去之后调用者就开始倒计时，时长为3分钟，超过3分钟就判定请求超时。
     * 如果中途收到了被调用者传回的invoke_file_request请求，那么就重置倒计时，这一过程直到收到被调用者传回的invoke_response或invoke_failed为止。
     */
    invoke_request,

    /**
     * 被调用者成功处理完请求，将结果返回给调用者
     * 
     * 头部格式：       
     * {       
     *      type = invoke_response  //消息类型       
     *      sender:string           //被调用者       
     *      receiver:string         //调用者       
     * }       
     * body格式：       
     * {       
     *      requestMessageID:number     //请求消息编号       
     *      responseMessageID:number    //响应消息编号       
     *      data:any                    //要反馈的数据，这个在发送前会被序列化成JSON       
     *      files:{id:number, size:number, splitNumber:number, name:string}[]    //反馈消息附带的文件       
     * }       
     * 
     * 如果返回的结果中包含文件，那么当把invoke_response发送出去之后，被调用者就开始倒计时，时长为3分钟，超过3分钟就直接结束响应。
     * 如果中途收到了调用者传回的invoke_file_request请求，那么就重置倒计时。这一过程直到收到调用者传回的invoke_finish为止。
     */
    invoke_response,

    /**
     * 调用者接收完被调用者传回的文件之后，通知被调用者此次调用请求彻底结束。
     * 如果被调用者在invoke_response中没有返回文件则不需要返回该消息。
     * 
     * 头部格式：              
     * {       
     *      type = invoke_finish    //消息类型       
     *      sender:string           //调用者       
     *      receiver:string         //被调用者     
     * }       
     * body格式：       
     * {       
     *      responseMessageID:number    //响应消息编号       
     * }    
     */
    invoke_finish,

    /**
     * 被调用者在处理请求的过程中出现了错误,告知调用者错误的原因
     * 
     * 头部格式：       
     * {       
     *      type = invoke_failed    //消息类型       
     *      sender:string           //被调用者       
     *      receiver:string         //调用者       
     * }       
     * body格式：       
     * {       
     *      requestMessageID:number     //调用者所设置的消息编号       
     *      error:string                //要反馈的失败的原因   
     * }     
     */
    invoke_failed,

    /**
     * 获取invoke_request或invoke_response过程中所包含的文件片段
     * 
     * 头部格式：       
     * {       
     *      type = invoke_file_request  //消息类型       
     *      sender:string               //发送者       
     *      receiver:string             //接收者       
     * }       
     * body格式：       
     * {       
     *      messageID:number    //消息编号（请求时是requestMessageID，回应时是responseMessageID）       
     *      id:number           //文件编号    
     *      index:number        //文件片段索引。注意：之前请求过的片段不允许重复请求，因此请求的索引编号应当一次比一次大，否则会被当成传输错误。    
     * }     
     */
    invoke_file_request,

    /**
     * 响应invoke_file_request请求
     * 
     * 头部格式：       
     * {       
     *      type = invoke_file_response //消息类型       
     *      sender:string               //发送者       
     *      receiver:string             //接收者       
     * }       
     * body格式：       
     * {       
     *      messageID:number    //invoke_file_request的消息编号       
     *      id:number           //文件编号    
     *      index:number        //文件片段索引    
     *      data:Buffer         //文件内容（默认的一个文件片段的大小是512kb）    
     * }     
     */
    invoke_file_response,

    /**
     * 获取文件片段失败       
     * 
     * 头部格式：       
     * {       
     *      type = invoke_file_failed   //消息类型       
     *      sender:string               //发送者       
     *      receiver:string             //接收者       
     * }       
     * body格式：       
     * {       
     *      messageID:number    //invoke_file_request的消息编号    
     *      id:number           //文件编号      
     *      error:string        //要反馈的失败的原因   
     * }     
     */
    invoke_file_failed,

    /**
     * 通知请求者所请求的文件片段index已经超出了范围（表示文件传输完成）。主要是针对于发送不确定大小文件而准备的。
    * 
     * 头部格式：       
     * {       
     *      type = invoke_file_finish   //消息类型       
     *      sender:string               //发送者       
     *      receiver:string             //接收者       
     * }       
     * body格式：       
     * {       
     *      messageID:number    //invoke_file_request的消息编号      
     *      id:number           //文件编号   
     * }     
     */
    invoke_file_finish,

    /**
     * 发送者对外发出广播
     * 
     * 头部格式：       
     * {       
     *      type = broadcast    //消息类型       
     *      sender:string       //发送者       
     *      path:string         //广播的路径         
     * }       
     * body格式：       
     * {       
     *      data:any            //要发送的数据，这个在发送前会被序列化成JSON   
     * }     
     */
    broadcast,

    /**
     * 告知websocket的另一端，现在某一路径上的广播有人在监听了
     * 
     * 头部格式：       
     * {       
     *      type = broadcast_open    //消息类型       
     *      path:string              //广播的路径         
     * }    
     * body格式：       
     * {       
     *      messageID:number    //消息编号       
     * }     
     */
    broadcast_open,

    /**
     * 告知websocket的另一端，之前的broadcast_open已经被正确处理了
     * 
     * 头部格式：       
     * {       
     *      type = broadcast_open_finish    //消息类型       
     * }       
     * body格式：       
     * {       
     *      messageID:number    //broadcast_open所设置的消息编号       
     * }     
     */
    broadcast_open_finish,

    /**
     * 告知websocket的另一端，现在某一路径上的广播已经没有人监听了
     * 
     * 头部格式：       
     * {       
     *      type = broadcast_close    //消息类型       
     *      path:string               //广播的路径         
     * }       
     * body格式：       
     * {       
     *      messageID:number    //消息编号       
     * }     
     */
    broadcast_close,

    /**
     * 告知websocket的另一端，之前的broadcast_close已经被正确处理了
     * 
     * 头部格式：       
     * {       
     *      type = broadcast_close_finish    //消息类型       
     * }       
     * body格式：       
     * {       
     *      messageID:number    //broadcast_close所设置的消息编号       
     * }     
     */
    broadcast_close_finish
}