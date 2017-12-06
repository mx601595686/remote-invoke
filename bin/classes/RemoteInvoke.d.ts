/// <reference types="node" />
import { ConnectionSocket } from "./ConnectionSocket";
import { InvokeReceivingData } from '../interfaces/InvokeReceivingData';
import { InvokeSendingData } from '../interfaces/InvokeSendingData';
export declare class RemoteInvoke {
    private readonly _messageListener;
    private _messageID;
    /**
     * 连接端口
     */
    readonly socket: ConnectionSocket;
    /**
     * 请求响应超时，默认3分钟
     */
    readonly timeout: number;
    /**
     * 默认文件片段大小 512kb
     */
    readonly filePieceSize: number;
    /**
     * 当前模块名称
     */
    readonly moduleName: string;
    /**
     * 是否打印收到和发送的消息（用于调试）。默认false
     */
    printMessage: boolean;
    /**
     * 是否打印系统错误，默认true
     */
    printError: boolean;
    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket: typeof ConnectionSocket, moduleName: string);
    /**
     * 对外导出方法。
     * 如果要向调用方反馈错误，直接 throw new Error() 即可。
     * 注意：对于导出方法，当它执行完成，返回结果后就不可以再继续下载文件了。
     * 注意：一个path上只允许导出一个方法。如果重复导出则后面的应该覆盖掉前面的。
     * @param path 所导出的路径
     * @param func 导出的方法
     */
    export<F extends (data: InvokeReceivingData) => Promise<void | InvokeSendingData>>(path: string, func: F): F;
    /**
     * 取消对外导出的方法
     * @param path 之前导出的路径
     */
    cancelExport(path: string): void;
    /**
     * 调用远端模块导出的方法。直接返回数据与文件
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     */
    invoke(receiver: string, path: string, data: InvokeSendingData): Promise<{
        data: any;
        files: {
            name: string;
            data: Buffer;
        }[];
    }>;
    /**
     * 调用远端模块导出的方法。
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     * @param callback 接收响应数据的回调。注意：一旦回调执行完成就不能再下载文件了。
     */
    invoke(receiver: string, path: string, data: InvokeSendingData, callback: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): void;
    /**
     * 注册广播监听器
     * @param sender 发送者
     * @param name 广播的路径
     * @param func 对应的回调方法
     */
    receive<F extends (arg: any) => any>(sender: string, path: string, func: F): F;
    /**
     * 删除指定路径上的所有广播监听器，可以传递一个listener来只删除一个特定的监听器
     * @param sender 发送者
     * @param name 广播的路径
     * @param listener 要指定删除的监听器
     */
    cancelReceive(sender: string, path: string, listener?: (arg: any) => any): void;
    /**
     * 对外广播数据
     * @param path 广播的路径
     * @param data 要发送的数据
     */
    broadcast(path: string, data?: any): Promise<void>;
    /**
     * 便于使用socket发送消息
     */
    private _sendMessage(msg);
    /**
     * 打印错误消息
     * @param desc 描述
     * @param err 错误信息
     */
    private _printError(desc, err);
    /**
     * 打印收到或发送的消息
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param desc 描述
     * @param data 要打印的数据
     */
    private _printMessage(sendOrReceive, msg);
    /**
     * 准备好下载回调。返回InvokeReceivingData与清理资源回调
     */
    private _prepare_InvokeReceivingData(msg);
    /**
     * 准备发送文件，返回清理资源回调。如果超时会自动清理资源
     * @param msg 要发送的数据
     * @param onTimeout 没有文件请求超时
     */
    private _prepare_InvokeSendingData(msg, onTimeout?);
    /**
      * 发送BroadcastOpenMessage
      * @param broadcastSender 广播的发送者
      * @param path 广播路径
      */
    private _send_BroadcastOpenMessage(broadcastSender, path);
    /**
     * 发送BroadcastCloseMessage
     * @param broadcastSender 广播的发送者
     * @param path 广播路径
     */
    private _send_BroadcastCloseMessage(broadcastSender, path);
}
