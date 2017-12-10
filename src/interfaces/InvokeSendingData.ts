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
     * 文件发送进度的回调函数。        
     * 注意：如果file是回调函数，则progress永远是undefined，并且只有出错的时候才会触发      
     * @param err 发送时是否发生错误
     * @param progress 文件发送的进度0 <= progress <= 1
     */
    onProgress?: (err: Error | undefined, progress: number) => void;
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