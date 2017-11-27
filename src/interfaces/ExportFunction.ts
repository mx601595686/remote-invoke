import { SendingFile } from './SendingFile';
import { ReceivingFile } from './ReceivingFile';

/**
 * 对外公开的方法    
 * 注意：一旦返回了promise那么就不能再获取客户端发来的文件了
 */
export interface ExportFunction {
    /**
     * @param data 调用方发来的数据
     * @param files 附带的文件
     */
    (data: any, files?: ReceivingFile): Promise<void | { data: any, files?: SendingFile }>
}