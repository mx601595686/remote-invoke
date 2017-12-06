/// <reference types="node" />
import { SendingFile } from '../interfaces/InvokeSendingData';
import { RemoteInvoke } from './RemoteInvoke';
import { MessageType } from '../interfaces/MessageType';
import { InvokeSendingData } from '../interfaces/InvokeSendingData';
/**
 * 所有消息的基类
 */
export declare abstract class MessageData {
    abstract type: MessageType;
    /**
     * 打包这条消息。返回[消息头部，消息body]
     */
    abstract pack(): [string, Buffer];
    /**
     * 解析消息
     * @param ri RemoteInvoke
     * @param header 已近被JSON.parse后的消息头部
     * @param body 消息body
     */
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): MessageData;
    /**
     * 创建消息
     */
    static create(ri: RemoteInvoke, ...args: any[]): MessageData;
}
export declare class InvokeRequestMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    path: string;
    requestMessageID: number;
    data: any;
    files: {
        id: number;
        size: number | null;
        splitNumber: number | null;
        name: string;
        _data?: SendingFile;
    }[];
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): InvokeRequestMessage;
    static create(ri: RemoteInvoke, messageID: number, receiver: string, path: string, data: InvokeSendingData): InvokeRequestMessage;
}
export declare class InvokeResponseMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    requestMessageID: number;
    responseMessageID: number;
    data: any;
    files: {
        id: number;
        size: number | null;
        splitNumber: number | null;
        name: string;
        _data?: SendingFile;
    }[];
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): InvokeResponseMessage;
    static create(ri: RemoteInvoke, rm: InvokeRequestMessage, messageID: number, data: InvokeSendingData): InvokeResponseMessage;
}
export declare class InvokeFinishMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    responseMessageID: number;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): InvokeFinishMessage;
    static create(ri: RemoteInvoke, rm: InvokeResponseMessage): InvokeFinishMessage;
}
export declare class InvokeFailedMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    requestMessageID: number;
    error: string;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): InvokeFailedMessage;
    static create(ri: RemoteInvoke, rm: InvokeRequestMessage, err: Error): InvokeFailedMessage;
}
export declare class InvokeFileRequestMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    index: number;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): InvokeFileRequestMessage;
    static create(ri: RemoteInvoke, rm: InvokeRequestMessage | InvokeResponseMessage, id: number, index: number): InvokeFileRequestMessage;
}
export declare class InvokeFileResponseMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    index: number;
    data: Buffer;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): InvokeFileResponseMessage;
    static create(ri: RemoteInvoke, rfm: InvokeFileRequestMessage, data: Buffer): InvokeFileResponseMessage;
}
export declare class InvokeFileFailedMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    error: string;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): InvokeFileFailedMessage;
    static create(ri: RemoteInvoke, rm: InvokeFileRequestMessage, err: Error): InvokeFileFailedMessage;
}
export declare class InvokeFileFinishMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): InvokeFileFinishMessage;
    static create(ri: RemoteInvoke, rm: InvokeFileRequestMessage): InvokeFileFinishMessage;
}
export declare class BroadcastMessage extends MessageData {
    type: MessageType;
    sender: string;
    path: string;
    data: any;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): BroadcastMessage;
    static create(ri: RemoteInvoke, path: string, data: any): BroadcastMessage;
}
export declare class BroadcastOpenMessage extends MessageData {
    type: MessageType;
    messageID: number;
    broadcastSender: string;
    path: string;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): BroadcastOpenMessage;
    static create(ri: RemoteInvoke, messageID: number, broadcastSender: string, path: string): BroadcastOpenMessage;
}
export declare class BroadcastOpenFinishMessage extends MessageData {
    type: MessageType;
    messageID: number;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): BroadcastOpenFinishMessage;
    static create(ri: RemoteInvoke, bom: BroadcastOpenMessage): BroadcastOpenFinishMessage;
}
export declare class BroadcastCloseMessage extends MessageData {
    type: MessageType;
    messageID: number;
    broadcastSender: string;
    path: string;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): BroadcastCloseMessage;
    static create(ri: RemoteInvoke, messageID: number, broadcastSender: string, path: string): BroadcastCloseMessage;
}
export declare class BroadcastCloseFinishMessage extends MessageData {
    type: MessageType;
    messageID: number;
    pack(): [string, Buffer];
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): BroadcastCloseFinishMessage;
    static create(ri: RemoteInvoke, bom: BroadcastOpenMessage): BroadcastCloseFinishMessage;
}
