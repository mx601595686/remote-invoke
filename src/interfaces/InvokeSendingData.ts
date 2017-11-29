import { SendingFile } from "./SendingFile";

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
    files?: {
        /**
         * 文件名
         */
        name: string;

        /**
         * 要发送的文件
         */
        file: SendingFile;

        /**
         * 文件发送进度回调函数。0 <= progress <= 1        
         * 注意：这个只有当file为Buffer时才有效
         */
        onProgress?: (progress: number) => void;
    }[]
}