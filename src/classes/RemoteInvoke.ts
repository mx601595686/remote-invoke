import { MessageType } from './../interfaces/MessageType';
import { EventSpace } from 'eventspace';
import log from 'log-formatter';

import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { ExportFunction } from "../interfaces/ExportFunction";

export class RemoteInvoke {

    private readonly _timeout: number = 3 * 60 * 1000; //响应超时，默认3分钟

    private readonly _filePieceSize = 512 * 1024;   //默认文件片段大小 512kb

    private readonly _socket: ConnectionSocket;   //连接端口

    private readonly _messageListener = new EventSpace();  //注册的各类消息监听器  

    private _messageID: number = 0;    //消息索引编号

    /**
     * 当前模块名称
     */
    readonly moduleName: string;

    /**
     * 是否打印收到和发送的消息。用于调试，默认false
     */
    printMessage: boolean = false;

    /**
     * 是否打印系统错误，默认true
     */
    printError: boolean = true;

    constructor(socket: ConnectionSocket, moduleName: string) {
        this._socket = socket;
        this._socket._used = true;
        this.moduleName = moduleName;

        this._socket.onMessage = (header, body) => {
     
            try {
                const p_header = 
            } catch (error) {
                this._printError('接收到的消息格式错误。解析头部异常', error);
            }
            switch (p_header.type) {
                case value:
                    
                    break;
                    
            
                default:
                    break;
            }
        };
    }

    /**
     * 打印错误消息
     * @param desc 描述 
     * @param err 错误信息
     */
    private _printError(desc: string, err: Error) {
        if (this.printError)
            log.error
                .location.white
                .title.red
                .content.red('remote-invoke', desc, err);
    }

    /**
     * 对外导出方法。注意：如果重复在同一path上导出，则后面的会覆盖掉前面的。    
     * 格式：[MessageType.invoke_request, path]
     * @param path 所导出的路径
     * @param func 导出的方法 
     */
    export<F extends ExportFunction>(path: string, func: F) {
        this._messageListener.receive([MessageType.invoke_request as any, path], ([any, Buffer]) => {   //[header, Body]
            try {

            } catch{

            }
        });

        return func;
    }

    /**
     * 取消对外导出的方法
     * @param path 之前导出的路径
     */
    cancelExport(path: string) {
        this._messageListener.cancel([MessageType.invoke_request as any, path]);
    }
}