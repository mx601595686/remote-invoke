import { sendingFile } from '../classes/MessageData';

/**
 * 对外导出方法的返回值
 */
export interface ExportFunctionReturn {

    /**
     * 要发送的数据
     */
    data: any;

    /**
     * 附带的文件
     */
    files?: {
        /**
         * 文件名
         */
        name: string;

        /**
         * 要发送的文件。
         */
        file: sendingFile;

        /**
         * 文件发送进度回调函数。0 <= progress <= 1       
         * 注意：这个只有当file为Buffer时才有效
         */
        onProgress?: (progress: number) => void;
    }[]
}

/**
 * 传入对外导出方法的文件参数
 */
export interface ExportFunctionFileArgument {
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
     * 回调函数：err：指示传输过程中是否出现了错误，isEnd：指示是否传输完成，index：当前的文件片段的编号，data：文件片段数据。
     * 如果返回true则表示不再继续获取了。          
     * startIndex：从指定部分开始接收文件，跳过之前部分,用于断点传输。
     */
    onData(callback: (err: Error | undefined, isEnd: boolean, index: number, data: Buffer) => Promise<void | boolean>, startIndex?: number): void;

    /**
     * 直接获取整个文件
     */
    getFile(): Promise<Buffer>;
}

/**
 * 对外导出的方法    
 * 注意：一旦执行结束返回了promise那么就不能再获取客户端发来的文件了
 */
export interface ExportFunction {
    /**
     * @param data 调用方发来的数据
     * @param files 附带的文件
     */
    (data: any, files: ExportFunctionFileArgument[]): Promise<void | ExportFunctionReturn>
}