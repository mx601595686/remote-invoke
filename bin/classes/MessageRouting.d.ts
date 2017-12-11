/// <reference types="node" />
import { EventSpace } from "eventspace/bin/classes/EventSpace";
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { InvokeSendingData } from "../interfaces/InvokeSendingData";
import { InvokeRequestMessage, InvokeResponseMessage } from './MessageData';
/**
 * 消息路由中心，负责收发消息
 */
export declare abstract class MessageRouting {
    /**
     * 自增消息编号索引
     */
    private _messageID;
    /**
     * 连接端口
     */
    protected readonly _socket: ConnectionSocket;
    /**
     * 注册的各类消息监听器
     */
    protected readonly _messageListener: EventSpace;
    /**
     * 请求响应超时，默认3分钟
     */
    readonly timeout: number;
    /**
     * 默认文件片段大小 512kb
     */
    readonly filePieceSize: number;
    /**
     * 消息path的最大长度
     */
    readonly pathMaxLength: number;
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
    constructor(socket: ConnectionSocket, moduleName: string);
    protected _send_InvokeRequestMessage(receiver: string, path: string, data: InvokeSendingData): Promise<InvokeResponseMessage>;
    protected _send_InvokeResponseMessage(msg: InvokeRequestMessage, data: InvokeSendingData): void;
    /**
     * 方便_send_InvokeRequestMessage与_send_InvokeResponseMessage发送文件。
     * 发送超时后会自动清理资源，也可使用返回的clean方法提前清理资源
     */
    private _send_File(msg, onTimeout);
    protected _send_InvokeFinishMessage(msg: InvokeResponseMessage): void;
    protected _send_InvokeFailedMessage(msg: InvokeRequestMessage, error: Error): void;
    /**
     * 发送请求，下载一个文件片段，返回下载到的文件片段Buffer。如果返回void则表示下载完成了，超时或下载失败会抛出异常。
     */
    protected _send_InvokeFileRequestMessage(msg: InvokeRequestMessage | InvokeResponseMessage, fileID: number, index: number): Promise<Buffer | void>;
    private _send_InvokeFileResponseMessage(msg, data);
    private _send_InvokeFileFailedMessage(msg, error);
    private _send_InvokeFileFinishMessage(msg);
    protected _send_BroadcastMessage(path: string, data: any): void;
    protected _send_BroadcastOpenMessage(broadcastSender: string, path: string): void;
    private _send_BroadcastOpenFinishMessage(msg);
    protected _send_BroadcastCloseMessage(broadcastSender: string, path: string): void;
    private _send_BroadcastCloseFinishMessage(msg);
    /**
     * 便于使用socket发送消息
     */
    private _send_MessageData(msg);
    /**
     * 打印收到或发送的消息
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param msg 要打印的消息
     */
    private _printMessage(sendOrReceive, msg);
    /**
     * 打印错误消息
     * @param desc 描述
     * @param err 错误信息
     */
    private _printError(desc, err);
}
