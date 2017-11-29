/**
 * 要发送的文件。既可以传递一个Buffer让系统自动分片发送也可以传递一个回调，动态分片发送。     
 * 回调函数：index 表示文件片段的序号,0 <= index 。返回void表示发送完成，已经没有更多数据需要发送了
 */
export type SendingFile = Buffer | ((index: number) => Promise<Buffer | void>);