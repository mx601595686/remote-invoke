"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MessageType_1 = require("../interfaces/MessageType");
/**
 * 所有消息的基类
 */
class MessageData {
    /**
     * 解析消息
     * @param mr MessageRouting
     * @param header 已近被JSON.parse后的消息头部
     * @param body 消息body
     */
    static parse(mr, header, body) {
        throw new Error('未实现解析方法');
    }
    /**
     * 创建消息
     */
    static create(mr, ...args) {
        throw new Error('未实现创建方法');
    }
    /**
     * 返回序列化后的对象。
     *
     * 注意：以 "_" 开头的属性或字段都将被忽略
     */
    toString() {
        //过滤或转换要序列化的属性
        const filter = (key, value) => {
            if (key.startsWith('_'))
                return undefined;
            else if (key === 'type')
                return MessageType_1.MessageType[value];
            else if (value != null && value.type === 'Buffer' && Array.isArray(value.data))
                //这样写是因为Buffer.isBuffer在JSON.stringify中没用
                return `<Buffer length=${value.data.length}>`;
            else
                return value;
        };
        return JSON.stringify(this, filter, 4);
    }
}
exports.MessageData = MessageData;
class InvokeRequestMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.invoke_request;
    }
    pack() {
        return [
            JSON.stringify([this.type, this.sender, this.receiver, this.path]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.data, this.files.map(item => [item.id, item.size, item.splitNumber, item.name])]))
        ];
    }
    static parse(mr, header, body) {
        const irm = new InvokeRequestMessage();
        irm.sender = header[1];
        irm.receiver = header[2];
        irm.path = header[3];
        if (irm.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${irm.sender} ，receiver：${irm.receiver}`);
        if (irm.path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        const p_body = JSON.parse(body.toString());
        irm.requestMessageID = p_body[0];
        irm.data = p_body[1];
        irm.files = p_body[2].map((item) => {
            //确保size与splitNumber的数据类型
            if ((Number.isSafeInteger(item[1]) && item[1] >= 0 || item[1] === null) && (Number.isSafeInteger(item[2]) && item[2] >= 0 || item[2] === null))
                return { id: item[0], size: item[1], splitNumber: item[2], name: item[3] };
            else
                throw new Error('消息数据类型错误');
        });
        return irm;
    }
    static create(mr, messageID, receiver, path, data) {
        if (path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        const irm = new InvokeRequestMessage();
        irm.sender = mr.moduleName;
        irm.receiver = receiver;
        irm.path = path;
        irm.requestMessageID = messageID;
        irm.data = data.data;
        irm.files = data.files == null ? [] : data.files.map((item, index) => Buffer.isBuffer(item.file) ?
            { id: index, size: item.file.length, splitNumber: Math.ceil(item.file.length / mr.filePieceSize), name: item.name, _data: item } :
            { id: index, size: null, splitNumber: null, name: item.name, _data: item });
        return irm;
    }
}
exports.InvokeRequestMessage = InvokeRequestMessage;
class InvokeResponseMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.invoke_response;
    }
    pack() {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.responseMessageID, this.data, this.files.map(item => [item.id, item.size, item.splitNumber, item.name])]))
        ];
    }
    static parse(mr, header, body) {
        const irm = new InvokeResponseMessage();
        irm.sender = header[1];
        irm.receiver = header[2];
        if (irm.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${irm.sender} ，receiver：${irm.receiver}`);
        const p_body = JSON.parse(body.toString());
        irm.requestMessageID = p_body[0];
        irm.responseMessageID = p_body[1];
        irm.data = p_body[2];
        irm.files = p_body[3].map((item) => {
            //确保size与splitNumber的数据类型
            if ((Number.isSafeInteger(item[1]) && item[1] >= 0 || item[1] === null) && (Number.isSafeInteger(item[2]) && item[2] >= 0 || item[2] === null))
                return { id: item[0], size: item[1], splitNumber: item[2], name: item[3] };
            else
                throw new Error('消息数据类型错误');
        });
        return irm;
    }
    static create(mr, rm, messageID, data) {
        const irm = new InvokeResponseMessage();
        irm.sender = mr.moduleName;
        irm.receiver = rm.sender;
        irm.requestMessageID = rm.requestMessageID;
        irm.responseMessageID = messageID;
        irm.data = data.data;
        irm.files = data.files == null ? [] : data.files.map((item, index) => Buffer.isBuffer(item.file) ?
            { id: index, size: item.file.length, splitNumber: Math.ceil(item.file.length / mr.filePieceSize), name: item.name, _data: item } :
            { id: index, size: null, splitNumber: null, name: item.name, _data: item });
        return irm;
    }
}
exports.InvokeResponseMessage = InvokeResponseMessage;
class InvokeFinishMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.invoke_finish;
    }
    pack() {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(this.responseMessageID.toString())
        ];
    }
    static parse(mr, header, body) {
        const ifm = new InvokeFinishMessage();
        ifm.sender = header[1];
        ifm.receiver = header[2];
        if (ifm.receiver !== mr.moduleName)
            throw new Error(`收到了不属于自己的消息。sender：${ifm.sender} ，receiver：${ifm.receiver}`);
        ifm.responseMessageID = Number.parseInt(body.toString());
        return ifm;
    }
    static create(mr, rm) {
        const ifm = new InvokeFinishMessage();
        ifm.sender = mr.moduleName;
        ifm.receiver = rm.sender;
        ifm.responseMessageID = rm.responseMessageID;
        return ifm;
    }
}
exports.InvokeFinishMessage = InvokeFinishMessage;
class InvokeFailedMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.invoke_failed;
    }
    pack() {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.requestMessageID, this.error]))
        ];
    }
    static parse(mr, header, body) {
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
    static create(mr, rm, err) {
        const ifa = new InvokeFailedMessage();
        ifa.sender = mr.moduleName;
        ifa.receiver = rm.sender;
        ifa.requestMessageID = rm.requestMessageID;
        ifa.error = err.message;
        return ifa;
    }
}
exports.InvokeFailedMessage = InvokeFailedMessage;
class InvokeFileRequestMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.invoke_file_request;
    }
    pack() {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.messageID, this.id, this.index]))
        ];
    }
    static parse(mr, header, body) {
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
    static create(mr, rm, id, index) {
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
exports.InvokeFileRequestMessage = InvokeFileRequestMessage;
class InvokeFileResponseMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.invoke_file_response;
    }
    pack() {
        const b_json = Buffer.from(JSON.stringify([this.messageID, this.id, this.index]));
        const b_json_length = Buffer.alloc(4);
        b_json_length.writeUInt32BE(b_json.length, 0);
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.concat([b_json_length, b_json, this.data])
        ];
    }
    static parse(mr, header, body) {
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
    static create(mr, rfm, data) {
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
exports.InvokeFileResponseMessage = InvokeFileResponseMessage;
class InvokeFileFailedMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.invoke_file_failed;
    }
    pack() {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.messageID, this.id, this.error]))
        ];
    }
    static parse(mr, header, body) {
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
    static create(mr, rm, err) {
        const iff = new InvokeFileFailedMessage();
        iff.sender = mr.moduleName;
        iff.receiver = rm.sender;
        iff.messageID = rm.messageID;
        iff.id = rm.id;
        iff.error = err.message;
        return iff;
    }
}
exports.InvokeFileFailedMessage = InvokeFileFailedMessage;
class InvokeFileFinishMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.invoke_file_finish;
    }
    pack() {
        return [
            JSON.stringify([this.type, this.sender, this.receiver]),
            Buffer.from(JSON.stringify([this.messageID, this.id]))
        ];
    }
    static parse(mr, header, body) {
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
    static create(mr, rm) {
        const iff = new InvokeFileFinishMessage();
        iff.sender = mr.moduleName;
        iff.receiver = rm.sender;
        iff.messageID = rm.messageID;
        iff.id = rm.id;
        return iff;
    }
}
exports.InvokeFileFinishMessage = InvokeFileFinishMessage;
class BroadcastMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.broadcast;
    }
    pack() {
        return [
            JSON.stringify([this.type, this.sender, null, this.path]),
            Buffer.from(JSON.stringify(this.data))
        ];
    }
    static parse(mr, header, body) {
        const bm = new BroadcastMessage();
        bm.sender = header[1];
        bm.path = header[3];
        if (bm.path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        bm.data = JSON.parse(body.toString());
        return bm;
    }
    static create(mr, path, data) {
        if (path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        const bm = new BroadcastMessage();
        bm.sender = mr.moduleName;
        bm.path = path;
        bm.data = data;
        return bm;
    }
}
exports.BroadcastMessage = BroadcastMessage;
class BroadcastOpenMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.broadcast_open;
    }
    pack() {
        return [
            JSON.stringify([this.type]),
            Buffer.from(JSON.stringify([this.messageID, this.broadcastSender, this.path]))
        ];
    }
    static parse(mr, header, body) {
        const bom = new BroadcastOpenMessage();
        const p_body = JSON.parse(body.toString());
        bom.messageID = p_body[0];
        bom.broadcastSender = p_body[1];
        bom.path = p_body[2];
        if (bom.broadcastSender !== mr.moduleName)
            throw new Error(`对方尝试打开不属于自己的广播。对方所期待的广播发送者:${bom.broadcastSender}`);
        if (bom.path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        return bom;
    }
    static create(mr, messageID, broadcastSender, path) {
        if (path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        const bom = new BroadcastOpenMessage();
        bom.messageID = messageID;
        bom.broadcastSender = broadcastSender;
        bom.path = path;
        return bom;
    }
}
exports.BroadcastOpenMessage = BroadcastOpenMessage;
class BroadcastOpenFinishMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.broadcast_open_finish;
    }
    pack() {
        return [
            JSON.stringify([this.type]),
            Buffer.from(this.messageID.toString())
        ];
    }
    static parse(mr, header, body) {
        const bof = new BroadcastOpenFinishMessage();
        bof.messageID = Number.parseInt(body.toString());
        return bof;
    }
    static create(mr, bom) {
        const bof = new BroadcastOpenFinishMessage();
        bof.messageID = bom.messageID;
        return bof;
    }
}
exports.BroadcastOpenFinishMessage = BroadcastOpenFinishMessage;
class BroadcastCloseMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.broadcast_close;
    }
    pack() {
        return [
            JSON.stringify([this.type]),
            Buffer.from(JSON.stringify([this.messageID, this.broadcastSender, this.path, this.includeAncestor]))
        ];
    }
    static parse(mr, header, body) {
        const bcm = new BroadcastCloseMessage();
        const p_body = JSON.parse(body.toString());
        bcm.messageID = p_body[0];
        bcm.broadcastSender = p_body[1];
        bcm.path = p_body[2];
        bcm.includeAncestor = p_body[3];
        if (bcm.broadcastSender !== mr.moduleName)
            throw new Error(`对方尝试关闭不属于自己的广播。对方所期待的广播发送者:${bcm.broadcastSender}`);
        if (bcm.path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        return bcm;
    }
    static create(mr, messageID, broadcastSender, path, includeAncestor = false) {
        if (path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        const bcm = new BroadcastCloseMessage();
        bcm.messageID = messageID;
        bcm.broadcastSender = broadcastSender;
        bcm.path = path;
        bcm.includeAncestor = includeAncestor;
        return bcm;
    }
}
exports.BroadcastCloseMessage = BroadcastCloseMessage;
class BroadcastCloseFinishMessage extends MessageData {
    constructor() {
        super(...arguments);
        this.type = MessageType_1.MessageType.broadcast_close_finish;
    }
    pack() {
        return [
            JSON.stringify([this.type]),
            Buffer.from(this.messageID.toString())
        ];
    }
    static parse(mr, header, body) {
        const bcf = new BroadcastCloseFinishMessage();
        bcf.messageID = Number.parseInt(body.toString());
        return bcf;
    }
    static create(mr, bcm) {
        const bcf = new BroadcastCloseFinishMessage();
        bcf.messageID = bcm.messageID;
        return bcf;
    }
}
exports.BroadcastCloseFinishMessage = BroadcastCloseFinishMessage;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsYXNzZXMvTWVzc2FnZURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSwyREFBd0Q7QUFJeEQ7O0dBRUc7QUFDSDtJQVNJOzs7OztPQUtHO0lBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFrQixFQUFFLE1BQWEsRUFBRSxJQUFZO1FBQ3hELE1BQU0sSUFBSSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFrQixFQUFFLEdBQUcsSUFBVztRQUM1QyxNQUFNLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsUUFBUTtRQUNKLGNBQWM7UUFDZCxNQUFNLE1BQU0sR0FBRyxDQUFDLEdBQVcsRUFBRSxLQUFVO1lBQ25DLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3BCLE1BQU0sQ0FBQyxTQUFTLENBQUM7WUFDckIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxNQUFNLENBQUM7Z0JBQ3BCLE1BQU0sQ0FBQyx5QkFBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzlCLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMzRSx5Q0FBeUM7Z0JBQ3pDLE1BQU0sQ0FBQyxrQkFBa0IsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUNsRCxJQUFJO2dCQUNBLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDckIsQ0FBQyxDQUFDO1FBRUYsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FB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R0FBRyxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdEMsR0FBRyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDaEIsR0FBRyxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFFdEMsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNmLENBQUM7Q0FDSjtBQTlDRCxzREE4Q0M7QUFFRCxpQ0FBeUMsU0FBUSxXQUFXO0lBQTVEOztRQUVJLFNBQUksR0FBRyx5QkFBVyxDQUFDLHNCQUFzQixDQUFDO0lBeUI5QyxDQUFDO0lBdEJHLElBQUk7UUFDQSxNQUFNLENBQUM7WUFDSCxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztTQUN6QyxDQUFDO0lBQ04sQ0FBQztJQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBa0IsRUFBRSxNQUFhLEVBQUUsSUFBWTtRQUN4RCxNQUFNLEdBQUcsR0FBRyxJQUFJLDJCQUEyQixFQUFFLENBQUM7UUFFOUMsR0FBRyxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBRWpELE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDZixDQUFDO0lBRUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFrQixFQUFFLEdBQTBCO1FBQ3hELE1BQU0sR0FBRyxHQUFHLElBQUksMkJBQTJCLEVBQUUsQ0FBQztRQUU5QyxHQUFHLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUM7UUFFOUIsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNmLENBQUM7Q0FDSjtBQTNCRCxrRUEyQkMiLCJmaWxlIjoiY2xhc3Nlcy9NZXNzYWdlRGF0YS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNlbmRpbmdGaWxlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9JbnZva2VTZW5kaW5nRGF0YSc7XHJcbmltcG9ydCB7IE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9NZXNzYWdlVHlwZSc7XHJcbmltcG9ydCB7IEludm9rZVNlbmRpbmdEYXRhIH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9JbnZva2VTZW5kaW5nRGF0YSc7XHJcbmltcG9ydCB7IE1lc3NhZ2VSb3V0aW5nIH0gZnJvbSAnLi9NZXNzYWdlUm91dGluZyc7XHJcblxyXG4vKipcclxuICog5omA5pyJ5raI5oGv55qE5Z+657G7XHJcbiAqL1xyXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIGFic3RyYWN0IHR5cGU6IE1lc3NhZ2VUeXBlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5omT5YyF6L+Z5p2h5raI5oGv44CC6L+U5ZueW+a2iOaBr+WktOmDqO+8jOa2iOaBr2JvZHldICAgICAgIFxyXG4gICAgICovXHJcbiAgICBhYnN0cmFjdCBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDop6PmnpDmtojmga9cclxuICAgICAqIEBwYXJhbSBtciBNZXNzYWdlUm91dGluZ1xyXG4gICAgICogQHBhcmFtIGhlYWRlciDlt7Lov5HooqtKU09OLnBhcnNl5ZCO55qE5raI5oGv5aS06YOoXHJcbiAgICAgKiBAcGFyYW0gYm9keSDmtojmga9ib2R5XHJcbiAgICAgKi9cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcik6IE1lc3NhZ2VEYXRhIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+acquWunueOsOino+aekOaWueazlScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Yib5bu65raI5oGvXHJcbiAgICAgKi9cclxuICAgIHN0YXRpYyBjcmVhdGUobXI6IE1lc3NhZ2VSb3V0aW5nLCAuLi5hcmdzOiBhbnlbXSk6IE1lc3NhZ2VEYXRhIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+acquWunueOsOWIm+W7uuaWueazlScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6L+U5Zue5bqP5YiX5YyW5ZCO55qE5a+56LGh44CCICAgIFxyXG4gICAgICogXHJcbiAgICAgKiDms6jmhI/vvJrku6UgXCJfXCIg5byA5aS055qE5bGe5oCn5oiW5a2X5q616YO95bCG6KKr5b+955WlXHJcbiAgICAgKi9cclxuICAgIHRvU3RyaW5nKCkge1xyXG4gICAgICAgIC8v6L+H5ruk5oiW6L2s5o2i6KaB5bqP5YiX5YyW55qE5bGe5oCnXHJcbiAgICAgICAgY29uc3QgZmlsdGVyID0gKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgnXycpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgZWxzZSBpZiAoa2V5ID09PSAndHlwZScpICAgIC8v5omT5Y2w5raI5oGv57G75Z6L5ZCN56ewXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTWVzc2FnZVR5cGVbdmFsdWVdO1xyXG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSAhPSBudWxsICYmIHZhbHVlLnR5cGUgPT09ICdCdWZmZXInICYmIEFycmF5LmlzQXJyYXkodmFsdWUuZGF0YSkpXHJcbiAgICAgICAgICAgICAgICAvL+i/meagt+WGmeaYr+WboOS4ukJ1ZmZlci5pc0J1ZmZlcuWcqEpTT04uc3RyaW5naWZ55Lit5rKh55SoXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYDxCdWZmZXIgbGVuZ3RoPSR7dmFsdWUuZGF0YS5sZW5ndGh9PmA7XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodGhpcywgZmlsdGVyLCA0KTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEludm9rZVJlcXVlc3RNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5pbnZva2VfcmVxdWVzdDtcclxuICAgIHNlbmRlcjogc3RyaW5nO1xyXG4gICAgcmVjZWl2ZXI6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIHJlcXVlc3RNZXNzYWdlSUQ6IG51bWJlcjtcclxuICAgIGRhdGE6IGFueTtcclxuICAgIGZpbGVzOiB7IGlkOiBudW1iZXIsIHNpemU6IG51bWJlciB8IG51bGwsIHNwbGl0TnVtYmVyOiBudW1iZXIgfCBudWxsLCBuYW1lOiBzdHJpbmcsIF9kYXRhPzogU2VuZGluZ0ZpbGUgLyog5YaF6YOo5Y+R6YCB5paH5Lu25pe25L2/55SoICovIH1bXVxyXG5cclxuICAgIHBhY2soKTogW3N0cmluZywgQnVmZmVyXSB7XHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoW3RoaXMudHlwZSwgdGhpcy5zZW5kZXIsIHRoaXMucmVjZWl2ZXIsIHRoaXMucGF0aF0pLFxyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShbdGhpcy5yZXF1ZXN0TWVzc2FnZUlELCB0aGlzLmRhdGEsIHRoaXMuZmlsZXMubWFwKGl0ZW0gPT4gW2l0ZW0uaWQsIGl0ZW0uc2l6ZSwgaXRlbS5zcGxpdE51bWJlciwgaXRlbS5uYW1lXSldKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGlybSA9IG5ldyBJbnZva2VSZXF1ZXN0TWVzc2FnZSgpO1xyXG4gICAgICAgIGlybS5zZW5kZXIgPSBoZWFkZXJbMV07XHJcbiAgICAgICAgaXJtLnJlY2VpdmVyID0gaGVhZGVyWzJdO1xyXG4gICAgICAgIGlybS5wYXRoID0gaGVhZGVyWzNdO1xyXG5cclxuICAgICAgICBpZiAoaXJtLnJlY2VpdmVyICE9PSBtci5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaUtuWIsOS6huS4jeWxnuS6juiHquW3seeahOa2iOaBr+OAgnNlbmRlcu+8miR7aXJtLnNlbmRlcn0g77yMcmVjZWl2ZXLvvJoke2lybS5yZWNlaXZlcn1gKTtcclxuXHJcbiAgICAgICAgaWYgKGlybS5wYXRoLmxlbmd0aCA+IG1yLnBhdGhNYXhMZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5raI5oGv55qEcGF0aOmVv+W6pui2heWHuuS6huinhOWumueahCR7bXIucGF0aE1heExlbmd0aH3kuKrlrZfnrKZgKTtcclxuXHJcbiAgICAgICAgY29uc3QgcF9ib2R5ID0gSlNPTi5wYXJzZShib2R5LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgIGlybS5yZXF1ZXN0TWVzc2FnZUlEID0gcF9ib2R5WzBdO1xyXG4gICAgICAgIGlybS5kYXRhID0gcF9ib2R5WzFdO1xyXG4gICAgICAgIGlybS5maWxlcyA9IHBfYm9keVsyXS5tYXAoKGl0ZW06IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAvL+ehruS/nXNpemXkuI5zcGxpdE51bWJlcueahOaVsOaNruexu+Wei1xyXG4gICAgICAgICAgICBpZiAoKE51bWJlci5pc1NhZmVJbnRlZ2VyKGl0ZW1bMV0pICYmIGl0ZW1bMV0gPj0gMCB8fCBpdGVtWzFdID09PSBudWxsKSAmJiAoTnVtYmVyLmlzU2FmZUludGVnZXIoaXRlbVsyXSkgJiYgaXRlbVsyXSA+PSAwIHx8IGl0ZW1bMl0gPT09IG51bGwpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgaWQ6IGl0ZW1bMF0sIHNpemU6IGl0ZW1bMV0sIHNwbGl0TnVtYmVyOiBpdGVtWzJdLCBuYW1lOiBpdGVtWzNdIH07XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign5raI5oGv5pWw5o2u57G75Z6L6ZSZ6K+vJyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBpcm07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIG1lc3NhZ2VJRDogbnVtYmVyLCByZWNlaXZlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhKSB7XHJcbiAgICAgICAgaWYgKHBhdGgubGVuZ3RoID4gbXIucGF0aE1heExlbmd0aClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmtojmga/nmoRwYXRo6ZW/5bqm6LaF5Ye65LqG6KeE5a6a55qEJHttci5wYXRoTWF4TGVuZ3RofeS4quWtl+espmApO1xyXG5cclxuICAgICAgICBjb25zdCBpcm0gPSBuZXcgSW52b2tlUmVxdWVzdE1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgaXJtLnNlbmRlciA9IG1yLm1vZHVsZU5hbWU7XHJcbiAgICAgICAgaXJtLnJlY2VpdmVyID0gcmVjZWl2ZXI7XHJcbiAgICAgICAgaXJtLnBhdGggPSBwYXRoO1xyXG4gICAgICAgIGlybS5yZXF1ZXN0TWVzc2FnZUlEID0gbWVzc2FnZUlEO1xyXG4gICAgICAgIGlybS5kYXRhID0gZGF0YS5kYXRhO1xyXG4gICAgICAgIGlybS5maWxlcyA9IGRhdGEuZmlsZXMgPT0gbnVsbCA/IFtdIDogZGF0YS5maWxlcy5tYXAoKGl0ZW0sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICBCdWZmZXIuaXNCdWZmZXIoaXRlbS5maWxlKSA/XHJcbiAgICAgICAgICAgICAgICB7IGlkOiBpbmRleCwgc2l6ZTogaXRlbS5maWxlLmxlbmd0aCwgc3BsaXROdW1iZXI6IE1hdGguY2VpbChpdGVtLmZpbGUubGVuZ3RoIC8gbXIuZmlsZVBpZWNlU2l6ZSksIG5hbWU6IGl0ZW0ubmFtZSwgX2RhdGE6IGl0ZW0gfSA6XHJcbiAgICAgICAgICAgICAgICB7IGlkOiBpbmRleCwgc2l6ZTogbnVsbCwgc3BsaXROdW1iZXI6IG51bGwsIG5hbWU6IGl0ZW0ubmFtZSwgX2RhdGE6IGl0ZW0gfVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHJldHVybiBpcm07XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBJbnZva2VSZXNwb25zZU1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmludm9rZV9yZXNwb25zZTtcclxuICAgIHNlbmRlcjogc3RyaW5nO1xyXG4gICAgcmVjZWl2ZXI6IHN0cmluZztcclxuICAgIHJlcXVlc3RNZXNzYWdlSUQ6IG51bWJlcjtcclxuICAgIHJlc3BvbnNlTWVzc2FnZUlEOiBudW1iZXI7XHJcbiAgICBkYXRhOiBhbnk7XHJcbiAgICBmaWxlczogeyBpZDogbnVtYmVyLCBzaXplOiBudW1iZXIgfCBudWxsLCBzcGxpdE51bWJlcjogbnVtYmVyIHwgbnVsbCwgbmFtZTogc3RyaW5nLCBfZGF0YT86IFNlbmRpbmdGaWxlIH1bXVxyXG5cclxuICAgIHBhY2soKTogW3N0cmluZywgQnVmZmVyXSB7XHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoW3RoaXMudHlwZSwgdGhpcy5zZW5kZXIsIHRoaXMucmVjZWl2ZXJdKSxcclxuICAgICAgICAgICAgQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoW3RoaXMucmVxdWVzdE1lc3NhZ2VJRCwgdGhpcy5yZXNwb25zZU1lc3NhZ2VJRCwgdGhpcy5kYXRhLCB0aGlzLmZpbGVzLm1hcChpdGVtID0+IFtpdGVtLmlkLCBpdGVtLnNpemUsIGl0ZW0uc3BsaXROdW1iZXIsIGl0ZW0ubmFtZV0pXSkpXHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgcGFyc2UobXI6IE1lc3NhZ2VSb3V0aW5nLCBoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBpcm0gPSBuZXcgSW52b2tlUmVzcG9uc2VNZXNzYWdlKCk7XHJcbiAgICAgICAgaXJtLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBpcm0ucmVjZWl2ZXIgPSBoZWFkZXJbMl07XHJcblxyXG4gICAgICAgIGlmIChpcm0ucmVjZWl2ZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGv44CCc2VuZGVy77yaJHtpcm0uc2VuZGVyfSDvvIxyZWNlaXZlcu+8miR7aXJtLnJlY2VpdmVyfWApO1xyXG5cclxuICAgICAgICBjb25zdCBwX2JvZHkgPSBKU09OLnBhcnNlKGJvZHkudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgaXJtLnJlcXVlc3RNZXNzYWdlSUQgPSBwX2JvZHlbMF07XHJcbiAgICAgICAgaXJtLnJlc3BvbnNlTWVzc2FnZUlEID0gcF9ib2R5WzFdO1xyXG4gICAgICAgIGlybS5kYXRhID0gcF9ib2R5WzJdO1xyXG4gICAgICAgIGlybS5maWxlcyA9IHBfYm9keVszXS5tYXAoKGl0ZW06IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAvL+ehruS/nXNpemXkuI5zcGxpdE51bWJlcueahOaVsOaNruexu+Wei1xyXG4gICAgICAgICAgICBpZiAoKE51bWJlci5pc1NhZmVJbnRlZ2VyKGl0ZW1bMV0pICYmIGl0ZW1bMV0gPj0gMCB8fCBpdGVtWzFdID09PSBudWxsKSAmJiAoTnVtYmVyLmlzU2FmZUludGVnZXIoaXRlbVsyXSkgJiYgaXRlbVsyXSA+PSAwIHx8IGl0ZW1bMl0gPT09IG51bGwpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgaWQ6IGl0ZW1bMF0sIHNpemU6IGl0ZW1bMV0sIHNwbGl0TnVtYmVyOiBpdGVtWzJdLCBuYW1lOiBpdGVtWzNdIH07XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign5raI5oGv5pWw5o2u57G75Z6L6ZSZ6K+vJyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBpcm07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIHJtOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSwgbWVzc2FnZUlEOiBudW1iZXIsIGRhdGE6IEludm9rZVNlbmRpbmdEYXRhKSB7XHJcbiAgICAgICAgY29uc3QgaXJtID0gbmV3IEludm9rZVJlc3BvbnNlTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBpcm0uc2VuZGVyID0gbXIubW9kdWxlTmFtZTtcclxuICAgICAgICBpcm0ucmVjZWl2ZXIgPSBybS5zZW5kZXI7XHJcbiAgICAgICAgaXJtLnJlcXVlc3RNZXNzYWdlSUQgPSBybS5yZXF1ZXN0TWVzc2FnZUlEO1xyXG4gICAgICAgIGlybS5yZXNwb25zZU1lc3NhZ2VJRCA9IG1lc3NhZ2VJRDtcclxuICAgICAgICBpcm0uZGF0YSA9IGRhdGEuZGF0YTtcclxuICAgICAgICBpcm0uZmlsZXMgPSBkYXRhLmZpbGVzID09IG51bGwgPyBbXSA6IGRhdGEuZmlsZXMubWFwKChpdGVtLCBpbmRleCkgPT5cclxuICAgICAgICAgICAgQnVmZmVyLmlzQnVmZmVyKGl0ZW0uZmlsZSkgP1xyXG4gICAgICAgICAgICAgICAgeyBpZDogaW5kZXgsIHNpemU6IGl0ZW0uZmlsZS5sZW5ndGgsIHNwbGl0TnVtYmVyOiBNYXRoLmNlaWwoaXRlbS5maWxlLmxlbmd0aCAvIG1yLmZpbGVQaWVjZVNpemUpLCBuYW1lOiBpdGVtLm5hbWUsIF9kYXRhOiBpdGVtIH0gOlxyXG4gICAgICAgICAgICAgICAgeyBpZDogaW5kZXgsIHNpemU6IG51bGwsIHNwbGl0TnVtYmVyOiBudWxsLCBuYW1lOiBpdGVtLm5hbWUsIF9kYXRhOiBpdGVtIH1cclxuICAgICAgICApO1xyXG5cclxuICAgICAgICByZXR1cm4gaXJtO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgSW52b2tlRmluaXNoTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2VEYXRhIHtcclxuXHJcbiAgICB0eXBlID0gTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaDtcclxuICAgIHNlbmRlcjogc3RyaW5nO1xyXG4gICAgcmVjZWl2ZXI6IHN0cmluZztcclxuICAgIHJlc3BvbnNlTWVzc2FnZUlEOiBudW1iZXI7XHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShbdGhpcy50eXBlLCB0aGlzLnNlbmRlciwgdGhpcy5yZWNlaXZlcl0pLFxyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbSh0aGlzLnJlc3BvbnNlTWVzc2FnZUlELnRvU3RyaW5nKCkpXHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgcGFyc2UobXI6IE1lc3NhZ2VSb3V0aW5nLCBoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBpZm0gPSBuZXcgSW52b2tlRmluaXNoTWVzc2FnZSgpO1xyXG4gICAgICAgIGlmbS5zZW5kZXIgPSBoZWFkZXJbMV07XHJcbiAgICAgICAgaWZtLnJlY2VpdmVyID0gaGVhZGVyWzJdO1xyXG5cclxuICAgICAgICBpZiAoaWZtLnJlY2VpdmVyICE9PSBtci5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaUtuWIsOS6huS4jeWxnuS6juiHquW3seeahOa2iOaBr+OAgnNlbmRlcu+8miR7aWZtLnNlbmRlcn0g77yMcmVjZWl2ZXLvvJoke2lmbS5yZWNlaXZlcn1gKTtcclxuXHJcbiAgICAgICAgaWZtLnJlc3BvbnNlTWVzc2FnZUlEID0gTnVtYmVyLnBhcnNlSW50KGJvZHkudG9TdHJpbmcoKSk7XHJcblxyXG4gICAgICAgIHJldHVybiBpZm07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIHJtOiBJbnZva2VSZXNwb25zZU1lc3NhZ2UpIHtcclxuICAgICAgICBjb25zdCBpZm0gPSBuZXcgSW52b2tlRmluaXNoTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBpZm0uc2VuZGVyID0gbXIubW9kdWxlTmFtZTtcclxuICAgICAgICBpZm0ucmVjZWl2ZXIgPSBybS5zZW5kZXI7XHJcbiAgICAgICAgaWZtLnJlc3BvbnNlTWVzc2FnZUlEID0gcm0ucmVzcG9uc2VNZXNzYWdlSUQ7XHJcblxyXG4gICAgICAgIHJldHVybiBpZm07XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBJbnZva2VGYWlsZWRNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5pbnZva2VfZmFpbGVkO1xyXG4gICAgc2VuZGVyOiBzdHJpbmc7XHJcbiAgICByZWNlaXZlcjogc3RyaW5nO1xyXG4gICAgcmVxdWVzdE1lc3NhZ2VJRDogbnVtYmVyO1xyXG4gICAgZXJyb3I6IHN0cmluZztcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGUsIHRoaXMuc2VuZGVyLCB0aGlzLnJlY2VpdmVyXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KFt0aGlzLnJlcXVlc3RNZXNzYWdlSUQsIHRoaXMuZXJyb3JdKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGlmYSA9IG5ldyBJbnZva2VGYWlsZWRNZXNzYWdlKCk7XHJcbiAgICAgICAgaWZhLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBpZmEucmVjZWl2ZXIgPSBoZWFkZXJbMl07XHJcblxyXG4gICAgICAgIGlmIChpZmEucmVjZWl2ZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGv44CCc2VuZGVy77yaJHtpZmEuc2VuZGVyfSDvvIxyZWNlaXZlcu+8miR7aWZhLnJlY2VpdmVyfWApO1xyXG5cclxuICAgICAgICBjb25zdCBwX2JvZHkgPSBKU09OLnBhcnNlKGJvZHkudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgaWZhLnJlcXVlc3RNZXNzYWdlSUQgPSBwX2JvZHlbMF07XHJcbiAgICAgICAgaWZhLmVycm9yID0gcF9ib2R5WzFdO1xyXG5cclxuICAgICAgICByZXR1cm4gaWZhO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBjcmVhdGUobXI6IE1lc3NhZ2VSb3V0aW5nLCBybTogSW52b2tlUmVxdWVzdE1lc3NhZ2UsIGVycjogRXJyb3IpIHtcclxuICAgICAgICBjb25zdCBpZmEgPSBuZXcgSW52b2tlRmFpbGVkTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBpZmEuc2VuZGVyID0gbXIubW9kdWxlTmFtZTtcclxuICAgICAgICBpZmEucmVjZWl2ZXIgPSBybS5zZW5kZXI7XHJcbiAgICAgICAgaWZhLnJlcXVlc3RNZXNzYWdlSUQgPSBybS5yZXF1ZXN0TWVzc2FnZUlEO1xyXG4gICAgICAgIGlmYS5lcnJvciA9IGVyci5tZXNzYWdlO1xyXG5cclxuICAgICAgICByZXR1cm4gaWZhO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0O1xyXG4gICAgc2VuZGVyOiBzdHJpbmc7XHJcbiAgICByZWNlaXZlcjogc3RyaW5nO1xyXG4gICAgbWVzc2FnZUlEOiBudW1iZXI7XHJcbiAgICBpZDogbnVtYmVyO1xyXG4gICAgaW5kZXg6IG51bWJlcjtcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGUsIHRoaXMuc2VuZGVyLCB0aGlzLnJlY2VpdmVyXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KFt0aGlzLm1lc3NhZ2VJRCwgdGhpcy5pZCwgdGhpcy5pbmRleF0pKVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3QgaWZyID0gbmV3IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSgpO1xyXG4gICAgICAgIGlmci5zZW5kZXIgPSBoZWFkZXJbMV07XHJcbiAgICAgICAgaWZyLnJlY2VpdmVyID0gaGVhZGVyWzJdO1xyXG5cclxuICAgICAgICBpZiAoaWZyLnJlY2VpdmVyICE9PSBtci5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaUtuWIsOS6huS4jeWxnuS6juiHquW3seeahOa2iOaBr+OAgnNlbmRlcu+8miR7aWZyLnNlbmRlcn0g77yMcmVjZWl2ZXLvvJoke2lmci5yZWNlaXZlcn1gKTtcclxuXHJcbiAgICAgICAgY29uc3QgcF9ib2R5ID0gSlNPTi5wYXJzZShib2R5LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgIGlmci5tZXNzYWdlSUQgPSBwX2JvZHlbMF07XHJcbiAgICAgICAgaWZyLmlkID0gcF9ib2R5WzFdO1xyXG4gICAgICAgIGlmci5pbmRleCA9IHBfYm9keVsyXTtcclxuXHJcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihpZnIuaW5kZXgpIHx8IGlmci5pbmRleCA8IDApXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign5paH5Lu254mH5q6157Si5byV5pWw5o2u57G75Z6L6ZSZ6K+vJyk7XHJcblxyXG4gICAgICAgIHJldHVybiBpZnI7XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIHJtOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSB8IEludm9rZVJlc3BvbnNlTWVzc2FnZSwgaWQ6IG51bWJlciwgaW5kZXg6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghTnVtYmVyLmlzU2FmZUludGVnZXIoaW5kZXgpIHx8IGluZGV4IDwgMClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfmlofku7bniYfmrrXntKLlvJXmlbDmja7nsbvlnovplJnor68nKTtcclxuXHJcbiAgICAgICAgY29uc3QgaWZyID0gbmV3IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBpZnIuc2VuZGVyID0gbXIubW9kdWxlTmFtZTtcclxuICAgICAgICBpZnIucmVjZWl2ZXIgPSBybS5zZW5kZXI7XHJcbiAgICAgICAgaWZyLm1lc3NhZ2VJRCA9IHJtIGluc3RhbmNlb2YgSW52b2tlUmVxdWVzdE1lc3NhZ2UgPyBybS5yZXF1ZXN0TWVzc2FnZUlEIDogcm0ucmVzcG9uc2VNZXNzYWdlSUQ7XHJcbiAgICAgICAgaWZyLmlkID0gaWQ7XHJcbiAgICAgICAgaWZyLmluZGV4ID0gaW5kZXg7XHJcblxyXG4gICAgICAgIHJldHVybiBpZnI7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXNwb25zZTtcclxuICAgIHNlbmRlcjogc3RyaW5nO1xyXG4gICAgcmVjZWl2ZXI6IHN0cmluZztcclxuICAgIG1lc3NhZ2VJRDogbnVtYmVyO1xyXG4gICAgaWQ6IG51bWJlcjtcclxuICAgIGluZGV4OiBudW1iZXI7XHJcbiAgICBkYXRhOiBCdWZmZXI7XHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICBjb25zdCBiX2pzb24gPSBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShbdGhpcy5tZXNzYWdlSUQsIHRoaXMuaWQsIHRoaXMuaW5kZXhdKSk7XHJcbiAgICAgICAgY29uc3QgYl9qc29uX2xlbmd0aCA9IEJ1ZmZlci5hbGxvYyg0KTtcclxuICAgICAgICBiX2pzb25fbGVuZ3RoLndyaXRlVUludDMyQkUoYl9qc29uLmxlbmd0aCwgMCk7XHJcblxyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGUsIHRoaXMuc2VuZGVyLCB0aGlzLnJlY2VpdmVyXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5jb25jYXQoW2JfanNvbl9sZW5ndGgsIGJfanNvbiwgdGhpcy5kYXRhXSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGlmciA9IG5ldyBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlKCk7XHJcbiAgICAgICAgaWZyLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBpZnIucmVjZWl2ZXIgPSBoZWFkZXJbMl07XHJcblxyXG4gICAgICAgIGlmIChpZnIucmVjZWl2ZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGv44CCc2VuZGVy77yaJHtpZnIuc2VuZGVyfSDvvIxyZWNlaXZlcu+8miR7aWZyLnJlY2VpdmVyfWApO1xyXG5cclxuICAgICAgICBjb25zdCBiX2pzb25fbGVuZ3RoID0gYm9keS5yZWFkVUludDMyQkUoMCk7XHJcbiAgICAgICAgY29uc3QgYl9qc29uID0gSlNPTi5wYXJzZShib2R5LnNsaWNlKDQsIDQgKyBiX2pzb25fbGVuZ3RoKS50b1N0cmluZygpKTtcclxuICAgICAgICBpZnIubWVzc2FnZUlEID0gYl9qc29uWzBdO1xyXG4gICAgICAgIGlmci5pZCA9IGJfanNvblsxXTtcclxuICAgICAgICBpZnIuaW5kZXggPSBiX2pzb25bMl07XHJcbiAgICAgICAgaWZyLmRhdGEgPSBib2R5LnNsaWNlKDQgKyBiX2pzb25fbGVuZ3RoKTtcclxuXHJcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihpZnIuaW5kZXgpIHx8IGlmci5pbmRleCA8IDApXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign5paH5Lu254mH5q6157Si5byV5pWw5o2u57G75Z6L6ZSZ6K+vJyk7XHJcblxyXG4gICAgICAgIHJldHVybiBpZnI7XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIHJmbTogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLCBkYXRhOiBCdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBpZnIgPSBuZXcgSW52b2tlRmlsZVJlc3BvbnNlTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBpZnIuc2VuZGVyID0gbXIubW9kdWxlTmFtZTtcclxuICAgICAgICBpZnIucmVjZWl2ZXIgPSByZm0uc2VuZGVyO1xyXG4gICAgICAgIGlmci5tZXNzYWdlSUQgPSByZm0ubWVzc2FnZUlEO1xyXG4gICAgICAgIGlmci5pZCA9IHJmbS5pZDtcclxuICAgICAgICBpZnIuaW5kZXggPSByZm0uaW5kZXg7XHJcbiAgICAgICAgaWZyLmRhdGEgPSBkYXRhO1xyXG5cclxuICAgICAgICByZXR1cm4gaWZyO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgSW52b2tlRmlsZUZhaWxlZE1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZDtcclxuICAgIHNlbmRlcjogc3RyaW5nO1xyXG4gICAgcmVjZWl2ZXI6IHN0cmluZztcclxuICAgIG1lc3NhZ2VJRDogbnVtYmVyO1xyXG4gICAgaWQ6IG51bWJlcjtcclxuICAgIGVycm9yOiBzdHJpbmc7XHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShbdGhpcy50eXBlLCB0aGlzLnNlbmRlciwgdGhpcy5yZWNlaXZlcl0pLFxyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShbdGhpcy5tZXNzYWdlSUQsIHRoaXMuaWQsIHRoaXMuZXJyb3JdKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGlmZiA9IG5ldyBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSgpO1xyXG4gICAgICAgIGlmZi5zZW5kZXIgPSBoZWFkZXJbMV07XHJcbiAgICAgICAgaWZmLnJlY2VpdmVyID0gaGVhZGVyWzJdO1xyXG5cclxuICAgICAgICBpZiAoaWZmLnJlY2VpdmVyICE9PSBtci5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaUtuWIsOS6huS4jeWxnuS6juiHquW3seeahOa2iOaBr+OAgnNlbmRlcu+8miR7aWZmLnNlbmRlcn0g77yMcmVjZWl2ZXLvvJoke2lmZi5yZWNlaXZlcn1gKTtcclxuXHJcbiAgICAgICAgY29uc3QgcF9ib2R5ID0gSlNPTi5wYXJzZShib2R5LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgIGlmZi5tZXNzYWdlSUQgPSBwX2JvZHlbMF07XHJcbiAgICAgICAgaWZmLmlkID0gcF9ib2R5WzFdO1xyXG4gICAgICAgIGlmZi5lcnJvciA9IHBfYm9keVsyXTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlmZjtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY3JlYXRlKG1yOiBNZXNzYWdlUm91dGluZywgcm06IEludm9rZUZpbGVSZXF1ZXN0TWVzc2FnZSwgZXJyOiBFcnJvcikge1xyXG4gICAgICAgIGNvbnN0IGlmZiA9IG5ldyBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBpZmYuc2VuZGVyID0gbXIubW9kdWxlTmFtZTtcclxuICAgICAgICBpZmYucmVjZWl2ZXIgPSBybS5zZW5kZXI7XHJcbiAgICAgICAgaWZmLm1lc3NhZ2VJRCA9IHJtLm1lc3NhZ2VJRDtcclxuICAgICAgICBpZmYuaWQgPSBybS5pZDtcclxuICAgICAgICBpZmYuZXJyb3IgPSBlcnIubWVzc2FnZTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlmZjtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEludm9rZUZpbGVGaW5pc2hNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2g7XHJcbiAgICBzZW5kZXI6IHN0cmluZztcclxuICAgIHJlY2VpdmVyOiBzdHJpbmc7XHJcbiAgICBtZXNzYWdlSUQ6IG51bWJlcjtcclxuICAgIGlkOiBudW1iZXI7XHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShbdGhpcy50eXBlLCB0aGlzLnNlbmRlciwgdGhpcy5yZWNlaXZlcl0pLFxyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShbdGhpcy5tZXNzYWdlSUQsIHRoaXMuaWRdKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGlmZiA9IG5ldyBJbnZva2VGaWxlRmluaXNoTWVzc2FnZSgpO1xyXG4gICAgICAgIGlmZi5zZW5kZXIgPSBoZWFkZXJbMV07XHJcbiAgICAgICAgaWZmLnJlY2VpdmVyID0gaGVhZGVyWzJdO1xyXG5cclxuICAgICAgICBpZiAoaWZmLnJlY2VpdmVyICE9PSBtci5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaUtuWIsOS6huS4jeWxnuS6juiHquW3seeahOa2iOaBr+OAgnNlbmRlcu+8miR7aWZmLnNlbmRlcn0g77yMcmVjZWl2ZXLvvJoke2lmZi5yZWNlaXZlcn1gKTtcclxuXHJcbiAgICAgICAgY29uc3QgcF9ib2R5ID0gSlNPTi5wYXJzZShib2R5LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgIGlmZi5tZXNzYWdlSUQgPSBwX2JvZHlbMF07XHJcbiAgICAgICAgaWZmLmlkID0gcF9ib2R5WzFdO1xyXG5cclxuICAgICAgICByZXR1cm4gaWZmO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBjcmVhdGUobXI6IE1lc3NhZ2VSb3V0aW5nLCBybTogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKSB7XHJcbiAgICAgICAgY29uc3QgaWZmID0gbmV3IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGlmZi5zZW5kZXIgPSBtci5tb2R1bGVOYW1lO1xyXG4gICAgICAgIGlmZi5yZWNlaXZlciA9IHJtLnNlbmRlcjtcclxuICAgICAgICBpZmYubWVzc2FnZUlEID0gcm0ubWVzc2FnZUlEO1xyXG4gICAgICAgIGlmZi5pZCA9IHJtLmlkO1xyXG5cclxuICAgICAgICByZXR1cm4gaWZmO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQnJvYWRjYXN0TWVzc2FnZSBleHRlbmRzIE1lc3NhZ2VEYXRhIHtcclxuXHJcbiAgICB0eXBlID0gTWVzc2FnZVR5cGUuYnJvYWRjYXN0O1xyXG4gICAgc2VuZGVyOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkYXRhOiBhbnk7XHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShbdGhpcy50eXBlLCB0aGlzLnNlbmRlciwgbnVsbCwgdGhpcy5wYXRoXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHRoaXMuZGF0YSkpXHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgcGFyc2UobXI6IE1lc3NhZ2VSb3V0aW5nLCBoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBibSA9IG5ldyBCcm9hZGNhc3RNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGJtLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBibS5wYXRoID0gaGVhZGVyWzNdO1xyXG5cclxuICAgICAgICBpZiAoYm0ucGF0aC5sZW5ndGggPiBtci5wYXRoTWF4TGVuZ3RoKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOa2iOaBr+eahHBhdGjplb/luqbotoXlh7rkuobop4TlrprnmoQke21yLnBhdGhNYXhMZW5ndGh95Liq5a2X56ymYCk7XHJcblxyXG4gICAgICAgIGJtLmRhdGEgPSBKU09OLnBhcnNlKGJvZHkudG9TdHJpbmcoKSk7XHJcblxyXG4gICAgICAgIHJldHVybiBibTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY3JlYXRlKG1yOiBNZXNzYWdlUm91dGluZywgcGF0aDogc3RyaW5nLCBkYXRhOiBhbnkpIHtcclxuICAgICAgICBpZiAocGF0aC5sZW5ndGggPiBtci5wYXRoTWF4TGVuZ3RoKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOa2iOaBr+eahHBhdGjplb/luqbotoXlh7rkuobop4TlrprnmoQke21yLnBhdGhNYXhMZW5ndGh95Liq5a2X56ymYCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJtID0gbmV3IEJyb2FkY2FzdE1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgYm0uc2VuZGVyID0gbXIubW9kdWxlTmFtZTtcclxuICAgICAgICBibS5wYXRoID0gcGF0aDtcclxuICAgICAgICBibS5kYXRhID0gZGF0YTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGJtO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQnJvYWRjYXN0T3Blbk1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuO1xyXG4gICAgbWVzc2FnZUlEOiBudW1iZXI7XHJcbiAgICBicm9hZGNhc3RTZW5kZXI6IHN0cmluZzsgICAvL+W5v+aSreeahOWPkemAgeiAhSAgXHJcbiAgICBwYXRoOiBzdHJpbmc7ICAgICAgICAgICAgICAvL+W5v+aSreeahOi3r+W+hFxyXG5cclxuICAgIHBhY2soKTogW3N0cmluZywgQnVmZmVyXSB7XHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoW3RoaXMudHlwZV0pLFxyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShbdGhpcy5tZXNzYWdlSUQsIHRoaXMuYnJvYWRjYXN0U2VuZGVyLCB0aGlzLnBhdGhdKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGJvbSA9IG5ldyBCcm9hZGNhc3RPcGVuTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBjb25zdCBwX2JvZHkgPSBKU09OLnBhcnNlKGJvZHkudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgYm9tLm1lc3NhZ2VJRCA9IHBfYm9keVswXTtcclxuICAgICAgICBib20uYnJvYWRjYXN0U2VuZGVyID0gcF9ib2R5WzFdO1xyXG4gICAgICAgIGJvbS5wYXRoID0gcF9ib2R5WzJdO1xyXG5cclxuICAgICAgICBpZiAoYm9tLmJyb2FkY2FzdFNlbmRlciAhPT0gbXIubW9kdWxlTmFtZSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDlr7nmlrnlsJ3or5XmiZPlvIDkuI3lsZ7kuo7oh6rlt7HnmoTlub/mkq3jgILlr7nmlrnmiYDmnJ/lvoXnmoTlub/mkq3lj5HpgIHogIU6JHtib20uYnJvYWRjYXN0U2VuZGVyfWApO1xyXG5cclxuICAgICAgICBpZiAoYm9tLnBhdGgubGVuZ3RoID4gbXIucGF0aE1heExlbmd0aClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmtojmga/nmoRwYXRo6ZW/5bqm6LaF5Ye65LqG6KeE5a6a55qEJHttci5wYXRoTWF4TGVuZ3RofeS4quWtl+espmApO1xyXG5cclxuICAgICAgICByZXR1cm4gYm9tO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBjcmVhdGUobXI6IE1lc3NhZ2VSb3V0aW5nLCBtZXNzYWdlSUQ6IG51bWJlciwgYnJvYWRjYXN0U2VuZGVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZykge1xyXG4gICAgICAgIGlmIChwYXRoLmxlbmd0aCA+IG1yLnBhdGhNYXhMZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5raI5oGv55qEcGF0aOmVv+W6pui2heWHuuS6huinhOWumueahCR7bXIucGF0aE1heExlbmd0aH3kuKrlrZfnrKZgKTtcclxuXHJcbiAgICAgICAgY29uc3QgYm9tID0gbmV3IEJyb2FkY2FzdE9wZW5NZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGJvbS5tZXNzYWdlSUQgPSBtZXNzYWdlSUQ7XHJcbiAgICAgICAgYm9tLmJyb2FkY2FzdFNlbmRlciA9IGJyb2FkY2FzdFNlbmRlcjtcclxuICAgICAgICBib20ucGF0aCA9IHBhdGg7XHJcblxyXG4gICAgICAgIHJldHVybiBib207XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2VEYXRhIHtcclxuXHJcbiAgICB0eXBlID0gTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoO1xyXG4gICAgbWVzc2FnZUlEOiBudW1iZXI7XHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShbdGhpcy50eXBlXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKHRoaXMubWVzc2FnZUlELnRvU3RyaW5nKCkpXHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgcGFyc2UobXI6IE1lc3NhZ2VSb3V0aW5nLCBoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBib2YgPSBuZXcgQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgYm9mLm1lc3NhZ2VJRCA9IE51bWJlci5wYXJzZUludChib2R5LnRvU3RyaW5nKCkpO1xyXG5cclxuICAgICAgICByZXR1cm4gYm9mO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBjcmVhdGUobXI6IE1lc3NhZ2VSb3V0aW5nLCBib206IEJyb2FkY2FzdE9wZW5NZXNzYWdlKSB7XHJcbiAgICAgICAgY29uc3QgYm9mID0gbmV3IEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGJvZi5tZXNzYWdlSUQgPSBib20ubWVzc2FnZUlEO1xyXG5cclxuICAgICAgICByZXR1cm4gYm9mO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2U7XHJcbiAgICBtZXNzYWdlSUQ6IG51bWJlcjtcclxuICAgIGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nOyAgIC8v5bm/5pKt55qE5Y+R6YCB6ICFICBcclxuICAgIHBhdGg6IHN0cmluZzsgICAgICAgICAgICAgIC8v5bm/5pKt55qE6Lev5b6EXHJcbiAgICBpbmNsdWRlQW5jZXN0b3I6IGJvb2xlYW47ICAvL+aYr+WQpumcgOimgeS4gOW5tuWFs+mXreaJgOacieeItue6p+ebkeWQrOWZqFxyXG5cclxuICAgIHBhY2soKTogW3N0cmluZywgQnVmZmVyXSB7XHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoW3RoaXMudHlwZV0pLFxyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShbdGhpcy5tZXNzYWdlSUQsIHRoaXMuYnJvYWRjYXN0U2VuZGVyLCB0aGlzLnBhdGgsIHRoaXMuaW5jbHVkZUFuY2VzdG9yXSkpXHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgcGFyc2UobXI6IE1lc3NhZ2VSb3V0aW5nLCBoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBiY20gPSBuZXcgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBfYm9keSA9IEpTT04ucGFyc2UoYm9keS50b1N0cmluZygpKTtcclxuICAgICAgICBiY20ubWVzc2FnZUlEID0gcF9ib2R5WzBdO1xyXG4gICAgICAgIGJjbS5icm9hZGNhc3RTZW5kZXIgPSBwX2JvZHlbMV07XHJcbiAgICAgICAgYmNtLnBhdGggPSBwX2JvZHlbMl07XHJcbiAgICAgICAgYmNtLmluY2x1ZGVBbmNlc3RvciA9IHBfYm9keVszXTtcclxuXHJcbiAgICAgICAgaWYgKGJjbS5icm9hZGNhc3RTZW5kZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5a+55pa55bCd6K+V5YWz6Zet5LiN5bGe5LqO6Ieq5bex55qE5bm/5pKt44CC5a+55pa55omA5pyf5b6F55qE5bm/5pKt5Y+R6YCB6ICFOiR7YmNtLmJyb2FkY2FzdFNlbmRlcn1gKTtcclxuXHJcbiAgICAgICAgaWYgKGJjbS5wYXRoLmxlbmd0aCA+IG1yLnBhdGhNYXhMZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5raI5oGv55qEcGF0aOmVv+W6pui2heWHuuS6huinhOWumueahCR7bXIucGF0aE1heExlbmd0aH3kuKrlrZfnrKZgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGJjbTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY3JlYXRlKG1yOiBNZXNzYWdlUm91dGluZywgbWVzc2FnZUlEOiBudW1iZXIsIGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGluY2x1ZGVBbmNlc3RvcjogYm9vbGVhbiA9IGZhbHNlKSB7XHJcbiAgICAgICAgaWYgKHBhdGgubGVuZ3RoID4gbXIucGF0aE1heExlbmd0aClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmtojmga/nmoRwYXRo6ZW/5bqm6LaF5Ye65LqG6KeE5a6a55qEJHttci5wYXRoTWF4TGVuZ3RofeS4quWtl+espmApO1xyXG5cclxuICAgICAgICBjb25zdCBiY20gPSBuZXcgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGJjbS5tZXNzYWdlSUQgPSBtZXNzYWdlSUQ7XHJcbiAgICAgICAgYmNtLmJyb2FkY2FzdFNlbmRlciA9IGJyb2FkY2FzdFNlbmRlcjtcclxuICAgICAgICBiY20ucGF0aCA9IHBhdGg7XHJcbiAgICAgICAgYmNtLmluY2x1ZGVBbmNlc3RvciA9IGluY2x1ZGVBbmNlc3RvcjtcclxuXHJcbiAgICAgICAgcmV0dXJuIGJjbTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEJyb2FkY2FzdENsb3NlRmluaXNoTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2VEYXRhIHtcclxuXHJcbiAgICB0eXBlID0gTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlX2ZpbmlzaDtcclxuICAgIG1lc3NhZ2VJRDogbnVtYmVyO1xyXG5cclxuICAgIHBhY2soKTogW3N0cmluZywgQnVmZmVyXSB7XHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoW3RoaXMudHlwZV0pLFxyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbSh0aGlzLm1lc3NhZ2VJRC50b1N0cmluZygpKVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3QgYmNmID0gbmV3IEJyb2FkY2FzdENsb3NlRmluaXNoTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBiY2YubWVzc2FnZUlEID0gTnVtYmVyLnBhcnNlSW50KGJvZHkudG9TdHJpbmcoKSk7XHJcblxyXG4gICAgICAgIHJldHVybiBiY2Y7XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIGJjbTogQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKSB7XHJcbiAgICAgICAgY29uc3QgYmNmID0gbmV3IEJyb2FkY2FzdENsb3NlRmluaXNoTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBiY2YubWVzc2FnZUlEID0gYmNtLm1lc3NhZ2VJRDtcclxuXHJcbiAgICAgICAgcmV0dXJuIGJjZjtcclxuICAgIH1cclxufSJdfQ==
