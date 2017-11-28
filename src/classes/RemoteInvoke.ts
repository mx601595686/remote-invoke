import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { ExportFunction } from "../interfaces/ExportFunction";

export class RemoteInvoke {

    private readonly _timeout: number = 3 * 60 * 1000; //响应超时，默认3分钟

    private readonly _filePieceSize = 512 * 1024;   //默认文件片段大小 512kb

    private readonly _socket: ConnectionSocket;   //连接端口

    /**
     * 对外导出的方法列表。
     * key：path名称
     */
    private readonly _exportFunctionList: Map<string, ExportFunction> = new Map();

    /**
     * 等待接收invoke_response或invoke_failed的回调函数列表。
     * key：messageID
     */
    private readonly _invokeRequestList: Map<number, Function> = new Map();

    /**
     * 等待接收invoke_finish的回调函数列表。
     * key：调用者名称 -> messageID
     */
    private readonly _invokeResponseList: Map<string, Map<number, Function>> = new Map();

    /**
     * 发送文件列表
     * key：messageID -> fileID
     */
    private readonly _invokeSendFileList: Map<number, Map<number, Function>> = new Map();
    
    
    /**
     * 注册的广播接收器    
     * key：发送者名称 -> path名称
     */
    private readonly _receiveBroadcastList: Map<string, Map<string, (data: any) => any>> = new Map();

    /**
     * 消息索引编号，每发一条消息+1
     */
    private _messageID: number = 0; 

    /**
     * 当前模块名称
     */
    readonly moduleName: string;




    constructor(socket: ConnectionSocket, moduleName: string) {
        this._socket = socket;
        this._socket._used = true;
        this.moduleName = moduleName;
    }


}