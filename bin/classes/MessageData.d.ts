/// <reference types="node" />
import { SendingFile } from '../interfaces/InvokeSendingData';
import { MessageType } from '../interfaces/MessageType';
import { InvokeSendingData } from '../interfaces/InvokeSendingData';
import { MessageRouting } from './MessageRouting';
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
     * @param mr MessageRouting
     * @param header 已近被JSON.parse后的消息头部
     * @param body 消息body
     */
    static parse(mr: MessageRouting, header: any[], body: Buffer): MessageData;
    /**
     * 创建消息
     */
    static create(mr: MessageRouting, ...args: any[]): MessageData;
    /**
     * 返回序列化后的对象。
     *
     * 注意：以 "_" 开头的属性或字段都将被忽略
     */
    toString(): string;
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
    static parse(mr: MessageRouting, header: any[], body: Buffer): InvokeRequestMessage;
    static create(mr: MessageRouting, messageID: number, receiver: string, path: string, data: InvokeSendingData): InvokeRequestMessage;
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
    static parse(mr: MessageRouting, header: any[], body: Buffer): InvokeResponseMessage;
    static create(mr: MessageRouting, rm: InvokeRequestMessage, messageID: number, data: InvokeSendingData): InvokeResponseMessage;
}
export declare class InvokeFinishMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    responseMessageID: number;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): InvokeFinishMessage;
    static create(mr: MessageRouting, rm: InvokeResponseMessage): InvokeFinishMessage;
}
export declare class InvokeFailedMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    requestMessageID: number;
    error: string;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): InvokeFailedMessage;
    static create(mr: MessageRouting, rm: InvokeRequestMessage, err: Error): InvokeFailedMessage;
}
export declare class InvokeFileRequestMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    index: number;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): InvokeFileRequestMessage;
    static create(mr: MessageRouting, rm: InvokeRequestMessage | InvokeResponseMessage, id: number, index: number): InvokeFileRequestMessage;
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
    static parse(mr: MessageRouting, header: any[], body: Buffer): InvokeFileResponseMessage;
    static create(mr: MessageRouting, rfm: InvokeFileRequestMessage, data: Buffer): InvokeFileResponseMessage;
}
export declare class InvokeFileFailedMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    error: string;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): InvokeFileFailedMessage;
    static create(mr: MessageRouting, rm: InvokeFileRequestMessage, err: Error): InvokeFileFailedMessage;
}
export declare class InvokeFileFinishMessage extends MessageData {
    type: MessageType;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): InvokeFileFinishMessage;
    static create(mr: MessageRouting, rm: InvokeFileRequestMessage): InvokeFileFinishMessage;
}
export declare class BroadcastMessage extends MessageData {
    type: MessageType;
    sender: string;
    path: string;
    data: any;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): BroadcastMessage;
    static create(mr: MessageRouting, path: string, data: any): BroadcastMessage;
}
export declare class BroadcastOpenMessage extends MessageData {
    type: MessageType;
    messageID: number;
    broadcastSender: string;
    path: string;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): BroadcastOpenMessage;
    static create(mr: MessageRouting, messageID: number, broadcastSender: string, path: string): BroadcastOpenMessage;
}
export declare class BroadcastOpenFinishMessage extends MessageData {
    type: MessageType;
    messageID: number;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): BroadcastOpenFinishMessage;
    static create(mr: MessageRouting, bom: BroadcastOpenMessage): BroadcastOpenFinishMessage;
}
export declare class BroadcastCloseMessage extends MessageData {
    type: MessageType;
    messageID: number;
    broadcastSender: string;
    path: string;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): BroadcastCloseMessage;
    static create(mr: MessageRouting, messageID: number, broadcastSender: string, path: string): BroadcastCloseMessage;
}
export declare class BroadcastCloseFinishMessage extends MessageData {
    type: MessageType;
    messageID: number;
    pack(): [string, Buffer];
    static parse(mr: MessageRouting, header: any[], body: Buffer): BroadcastCloseFinishMessage;
    static create(mr: MessageRouting, bcm: BroadcastCloseMessage): BroadcastCloseFinishMessage;
}
