/**
 * 将被发送的文件
 */
export interface SendingFile {
    /**
     * 文件名
     */
    name: string;

    /**
     * 要发送的文件。既可以直接传递一个Buffer让系统自动发送也可以传递一个回调，动态发送。     
     * 
     * 回调函数：index 表示文件片段的序号,0 <= index 。返回void表示发送完成，已经没有更多数据需要发送了
     */
    file: Buffer | ((index: number) => Promise<Buffer | void>);

    /**
     * 文件发送进度回调函数。0 <= progress <= 1       
     * 注意：这个只有当file为Buffer时才有效
     */
    onProgress?: (progress: number) => void;
}