/**
 * 将被发送的文件
 */
export interface SendingFileType {

    /**
     * 文件编号
     */
    id: number;

    /**
     * 文件大小 (byte)
     */
    size: number;

    /**
     * 文件被分割成了多少块
     */
    splitNumber: number;

    /**
     * 文件名
     */
    name: string;

    /**
     * 要发送的文件。即可以直接传递一个Buffer让系统自动发送或传递一个回调，只当用户请求时才执行。     
     * 
     * 回调函数 index 表示文件片段的序号。0 <= index < splitNumber
     */
    file: Buffer | ((index: number) => Promise<Buffer>);

    /**
     * 文件发送进度回调函数。0 <= progress <= 1
     */
    onProgress: (progress: number) => void;
}