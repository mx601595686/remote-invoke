import { sendingFile } from "./SendingFile";


/**
 * 对外导出方法的文件参数
 */
export interface ExportFunctionFileArgument {
 
}

/**
 * 对外导出的方法    
 * 注意：一旦执行结束（返回了promise）那么就不能再获取客户端发来的文件了
 */
export interface ExportFunction {
    /**
     * @param data 调用方发来的数据
     * @param files 附带的文件
     */
    (data: any, files: ExportFunctionFileArgument[]): Promise<void | ExportFunctionReturn>
}