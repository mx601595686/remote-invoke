/**
 * 要被发送的文件的描述
 */
export interface SendingFile {
    /**
     * 文件名
     */
    name: string;

    /**
     * 要发送的文件。既可以传递一个Buffer让系统自动分片发送也可以传递一个回调，动态分片发送。     
     * 回调函数：index 表示文件片段的序号,0 <= index 。返回void表示发送完成，已经没有更多数据需要发送了
     */
    file: Buffer | ((index: number) => Promise<Buffer | void>);

    /**
     * 文件发送进度回调函数。0 <= progress <= 1        
     * 注意：这个只有当file为Buffer时才有效
     */
    onProgress?: (progress: number) => void;
}

/**
 * 要被发送出去的数据
 */
export interface InvokeSendingData {

    /**
     * 要发送的数据
     */
    data: any;

    /**
     * 附带的文件
     */
    files?: SendingFile[]
}