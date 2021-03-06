import { SendingFile } from '../interfaces/InvokeSendingData';
import { MessageType } from '../interfaces/MessageType';
import { InvokeSendingData } from '../interfaces/InvokeSendingData';
import { MessageRouting } from './MessageRouting';

/**
 * 所有消息的基类
 */
export abstract class MessageData {

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
    static parse(mr: MessageRouting, header: any[], body: Buffer): MessageData {
        throw new Error('未实现解析方法');
    }

    /**
     * 创建消息
     */
    static create(mr: MessageRouting, ...args: any[]): MessageData {
        throw new Error('未实现创建方法');
    }

    /**
     * 返回序列化后的对象。    
     * 
     * 注意：以 "_" 开头的属性或字段都将被忽略
     */
    toString() {
        //过滤或转换要序列化的属性
        const filter = (key: string, value: any) => {
            if (key.startsWith('_'))
                return undefined;
            else if (key === 'type')    //打印消息类型名称
                return MessageType[value];
            else if (value != null && value.type === 'Buffer' && Array.isArray(value.data))
                //这样写是因为Buffer.isBuffer在JSON.stringify中没用
                return `<Buffer length=${value.data.length}>`;
            else
                return value;
        };

        return JSON.stringify(this, filter, 4);
    }
}

export class InvokeRequestMessage extends MessageData {

    type = MessageType.invoke_request;
    sender: string;
    receiver: string;
    path: string;
    requestMessageID: number;
    data: any;
    files: { id: number, size: number | null, splitNumber: number | null, name: string, _data?: SendingFile /* 内部发送文件时使用 */ }[]

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver, this.path, this.requestMessageID]),
            Buffer.from(JSON.stringify([this.data, this.files.map(item => [item.id, item.size, item.splitNumber, item.name])]))
        ];
    }

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const irm = new InvokeRequestMessage();
        irm.sender = header[1];
        irm.receiver = header[2];
        irm.path = header[3];
        irm.requestMessageID = header[4];

        if (irm.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${irm.sender} ，receiver：${irm.receiver}`);

        if (irm.path.length > MessageRouting.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${MessageRouting.pathMaxLength}个字符`);

        const p_body = JSON.parse(body.toString());
        irm.data = p_body[0];
        irm.files = p_body[1].map((item: any) => {
            //确保size与splitNumber的数据类型
            if ((Number.isSafeInteger(item[1]) && item[1] >= 0 || item[1] === null) && (Number.isSafeInteger(item[2]) && item[2] >= 0 || item[2] === null))
                return { id: item[0], size: item[1], splitNumber: item[2], name: item[3] };
            else
                throw new Error('消息数据类型错误');
        });

        return irm;
    }

    static create(mr: MessageRouting, messageID: number, receiver: string, path: string, data: InvokeSendingData) {
        if (path.length > MessageRouting.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${MessageRouting.pathMaxLength}个字符`);

        const irm = new InvokeRequestMessage();

        irm.sender = mr.moduleName;
        irm.receiver = receiver;
        irm.path = path;
        irm.requestMessageID = messageID;
        irm.data = data.data;
        irm.files = data.files == null ? [] : data.files.map((item, index) =>
            Buffer.isBuffer(item.file) ?
                { id: index, size: item.file.length, splitNumber: Math.ceil(item.file.length / MessageRouting.filePieceSize), name: item.name, _data: item } :
                { id: index, size: null, splitNumber: null, name: item.name, _data: item }
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
    files: { id: number, size: number | null, splitNumber: number | null, name: string, _data?: SendingFile }[]

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.responseMessageID, this.data, this.files.map(item => [item.id, item.size, item.splitNumber, item.name])]))
        ];
    }

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const irm = new InvokeResponseMessage();
        irm.sender = header[1];
        irm.receiver = header[2];

        if (irm.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${irm.sender} ，receiver：${irm.receiver}`);

        const p_body = JSON.parse(body.toString());
        irm.requestMessageID = p_body[0];
        irm.responseMessageID = p_body[1];
        irm.data = p_body[2];
        irm.files = p_body[3].map((item: any) => {
            //确保size与splitNumber的数据类型
            if ((Number.isSafeInteger(item[1]) && item[1] >= 0 || item[1] === null) && (Number.isSafeInteger(item[2]) && item[2] >= 0 || item[2] === null))
                return { id: item[0], size: item[1], splitNumber: item[2], name: item[3] };
            else
                throw new Error('消息数据类型错误');
        });

        return irm;
    }

    static create(mr: MessageRouting, rm: InvokeRequestMessage, messageID: number, data: InvokeSendingData) {
        const irm = new InvokeResponseMessage();

        irm.sender = mr.moduleName;
        irm.receiver = rm.sender;
        irm.requestMessageID = rm.requestMessageID;
        irm.responseMessageID = messageID;
        irm.data = data.data;
        irm.files = data.files == null ? [] : data.files.map((item, index) =>
            Buffer.isBuffer(item.file) ?
                { id: index, size: item.file.length, splitNumber: Math.ceil(item.file.length / MessageRouting.filePieceSize), name: item.name, _data: item } :
                { id: index, size: null, splitNumber: null, name: item.name, _data: item }
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

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const ifm = new InvokeFinishMessage();
        ifm.sender = header[1];
        ifm.receiver = header[2];

        if (ifm.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifm.sender} ，receiver：${ifm.receiver}`);

        ifm.responseMessageID = Number.parseInt(body.toString());

        return ifm;
    }

    static create(mr: MessageRouting, rm: InvokeResponseMessage) {
        const ifm = new InvokeFinishMessage();

        ifm.sender = mr.moduleName;
        ifm.receiver = rm.sender;
        ifm.responseMessageID = rm.responseMessageID;

        return ifm;
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

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const ifa = new InvokeFailedMessage();
        ifa.sender = header[1];
        ifa.receiver = header[2];

        if (ifa.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifa.sender} ，receiver：${ifa.receiver}`);

        const p_body = JSON.parse(body.toString());
        ifa.requestMessageID = p_body[0];
        ifa.error = p_body[1];

        return ifa;
    }

    static create(mr: MessageRouting, rm: InvokeRequestMessage, err: Error) {
        const ifa = new InvokeFailedMessage();

        ifa.sender = mr.moduleName;
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

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const ifr = new InvokeFileRequestMessage();
        ifr.sender = header[1];
        ifr.receiver = header[2];

        if (ifr.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifr.sender} ，receiver：${ifr.receiver}`);

        const p_body = JSON.parse(body.toString());
        ifr.messageID = p_body[0];
        ifr.id = p_body[1];
        ifr.index = p_body[2];

        if (!Number.isSafeInteger(ifr.index) || ifr.index < 0)
            throw new Error('文件片段索引数据类型错误');

        return ifr;
    }

    static create(mr: MessageRouting, rm: InvokeRequestMessage | InvokeResponseMessage, id: number, index: number) {
        if (!Number.isSafeInteger(index) || index < 0)
            throw new Error('文件片段索引数据类型错误');

        const ifr = new InvokeFileRequestMessage();

        ifr.sender = mr.moduleName;
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

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const ifr = new InvokeFileResponseMessage();
        ifr.sender = header[1];
        ifr.receiver = header[2];

        if (ifr.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifr.sender} ，receiver：${ifr.receiver}`);

        const b_json_length = body.readUInt32BE(0);
        const b_json = JSON.parse(body.slice(4, 4 + b_json_length).toString());
        ifr.messageID = b_json[0];
        ifr.id = b_json[1];
        ifr.index = b_json[2];
        ifr.data = body.slice(4 + b_json_length);

        if (!Number.isSafeInteger(ifr.index) || ifr.index < 0)
            throw new Error('文件片段索引数据类型错误');

        return ifr;
    }

    static create(mr: MessageRouting, rfm: InvokeFileRequestMessage, data: Buffer) {
        const ifr = new InvokeFileResponseMessage();

        ifr.sender = mr.moduleName;
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

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const iff = new InvokeFileFailedMessage();
        iff.sender = header[1];
        iff.receiver = header[2];

        if (iff.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${iff.sender} ，receiver：${iff.receiver}`);

        const p_body = JSON.parse(body.toString());
        iff.messageID = p_body[0];
        iff.id = p_body[1];
        iff.error = p_body[2];

        return iff;
    }

    static create(mr: MessageRouting, rm: InvokeFileRequestMessage, err: Error) {
        const iff = new InvokeFileFailedMessage();

        iff.sender = mr.moduleName;
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

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const iff = new InvokeFileFinishMessage();
        iff.sender = header[1];
        iff.receiver = header[2];

        if (iff.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${iff.sender} ，receiver：${iff.receiver}`);

        const p_body = JSON.parse(body.toString());
        iff.messageID = p_body[0];
        iff.id = p_body[1];

        return iff;
    }

    static create(mr: MessageRouting, rm: InvokeFileRequestMessage) {
        const iff = new InvokeFileFinishMessage();

        iff.sender = mr.moduleName;
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
            JSON.stringify([this.type, this.sender, null, this.path]),
            Buffer.from(JSON.stringify(this.data))
        ];
    }

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const bm = new BroadcastMessage();

        bm.sender = header[1];
        bm.path = header[3];

        if (bm.path.length > MessageRouting.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${MessageRouting.pathMaxLength}个字符`);

        bm.data = JSON.parse(body.toString());

        return bm;
    }

    static create(mr: MessageRouting, path: string, data: any) {
        if (path.length > MessageRouting.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${MessageRouting.pathMaxLength}个字符`);

        const bm = new BroadcastMessage();

        bm.sender = mr.moduleName;
        bm.path = path;
        bm.data = data;

        return bm;
    }
}

export class BroadcastOpenMessage extends MessageData {

    type = MessageType.broadcast_open;
    messageID: number;
    broadcastSender: string;   //广播的发送者  
    path: string;              //广播的路径

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type]),
            Buffer.from(JSON.stringify([this.messageID, this.broadcastSender, this.path]))
        ];
    }

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const bom = new BroadcastOpenMessage();

        const p_body = JSON.parse(body.toString());
        bom.messageID = p_body[0];
        bom.broadcastSender = p_body[1];
        bom.path = p_body[2];

        if (bom.broadcastSender !== mr.moduleName)
            throw new Error(`对方尝试打开不属于自己的广播。对方所期待的广播发送者:${bom.broadcastSender}`);

        if (bom.path.length > MessageRouting.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${MessageRouting.pathMaxLength}个字符`);

        return bom;
    }

    static create(mr: MessageRouting, messageID: number, broadcastSender: string, path: string) {
        if (path.length > MessageRouting.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${MessageRouting.pathMaxLength}个字符`);

        const bom = new BroadcastOpenMessage();

        bom.messageID = messageID;
        bom.broadcastSender = broadcastSender;
        bom.path = path;

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

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const bof = new BroadcastOpenFinishMessage();

        bof.messageID = Number.parseInt(body.toString());

        return bof;
    }

    static create(mr: MessageRouting, bom: BroadcastOpenMessage) {
        const bof = new BroadcastOpenFinishMessage();

        bof.messageID = bom.messageID;

        return bof;
    }
}

export class BroadcastCloseMessage extends MessageData {

    type = MessageType.broadcast_close;
    broadcastSender: string;   //广播的发送者  
    path: string;              //广播的路径
    includeAncestor: boolean;  //是否需要一并关闭所有父级监听器

    pack(): [string, Buffer] {
        return [
            JSON.stringify([this.type]),
            Buffer.from(JSON.stringify([this.broadcastSender, this.path, this.includeAncestor]))
        ];
    }

    static parse(mr: MessageRouting, header: any[], body: Buffer) {
        const bcm = new BroadcastCloseMessage();

        const p_body = JSON.parse(body.toString());
        bcm.broadcastSender = p_body[0];
        bcm.path = p_body[1];
        bcm.includeAncestor = p_body[2];

        if (bcm.broadcastSender !== mr.moduleName)
            throw new Error(`对方尝试关闭不属于自己的广播。对方所期待的广播发送者:${bcm.broadcastSender}`);

        if (bcm.path.length > MessageRouting.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${MessageRouting.pathMaxLength}个字符`);

        return bcm;
    }

    static create(mr: MessageRouting, broadcastSender: string, path: string, includeAncestor: boolean = false) {
        if (path.length > MessageRouting.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${MessageRouting.pathMaxLength}个字符`);

        const bcm = new BroadcastCloseMessage();

        bcm.broadcastSender = broadcastSender;
        bcm.path = path;
        bcm.includeAncestor = includeAncestor;

        return bcm;
    }
}