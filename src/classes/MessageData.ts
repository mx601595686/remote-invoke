import { RemoteInvoke } from './RemoteInvoke';
import { MessageType } from './../interfaces/MessageType';

/**
 * 要发送的文件。既可以直接传递一个Buffer让系统自动发送也可以传递一个回调，动态发送。     
 * 回调函数：index 表示文件片段的序号,0 <= index 。返回void表示发送完成，已经没有更多数据需要发送了
 */
export type sendingFile = Buffer | ((index: number) => Promise<Buffer | void>);




/**
 * 解析消息
 * @param header 消息头部
 * @param body 消息body
 */
export function parseMessageData(rv: RemoteInvoke, header: string, body: Buffer): MessageData {
    const p_header = JSON.parse(header);

    switch (p_header[0]) {
        case MessageType.invoke_request:
            return InvokeRequestMessage.parse(p_header, body);

        case MessageType.invoke_response:
            return InvokeResponseMessage.parse(p_header, body);

        case MessageType.invoke_finish:
            return InvokeFinishMessage.parse(p_header, body);

        case MessageType.invoke_failed:
            return InvokeFailedMessage.parse(p_header, body);

        default:
            throw new Error('未知消息类型');
    }
}

/**
 * 所有消息的基类
 */
export abstract class MessageData {

    abstract type: MessageType;

    /**
     * 打包这条消息。返回[消息头部，消息body]       
     * 注意：打包后的头部是一个数组，数组的第一项总是type
     */
    abstract pack(): [string, Buffer];

    /**
     * 解析消息
     * @param header 已近被JSON.parse后的消息头部
     * @param body 消息body
     */
    static parse(header: any[], body: Buffer): MessageData {
        throw new Error('未实现解析方法');
    }

    /**
     * 创建消息
     */
    static create(...args: any[]): MessageData {
        throw new Error('未实现创建方法');
    }
}

export class InvokeRequestMessage extends MessageData {

    type = MessageType.invoke_request;
    sender: string;
    receiver: string;
    path: string;
    requestMessageID: number;
    data: any;
    files: { id: number, size: number, splitNumber: number, name: string }[]

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver, this.path]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.data, this.files.map(item => [item.id, item.size, item.splitNumber, item.name])]))
        ];
    }

    static parse(header: any[], body: Buffer) {
        const p_body = JSON.parse(body.toString());
        const irm = new InvokeRequestMessage();

        irm.sender = header[1];
        irm.receiver = header[2];
        irm.path = header[3];

        irm.requestMessageID = p_body[0];
        irm.data = p_body[1];
        irm.files = p_body[2].map((item: any) => ({ id: item[0], size: item[1], splitNumber: item[2], name: item[3] }));

        return irm;
    }

    static create(rv: RemoteInvoke, receiver: string, path: string, data: any, files: { name: string, file: sendingFile }[] = []) {
        const irm = new InvokeRequestMessage();

        irm.sender = rv.moduleName;
        irm.receiver = receiver;
        irm.path = path;
        irm.requestMessageID = (<any>rv)._messageID++;
        irm.data = data;
        irm.files = files.map((item, index) =>
            Buffer.isBuffer(item.file) ?
                { id: index, size: item.file.length, splitNumber: Math.ceil(item.file.length / (<any>rv)._filePieceSize), name: item.name } :
                { id: index, size: 0, splitNumber: 0, name: item.name }
        );

        return irm;
    }
}

export class InvokeResponseMessage extends MessageData {

    type = MessageType.invoke_response;
    sender: string;
    receiver: string;
    requestMessageID: number;
    responseMessageID: number;
    data: any;
    files: { id: number, size: number, splitNumber: number, name: string }[]

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.responseMessageID, this.data, this.files.map(item => [item.id, item.size, item.splitNumber, item.name])]))
        ];
    }

    static parse(header: any[], body: Buffer) {
        const p_body = JSON.parse(body.toString());
        const irm = new InvokeResponseMessage();

        irm.sender = header[1];
        irm.receiver = header[2];

        irm.requestMessageID = p_body[0];
        irm.responseMessageID = p_body[1];
        irm.data = p_body[2];
        irm.files = p_body[3].map((item: any) => ({ id: item[0], size: item[1], splitNumber: item[2], name: item[3] }));

        return irm;
    }

    static create(rv: RemoteInvoke, rm: InvokeRequestMessage, data: any, files: { name: string, file: sendingFile }[] = []) {
        const irm = new InvokeResponseMessage();

        irm.sender = rm.receiver;
        irm.receiver = rm.sender;
        irm.requestMessageID = rm.requestMessageID;
        irm.responseMessageID = (<any>rv)._messageID++;
        irm.data = data;
        irm.files = files.map((item, index) =>
            Buffer.isBuffer(item.file) ?
                { id: index, size: item.file.length, splitNumber: Math.ceil(item.file.length / (<any>rv)._filePieceSize), name: item.name } :
                { id: index, size: 0, splitNumber: 0, name: item.name }
        );

        return irm;
    }
}

export class InvokeFinishMessage extends MessageData {

    type = MessageType.invoke_finish;
    sender: string;
    receiver: string;
    responseMessageID: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(this.responseMessageID.toString())
        ];
    }

    static parse(header: any[], body: Buffer) {
        const ifi = new InvokeFinishMessage();

        ifi.sender = header[1];
        ifi.receiver = header[2];

        ifi.responseMessageID = Number.parseInt(body.toString());

        return ifi;
    }

    static create(rm: InvokeResponseMessage) {
        const ifi = new InvokeFinishMessage();

        ifi.sender = rm.receiver;
        ifi.receiver = rm.sender;
        ifi.responseMessageID = rm.responseMessageID;

        return ifi;
    }
}

export class InvokeFailedMessage extends MessageData {

    type = MessageType.invoke_failed;
    sender: string;
    receiver: string;
    requestMessageID: number;
    error: string;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.error]))
        ];
    }

    static parse(header: any[], body: Buffer) {
        const p_body = JSON.parse(body.toString());
        const ifa = new InvokeFailedMessage();

        ifa.sender = header[1];
        ifa.receiver = header[2];

        ifa.requestMessageID = p_body[0];
        ifa.error = p_body[1];

        return ifa;
    }

    static create(rm: InvokeRequestMessage, err: Error) {
        const ifa = new InvokeFailedMessage();

        ifa.sender = rm.receiver;
        ifa.receiver = rm.sender;
        ifa.requestMessageID = rm.requestMessageID;
        ifa.error = err.message;

        return ifa;
    }
}

export class InvokeFileRequestMessage extends MessageData {

    type = MessageType.invoke_file_request;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    index: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.messageID, this.id, this.index]))
        ];
    }

    static parse(header: any[], body: Buffer) {
        const p_body = JSON.parse(body.toString());
        const ifr = new InvokeFileRequestMessage();

        ifr.sender = header[1];
        ifr.receiver = header[2];

        ifr.messageID = p_body[0];
        ifr.id = p_body[1];
        ifr.index = p_body[2];

        return ifr;
    }

    static create(rm: InvokeRequestMessage | InvokeResponseMessage, id: number, index: number) {
        const ifr = new InvokeFileRequestMessage();

        ifr.sender = rm.receiver;
        ifr.receiver = rm.sender;
        ifr.messageID = rm instanceof InvokeRequestMessage ? rm.requestMessageID : rm.responseMessageID;
        ifr.id = id;
        ifr.index = index;

        return ifr;
    }
}

export class InvokeFileResponseMessage extends MessageData {

    type = MessageType.invoke_file_response;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    index: number;
    data: Buffer;

    pack(): [string, Buffer] {
        const b_json = Buffer.from(JSON.stringify([this.messageID, this.id, this.index]));
        const b_json_length = Buffer.alloc(4);
        b_json_length.writeUInt32BE(b_json.length, 0);

        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.concat([b_json_length, b_json, this.data])
        ];
    }

    static parse(header: any[], body: Buffer) {
        const b_json_length = body.readUInt32BE(0);
        const b_json = JSON.parse(body.slice(4, 4 + b_json_length).toString());
        const ifr = new InvokeFileResponseMessage();

        ifr.sender = header[1];
        ifr.receiver = header[2];

        ifr.messageID = b_json[0];
        ifr.id = b_json[1];
        ifr.index = b_json[2];
        ifr.data = body.slice(4 + b_json_length);

        return ifr;
    }

    static create(rfm: InvokeFileRequestMessage, data: Buffer) {
        const ifr = new InvokeFileResponseMessage();

        ifr.sender = rfm.receiver;
        ifr.receiver = rfm.sender;
        ifr.messageID = rfm.messageID;
        ifr.id = rfm.id;
        ifr.index = rfm.index;
        ifr.data = data;

        return ifr;
    }
}

export class InvokeFileFailedMessage extends MessageData {

    type = MessageType.invoke_file_failed;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;
    error: string;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.messageID, this.id, this.error]))
        ];
    }

    static parse(header: any[], body: Buffer) {
        const p_body = JSON.parse(body.toString());
        const iff = new InvokeFileFailedMessage();

        iff.sender = header[1];
        iff.receiver = header[2];

        iff.messageID = p_body[0];
        iff.id = p_body[1];
        iff.error = p_body[2];

        return iff;
    }

    static create(rm: InvokeFileRequestMessage, err: Error) {
        const iff = new InvokeFileFailedMessage();

        iff.sender = rm.receiver;
        iff.receiver = rm.sender;
        iff.messageID = rm.messageID;
        iff.id = rm.id;
        iff.error = err.message;

        return iff;
    }
}

export class InvokeFileFinishMessage extends MessageData {

    type = MessageType.invoke_file_finish;
    sender: string;
    receiver: string;
    messageID: number;
    id: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.messageID, this.id]))
        ];
    }

    static parse(header: any[], body: Buffer) {
        const p_body = JSON.parse(body.toString());
        const iff = new InvokeFileFinishMessage();

        iff.sender = header[1];
        iff.receiver = header[2];

        iff.messageID = p_body[0];
        iff.id = p_body[1];

        return iff;
    }

    static create(rm: InvokeFileRequestMessage) {
        const iff = new InvokeFileFinishMessage();

        iff.sender = rm.receiver;
        iff.receiver = rm.sender;
        iff.messageID = rm.messageID;
        iff.id = rm.id;

        return iff;
    }
}

export class BroadcastMessage extends MessageData {

    type = MessageType.broadcast;
    sender: string;
    path: string;
    data: any;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.path]),
            Buffer.from(JSON.stringify(this.data))
        ];
    }

    static parse(header: any[], body: Buffer) {
        const bm = new BroadcastMessage();

        bm.sender = header[1];
        bm.path = header[2];

        bm.data = JSON.parse(body.toString());

        return bm;
    }

    static create(rv: RemoteInvoke, path: string, data: any) {
        const bm = new BroadcastMessage();

        bm.sender = rv.moduleName;
        bm.path = path;
        bm.data = data;

        return bm;
    }
}

export class BroadcastOpenMessage extends MessageData {

    type = MessageType.broadcast_open;
    path: string;
    messageID: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.path]),
            Buffer.from(this.messageID.toString())
        ];
    }

    static parse(header: any[], body: Buffer) {
        const bom = new BroadcastOpenMessage();

        bom.path = header[1];
        bom.messageID = Number.parseInt(body.toString());

        return bom;
    }

    static create(rv: RemoteInvoke, path: string) {
        const bom = new BroadcastOpenMessage();

        bom.path = path;
        bom.messageID = (<any>rv)._messageID++;

        return bom;
    }
}

export class BroadcastOpenFinishMessage extends MessageData {

    type = MessageType.broadcast_open_finish;
    messageID: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type]),
            Buffer.from(this.messageID.toString())
        ];
    }

    static parse(header: any[], body: Buffer) {
        const bof = new BroadcastOpenFinishMessage();

        bof.messageID = Number.parseInt(body.toString());

        return bof;
    }

    static create(bom: BroadcastOpenMessage) {
        const bof = new BroadcastOpenFinishMessage();

        bof.messageID = bom.messageID;

        return bof;
    }
}

export class BroadcastCloseMessage extends MessageData {
    
        type = MessageType.broadcast_close;
        path: string;
        messageID: number;
    
        pack(): [string, Buffer] {
            return [
                JSON.stringify([this.type, this.path]),
                Buffer.from(this.messageID.toString())
            ];
        }
    
        static parse(header: any[], body: Buffer) {
            const bcm = new BroadcastCloseMessage();
    
            bcm.path = header[1];
            bcm.messageID = Number.parseInt(body.toString());
    
            return bcm;
        }
    
        static create(rv: RemoteInvoke, path: string) {
            const bcm = new BroadcastCloseMessage();
    
            bcm.path = path;
            bcm.messageID = (<any>rv)._messageID++;
    
            return bcm;
        }
    }
    
    export class BroadcastCloseFinishMessage extends MessageData {
    
        type = MessageType.broadcast_close_finish;
        messageID: number;
    
        pack(): [string, Buffer] {
            return [
                JSON.stringify([this.type]),
                Buffer.from(this.messageID.toString())
            ];
        }
    
        static parse(header: any[], body: Buffer) {
            const bcf = new BroadcastCloseFinishMessage();
    
            bcf.messageID = Number.parseInt(body.toString());
    
            return bcf;
        }
    
        static create(bom: BroadcastOpenMessage) {
            const bcf = new BroadcastCloseFinishMessage();
    
            bcf.messageID = bom.messageID;
    
            return bcf;
        }
    }