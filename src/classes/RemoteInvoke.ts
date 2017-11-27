import { ConnectionSocket } from "../interfaces/ConnectionSocket";

export class RemoteInvoke {

    private readonly _timeout: number = 3 * 60 * 1000; //响应超时，默认3分钟

    

    private readonly _socket: ConnectionSocket;   //连接端口

    /**
     * 对外导出的方法列表
     */
    private readonly _exportFunctionList: Map<string, (arg: any) => Promise<any>> = new Map();

    private _messageID: number = 0; //消息索引编号，每发一条消息+1


    /**
     * 注册的广播接收器    
     * 
     * key：moduleName -> messageName
     */
    readonly receiveBroadcastList: Map<string, Map<string, (arg: any) => void>> = new Map();

    /**
     * 当前模块名称
     */
    readonly moduleName: string;

    /**
     * 文件片段大小 512kb
     */
    readonly filePieceSize = 512 * 1024; 


    constructor(socket: ConnectionSocket, moduleName: string) {
        this._socket = socket;
        this._socket._used = true;
        this.moduleName = moduleName;
    }


}