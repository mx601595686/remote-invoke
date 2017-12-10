import { EventSpace } from "eventspace/bin/classes/EventSpace";
import { EventLevel } from 'eventspace/bin/classes/EventLevel';
import log from 'log-formatter';

import { MessageType } from '../interfaces/MessageType';
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { InvokeReceivingData, ReceivingFile } from '../interfaces/InvokeReceivingData';
import { InvokeSendingData, SendingFile } from '../interfaces/InvokeSendingData';
import {
    InvokeRequestMessage,
    InvokeResponseMessage,
    InvokeFinishMessage,
    InvokeFailedMessage,
    InvokeFileRequestMessage,
    InvokeFileResponseMessage,
    InvokeFileFailedMessage,
    InvokeFileFinishMessage,
    BroadcastMessage,
    BroadcastOpenMessage,
    BroadcastOpenFinishMessage,
    BroadcastCloseMessage,
    BroadcastCloseFinishMessage,
    MessageData
} from './MessageData';

/**
 * 消息路由中心，负责收发消息
 */
export abstract class MessageRouting {

    /**
     * 注册的各类消息监听器
     */
    readonly _messageListener = new EventSpace();

    /**
     * 自增消息索引编号
     */
    _messageID = 0;

    /**
     * 连接端口
     */
    readonly socket: ConnectionSocket;

    /**
     * 请求响应超时，默认3分钟
     */
    readonly timeout = 3 * 60 * 1000;

    /**
     * 默认文件片段大小 512kb
     */
    readonly filePieceSize = 512 * 1024;

    /**
     * 消息path的最大长度
     */
    readonly pathMaxLength = 256;

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

    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket: ConnectionSocket, moduleName: string) {
        this.moduleName = moduleName;
        this.socket = socket;

        this.socket.onMessage = (header: string, body: Buffer) => {
            try {
                const p_header = JSON.parse(header);

                switch (p_header[0]) {
                    case MessageType.invoke_request: {  //被调用者收到调用请求
                        const msg = InvokeRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        const eventName = [msg.type, msg.path] as any;

                        if (this._messageListener.has(eventName))
                            this._messageListener.trigger(eventName, msg);
                        else
                            this._sendMessage(InvokeFailedMessage.create(this, msg, new Error("调用的方法不存在")))
                                .catch(err => this._printError('响应对方"调用的方法不存在"失败', err));

                        break;
                    }
                    case MessageType.invoke_response: { //调用者收到调用响应
                        const msg = InvokeResponseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_finish: {   //被调用者收到调用结束响应
                        const msg = InvokeFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.responseMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_failed: {   //调用者收到调用失败响应
                        const msg = InvokeFailedMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.requestMessageID] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_request: {
                        const msg = InvokeFileRequestMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_response: {
                        const msg = InvokeFileResponseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_failed: {
                        const msg = InvokeFileFailedMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.invoke_file_finish: {
                        const msg = InvokeFileFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.sender, msg.messageID, msg.id] as any, msg);

                        break;
                    }
                    case MessageType.broadcast: {
                        const msg = BroadcastMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        const eventName = [msg.type, msg.sender, ...msg.path.split('.')] as any;

                        if (!this._messageListener.hasAncestors(eventName)) {   //如果没有注册过这个广播的监听器，就通知对方不要再发送了
                            this._send_BroadcastCloseMessage(msg.sender, msg.path);
                        } else {
                            this._messageListener.triggerAncestors(eventName, msg.data, true, true);
                        }

                        break;
                    }
                    case MessageType.broadcast_open: {
                        const msg = BroadcastOpenMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.receive([MessageType._broadcast_white_list, ...msg.path.split('.')] as any, msg.path as any);

                        this._sendMessage(BroadcastOpenFinishMessage.create(this, msg))
                            .catch(err => this._printError('响应对方的broadcast_open请求失败', err));

                        break;
                    }
                    case MessageType.broadcast_open_finish: {
                        const msg = BroadcastOpenFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.messageID] as any, msg);

                        break;
                    }
                    case MessageType.broadcast_close: {
                        const msg = BroadcastCloseMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.cancel([MessageType._broadcast_white_list, ...msg.path.split('.')] as any);  //清除标记

                        this._sendMessage(BroadcastCloseFinishMessage.create(this, msg))
                            .catch(err => this._printError('响应对方的broadcast_close请求失败', err));

                        break;
                    }
                    case MessageType.broadcast_close_finish: {
                        const msg = BroadcastCloseFinishMessage.parse(this, p_header, body);
                        this._printMessage(false, msg);

                        this._messageListener.trigger([msg.type, msg.messageID] as any, msg);

                        break;
                    }
                    default:
                        throw new Error(`未知消息类型：${p_header}`);
                }
            } catch (error) {
                this._printError('接收到的消息格式错误：', error);
            }
        };

        this.socket.onOpen = () => this._messageListener.triggerDescendants([MessageType._onOpen] as any);

        this.socket.onClose = () => this._messageListener.triggerDescendants([MessageType._onClose] as any);

        //当打开端口之后立刻通知对方要监听哪些广播
        this._messageListener.receive([MessageType._onOpen, '_send_broadcast_open'] as any, () => {
            this._messageListener._eventLevel.getChildLevel([MessageType.broadcast] as any, true)
                .children.forEach((level, broadcastSender) => {
                    const forEachLevel = (level: EventLevel) => {
                        if (level.receivers.size > 0) {
                            this._send_BroadcastOpenMessage(broadcastSender, level.receivers.values().next().value as any);
                        }

                        level.children.forEach(forEachLevel);
                    };

                    level.children.forEach(forEachLevel);
                });
        });

        //当连接断开立刻清理对方注册过的广播路径
        this._messageListener.receive([MessageType._onClose, '_clean_opened_broadcast'] as any, () => {
            this._messageListener.cancelDescendants([MessageType._broadcast_white_list] as any);
        });
    }

    /**
     * 打印错误消息
     * @param desc 描述 
     * @param err 错误信息
     */
    protected _printError(desc: string, err: Error) {
        if (this.printError)
            log.warn
                .location.white
                .title.yellow
                .content.yellow('remote-invoke', desc, err);
    }

    /**
     * 打印收到或发送的消息
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param msg 要打印的消息
     */
    protected _printMessage(sendOrReceive: boolean, msg: MessageData) {
        if (this.printMessage)
            if (sendOrReceive)
                log
                    .location
                    .location
                    .text.cyan.bold.round
                    .content('remote-invoke', this.moduleName, '发送', msg.toString());
            else
                log
                    .location
                    .location
                    .text.green.bold.round
                    .content('remote-invoke', this.moduleName, '收到', msg.toString());
    }
}