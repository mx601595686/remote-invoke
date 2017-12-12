/**
 * 远端发来的文件
 */
export interface ReceivingFile {
    /**
     * 文件大小 (byte)。如果文件大小不确定则为null。      
     */
    size: number | null;

    /**
     * 文件被分割成了多少块。如果文件大小不确定则为null
     */
    splitNumber: number | null;

    /**
     * 文件名
     */
    name: string;

    /**
     * 一段一段地获取文件。     
     * 
     * 回调函数：err：指示传输过程中是否出现了错误，isEnd：指示是否传输完成，index：当前的文件片段的编号，data：文件片段数据。如果返回true则表示不再继续获取了。              
     * startIndex：从指定位置开始接收文件，跳过之前部分,用于断点传输。
     */
    onData(callback: (err: Error | undefined, isEnd: boolean, index: number, data: Buffer) => Promise<void | boolean>, startIndex?: number): void;

    /**
     * 直接获取整个文件
     */
    getFile(): Promise<Buffer>;
}

/**
 * 接收到的数据
 */
export interface InvokeReceivingData {

    /**
     * 接收到的数据
     */
    data: any;

    /**
     * 接收到的附带文件
     */
    files: ReceivingFile[]
}