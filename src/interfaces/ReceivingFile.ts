/**
 * 正在接收的文件
 */
export interface ReceivingFile {
    /**
     * 文件大小 (byte)。如果文件大小不确定则为0。   
     * 注意：如果不为0，则系统会确保收到的文件大小 <= size
     */
    size: number;

    /**
     * 文件被分割成了多少块。如果文件大小不确定则为0
     */
    splitNumber: number;

    /**
     * 文件名
     */
    name: string;

    /**
     * 一段一段地获取文件。     
     * 回调函数：err：指示传输过程中是否出现了错误或者是否传输完成，index：当前的文件片段的编号，data：文件片段数据         
     * startIndex：从指定部分开始接收文件，跳过之前部分,用于断点传输
     */
    onData: (callback: (err: Error | undefined | "end", index?: number, data?: Buffer) => void, startIndex?: number) => void

    /**
     * 直接获取整个文件
     */
    getFile: () => Promise<Buffer>;
}