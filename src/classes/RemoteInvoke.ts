import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import EventSpace from "eventspace";

export class RemoteInvoke{
    
    //#region 属性

    /**
     * 请求响应超时，默认3分钟
     */
    static readonly timeout = 3 * 60 * 1000;

    /**
     * 默认文件片段大小 512kb
     */
    static readonly filePieceSize = 512 * 1024;

    /**
     * 消息path的最大长度
     */
    static readonly pathMaxLength = 256;

    /**
     * 自增消息编号索引
     */
    private _messageID = 0;

    /**
     * 连接端口
     */
    private readonly _socket: ConnectionSocket;

    /**
     * 处理接收消息栈
     */
    private readonly _inStack = new EventSpace();

    /**
     * 处理发送消息栈
     */
    private readonly _outStack = new EventSpace();

    /**
     * 处理系统内消息栈
     */
    private readonly _systemStack = new EventSpace();

    /**
     * 当前模块名称
     */
    readonly moduleName: string;

    /**
     * 是否打印收到和发送的消息（用于调试）。默认false
     */
    printMessage: boolean = false;

    /**
     * 是否打印系统错误，默认true
     */
    printError: boolean = true;

    //#endregion
}