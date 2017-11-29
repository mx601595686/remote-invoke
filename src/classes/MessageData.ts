import { RemoteInvoke } from './RemoteInvoke';
import { MessageType } from './../interfaces/MessageType';
import { SendingFile } from '../interfaces/SendingFile';

/**
 * 所有消息的基类
 */
export abstract class Message {

    abstract type: MessageType;

    /**
     * 打包这条消息。返回[消息头部，消息body]       
     * 注意：打包后的头部是一个数组，数组的第一项总是type，如果还有那么第二项就是sender，第三项就是receiver，第四项就是path
     */
    abstract pack(): [string, Buffer];

    /**
     * 解析消息
     * @param ri RemoteInvoke
     * @param header 已近被JSON.parse后的消息头部
     * @param body 消息body
     */
    static parse(ri: RemoteInvoke, header: any[], body: Buffer): Message {
        throw new Error('未实现解析方法');
    }

    /**
     * 创建消息
     */
    static create(ri: RemoteInvoke, ...args: any[]): Message {
        throw new Error('未实现创建方法');
    }
}

export class InvokeRequestMessage extends Message {

    type = MessageType.invoke_request;
    sender: string;
    receiver: string;
    path: string;
    requestMessageID: number;
    data: any;
    files: { id: number, size: number | null, splitNumber: number | null, name: string }[]

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver, this.path]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.data, this.files.map(item => [item.id, item.size, item.splitNumber, item.name])]))
        ];
    }

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const irm = new InvokeRequestMessage();
        irm.sender = header[1];
        irm.receiver = header[2];
        irm.path = header[3];

        if (irm.receiver !== ri.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${irm.sender} ，receiver：${irm.receiver}`);

        const p_body = JSON.parse(body.toString());
        irm.requestMessageID = p_body[0];
        irm.data = p_body[1];
        irm.files = p_body[2].map((item: any) => ({ id: item[0], size: item[1], splitNumber: item[2], name: item[3] }));

        return irm;
    }

    static create(ri: RemoteInvoke, messageID: number, receiver: string, path: string, data: any, files: { name: string, file: SendingFile }[] = []) {
        const irm = new InvokeRequestMessage();

        irm.sender = ri.moduleName;
        irm.receiver = receiver;
        irm.path = path;
        irm.requestMessageID = messageID;
        irm.data = data;
        irm.files = files.map((item, index) =>
            Buffer.isBuffer(item.file) ?
                { id: index, size: item.file.length, splitNumber: Math.ceil(item.file.length / ri.filePieceSize), name: item.name } :
                { id: index, size: null, splitNumber: null, name: item.name }
        );

        return irm;
    }
}

export class InvokeResponseMessage extends Message {

    type = MessageType.invoke_response;
    sender: string;
    receiver: string;
    requestMessageID: number;
    responseMessageID: number;
    data: any;
    files: { id: number, size: number | null, splitNumber: number | null, name: string }[]

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.responseMessageID, this.data, this.files.map(item => [item.id, item.size, item.splitNumber, item.name])]))
        ];
    }

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const irm = new InvokeResponseMessage();
        irm.sender = header[1];
        irm.receiver = header[2];

        if (irm.receiver !== ri.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${irm.sender} ，receiver：${irm.receiver}`);

        const p_body = JSON.parse(body.toString());
        irm.requestMessageID = p_body[0];
        irm.responseMessageID = p_body[1];
        irm.data = p_body[2];
        irm.files = p_body[3].map((item: any) => ({ id: item[0], size: item[1], splitNumber: item[2], name: item[3] }));

        return irm;
    }

    static create(ri: RemoteInvoke, rm: InvokeRequestMessage, messageID: number, data: any, files: { name: string, file: SendingFile }[] = []) {
        const irm = new InvokeResponseMessage();

        irm.sender = ri.moduleName;
        irm.receiver = rm.sender;
        irm.requestMessageID = rm.requestMessageID;
        irm.responseMessageID = messageID;
        irm.data = data;
        irm.files = files.map((item, index) =>
            Buffer.isBuffer(item.file) ?
                { id: index, size: item.file.length, splitNumber: Math.ceil(item.file.length / ri.filePieceSize), name: item.name } :
                { id: index, size: null, splitNumber: null, name: item.name }
        );

        return irm;
    }
}

export class InvokeFinishMessage extends Message {

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

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const ifm = new InvokeFinishMessage();
        ifm.sender = header[1];
        ifm.receiver = header[2];

        if (ifm.receiver !== ri.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifm.sender} ，receiver：${ifm.receiver}`);

        ifm.responseMessageID = Number.parseInt(body.toString());

        return ifm;
    }

    static create(ri: RemoteInvoke, rm: InvokeResponseMessage) {
        const ifm = new InvokeFinishMessage();

        ifm.sender = ri.moduleName;
        ifm.receiver = rm.sender;
        ifm.responseMessageID = rm.responseMessageID;

        return ifm;
    }
}

export class InvokeFailedMessage extends Message {

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

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const ifa = new InvokeFailedMessage();
        ifa.sender = header[1];
        ifa.receiver = header[2];

        if (ifa.receiver !== ri.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifa.sender} ，receiver：${ifa.receiver}`);

        const p_body = JSON.parse(body.toString());
        ifa.requestMessageID = p_body[0];
        ifa.error = p_body[1];

        return ifa;
    }

    static create(ri: RemoteInvoke, rm: InvokeRequestMessage, err: Error) {
        const ifa = new InvokeFailedMessage();

        ifa.sender = ri.moduleName;
        ifa.receiver = rm.sender;
        ifa.requestMessageID = rm.requestMessageID;
        ifa.error = err.message;

        return ifa;
    }
}

export class InvokeFileRequestMessage extends Message {

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

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const ifr = new InvokeFileRequestMessage();
        ifr.sender = header[1];
        ifr.receiver = header[2];

        if (ifr.receiver !== ri.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifr.sender} ，receiver：${ifr.receiver}`);

        const p_body = JSON.parse(body.toString());
        ifr.messageID = p_body[0];
        ifr.id = p_body[1];
        ifr.index = p_body[2];

        return ifr;
    }

    static create(ri: RemoteInvoke, rm: InvokeRequestMessage | InvokeResponseMessage, id: number, index: number) {
        const ifr = new InvokeFileRequestMessage();

        ifr.sender = ri.moduleName;
        ifr.receiver = rm.sender;
        ifr.messageID = rm instanceof InvokeRequestMessage ? rm.requestMessageID : rm.responseMessageID;
        ifr.id = id;
        ifr.index = index;

        return ifr;
    }
}

export class InvokeFileResponseMessage extends Message {

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

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const ifr = new InvokeFileResponseMessage();
        ifr.sender = header[1];
        ifr.receiver = header[2];

        if (ifr.receiver !== ri.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifr.sender} ，receiver：${ifr.receiver}`);

        const b_json_length = body.readUInt32BE(0);
        const b_json = JSON.parse(body.slice(4, 4 + b_json_length).toString());
        ifr.messageID = b_json[0];
        ifr.id = b_json[1];
        ifr.index = b_json[2];
        ifr.data = body.slice(4 + b_json_length);

        return ifr;
    }

    static create(ri: RemoteInvoke, rfm: InvokeFileRequestMessage, data: Buffer) {
        const ifr = new InvokeFileResponseMessage();

        ifr.sender = ri.moduleName;
        ifr.receiver = rfm.sender;
        ifr.messageID = rfm.messageID;
        ifr.id = rfm.id;
        ifr.index = rfm.index;
        ifr.data = data;

        return ifr;
    }
}

export class InvokeFileFailedMessage extends Message {

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

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const iff = new InvokeFileFailedMessage();
        iff.sender = header[1];
        iff.receiver = header[2];

        if (iff.receiver !== ri.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${iff.sender} ，receiver：${iff.receiver}`);

        const p_body = JSON.parse(body.toString());
        iff.messageID = p_body[0];
        iff.id = p_body[1];
        iff.error = p_body[2];

        return iff;
    }

    static create(ri: RemoteInvoke, rm: InvokeFileRequestMessage, err: Error) {
        const iff = new InvokeFileFailedMessage();

        iff.sender = ri.moduleName;
        iff.receiver = rm.sender;
        iff.messageID = rm.messageID;
        iff.id = rm.id;
        iff.error = err.message;

        return iff;
    }
}

export class InvokeFileFinishMessage extends Message {

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

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const iff = new InvokeFileFinishMessage();
        iff.sender = header[1];
        iff.receiver = header[2];

        if (iff.receiver !== ri.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${iff.sender} ，receiver：${iff.receiver}`);

        const p_body = JSON.parse(body.toString());
        iff.messageID = p_body[0];
        iff.id = p_body[1];

        return iff;
    }

    static create(ri: RemoteInvoke, rm: InvokeFileRequestMessage) {
        const iff = new InvokeFileFinishMessage();

        iff.sender = ri.moduleName;
        iff.receiver = rm.sender;
        iff.messageID = rm.messageID;
        iff.id = rm.id;

        return iff;
    }
}

export class BroadcastMessage extends Message {

    type = MessageType.broadcast;
    sender: string;
    path: string;
    data: any;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, null, this.path]),
            Buffer.from(JSON.stringify(this.data))
        ];
    }

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const bm = new BroadcastMessage();

        bm.sender = header[1];
        bm.path = header[3];

        bm.data = JSON.parse(body.toString());

        return bm;
    }

    static create(ri: RemoteInvoke, path: string, data: any) {
        const bm = new BroadcastMessage();

        bm.sender = ri.moduleName;
        bm.path = path;
        bm.data = data;

        return bm;
    }
}

export class BroadcastOpenMessage extends Message {

    type = MessageType.broadcast_open;
    path: string;
    messageID: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, null, null, this.path]),
            Buffer.from(this.messageID.toString())
        ];
    }

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const bom = new BroadcastOpenMessage();

        bom.path = header[3];
        bom.messageID = Number.parseInt(body.toString());

        return bom;
    }

    static create(ri: RemoteInvoke, messageID: number, path: string) {
        const bom = new BroadcastOpenMessage();

        bom.path = path;
        bom.messageID = messageID;

        return bom;
    }
}

export class BroadcastOpenFinishMessage extends Message {

    type = MessageType.broadcast_open_finish;
    messageID: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type]),
            Buffer.from(this.messageID.toString())
        ];
    }

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const bof = new BroadcastOpenFinishMessage();

        bof.messageID = Number.parseInt(body.toString());

        return bof;
    }

    static create(ri: RemoteInvoke, bom: BroadcastOpenMessage) {
        const bof = new BroadcastOpenFinishMessage();

        bof.messageID = bom.messageID;

        return bof;
    }
}

export class BroadcastCloseMessage extends Message {

    type = MessageType.broadcast_close;
    path: string;
    messageID: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, null, null, this.path]),
            Buffer.from(this.messageID.toString())
        ];
    }

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const bcm = new BroadcastCloseMessage();

        bcm.path = header[3];
        bcm.messageID = Number.parseInt(body.toString());

        return bcm;
    }

    static create(ri: RemoteInvoke, messageID: number, path: string) {
        const bcm = new BroadcastCloseMessage();

        bcm.path = path;
        bcm.messageID = messageID;

        return bcm;
    }
}

export class BroadcastCloseFinishMessage extends Message {

    type = MessageType.broadcast_close_finish;
    messageID: number;

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type]),
            Buffer.from(this.messageID.toString())
        ];
    }

    static parse(ri: RemoteInvoke, header: any[], body: Buffer) {
        const bcf = new BroadcastCloseFinishMessage();

        bcf.messageID = Number.parseInt(body.toString());

        return bcf;
    }

    static create(ri: RemoteInvoke, bom: BroadcastOpenMessage) {
        const bcf = new BroadcastCloseFinishMessage();

        bcf.messageID = bom.messageID;

        return bcf;
    }
}