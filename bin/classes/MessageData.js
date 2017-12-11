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
            Buffer.from(JSON.stringify([this.messageID, this.broadcastSender, this.path]))
        ];
    }
    static parse(mr, header, body) {
        const bcm = new BroadcastCloseMessage();
        const p_body = JSON.parse(body.toString());
        bcm.messageID = p_body[0];
        bcm.broadcastSender = p_body[1];
        bcm.path = p_body[2];
        if (bcm.broadcastSender !== mr.moduleName)
            throw new Error(`对方尝试关闭不属于自己的广播。对方所期待的广播发送者:${bcm.broadcastSender}`);
        if (bcm.path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        return bcm;
    }
    static create(mr, messageID, broadcastSender, path) {
        if (path.length > mr.pathMaxLength)
            throw new Error(`消息的path长度超出了规定的${mr.pathMaxLength}个字符`);
        const bcm = new BroadcastCloseMessage();
        bcm.messageID = messageID;
        bcm.broadcastSender = broadcastSender;
        bcm.path = path;
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsYXNzZXMvTWVzc2FnZURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSwyREFBd0Q7QUFJeEQ7O0dBRUc7QUFDSDtJQVNJOzs7OztPQUtHO0lBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFrQixFQUFFLE1BQWEsRUFBRSxJQUFZO1FBQ3hELE1BQU0sSUFBSSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFrQixFQUFFLEdBQUcsSUFBVztRQUM1QyxNQUFNLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsUUFBUTtRQUNKLGNBQWM7UUFDZCxNQUFNLE1BQU0sR0FBRyxDQUFDLEdBQVcsRUFBRSxLQUFVO1lBQ25DLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3BCLE1BQU0sQ0FBQyxTQUFTLENBQUM7WUFDckIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxNQUFNLENBQUM7Z0JBQ3BCLE1BQU0sQ0FBQyx5QkFBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzlCLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMzRSx5Q0FBeUM7Z0JBQ3pDLE1BQU0sQ0FBQyxrQkFBa0IsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUNsRCxJQUFJO2dCQUNBLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDckIsQ0FBQyxDQUFDO1FBRUYsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FB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QUFDO0lBQ2YsQ0FBQztDQUNKO0FBM0NELHNEQTJDQztBQUVELGlDQUF5QyxTQUFRLFdBQVc7SUFBNUQ7O1FBRUksU0FBSSxHQUFHLHlCQUFXLENBQUMsc0JBQXNCLENBQUM7SUF5QjlDLENBQUM7SUF0QkcsSUFBSTtRQUNBLE1BQU0sQ0FBQztZQUNILElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0IsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQ3pDLENBQUM7SUFDTixDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFrQixFQUFFLE1BQWEsRUFBRSxJQUFZO1FBQ3hELE1BQU0sR0FBRyxHQUFHLElBQUksMkJBQTJCLEVBQUUsQ0FBQztRQUU5QyxHQUFHLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFakQsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNmLENBQUM7SUFFRCxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQWtCLEVBQUUsR0FBMEI7UUFDeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSwyQkFBMkIsRUFBRSxDQUFDO1FBRTlDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQztRQUU5QixNQUFNLENBQUMsR0FBRyxDQUFDO0lBQ2YsQ0FBQztDQUNKO0FBM0JELGtFQTJCQyIsImZpbGUiOiJjbGFzc2VzL01lc3NhZ2VEYXRhLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU2VuZGluZ0ZpbGUgfSBmcm9tICcuLi9pbnRlcmZhY2VzL0ludm9rZVNlbmRpbmdEYXRhJztcclxuaW1wb3J0IHsgTWVzc2FnZVR5cGUgfSBmcm9tICcuLi9pbnRlcmZhY2VzL01lc3NhZ2VUeXBlJztcclxuaW1wb3J0IHsgSW52b2tlU2VuZGluZ0RhdGEgfSBmcm9tICcuLi9pbnRlcmZhY2VzL0ludm9rZVNlbmRpbmdEYXRhJztcclxuaW1wb3J0IHsgTWVzc2FnZVJvdXRpbmcgfSBmcm9tICcuL01lc3NhZ2VSb3V0aW5nJztcclxuXHJcbi8qKlxyXG4gKiDmiYDmnInmtojmga/nmoTln7rnsbtcclxuICovXHJcbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgYWJzdHJhY3QgdHlwZTogTWVzc2FnZVR5cGU7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmiZPljIXov5nmnaHmtojmga/jgILov5Tlm55b5raI5oGv5aS06YOo77yM5raI5oGvYm9keV0gICAgICAgXHJcbiAgICAgKi9cclxuICAgIGFic3RyYWN0IHBhY2soKTogW3N0cmluZywgQnVmZmVyXTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOino+aekOa2iOaBr1xyXG4gICAgICogQHBhcmFtIG1yIE1lc3NhZ2VSb3V0aW5nXHJcbiAgICAgKiBAcGFyYW0gaGVhZGVyIOW3sui/keiiq0pTT04ucGFyc2XlkI7nmoTmtojmga/lpLTpg6hcclxuICAgICAqIEBwYXJhbSBib2R5IOa2iOaBr2JvZHlcclxuICAgICAqL1xyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKTogTWVzc2FnZURhdGEge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcign5pyq5a6e546w6Kej5p6Q5pa55rOVJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliJvlu7rmtojmga9cclxuICAgICAqL1xyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIC4uLmFyZ3M6IGFueVtdKTogTWVzc2FnZURhdGEge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcign5pyq5a6e546w5Yib5bu65pa55rOVJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDov5Tlm57luo/liJfljJblkI7nmoTlr7nosaHjgIIgICAgXHJcbiAgICAgKiBcclxuICAgICAqIOazqOaEj++8muS7pSBcIl9cIiDlvIDlpLTnmoTlsZ7mgKfmiJblrZfmrrXpg73lsIbooqvlv73nlaVcclxuICAgICAqL1xyXG4gICAgdG9TdHJpbmcoKSB7XHJcbiAgICAgICAgLy/ov4fmu6TmiJbovazmjaLopoHluo/liJfljJbnmoTlsZ7mgKdcclxuICAgICAgICBjb25zdCBmaWx0ZXIgPSAoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCdfJykpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICBlbHNlIGlmIChrZXkgPT09ICd0eXBlJykgICAgLy/miZPljbDmtojmga/nsbvlnovlkI3np7BcclxuICAgICAgICAgICAgICAgIHJldHVybiBNZXNzYWdlVHlwZVt2YWx1ZV07XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlICE9IG51bGwgJiYgdmFsdWUudHlwZSA9PT0gJ0J1ZmZlcicgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZS5kYXRhKSlcclxuICAgICAgICAgICAgICAgIC8v6L+Z5qC35YaZ5piv5Zug5Li6QnVmZmVyLmlzQnVmZmVy5ZyoSlNPTi5zdHJpbmdpZnnkuK3msqHnlKhcclxuICAgICAgICAgICAgICAgIHJldHVybiBgPEJ1ZmZlciBsZW5ndGg9JHt2YWx1ZS5kYXRhLmxlbmd0aH0+YDtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLCBmaWx0ZXIsIDQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgSW52b2tlUmVxdWVzdE1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmludm9rZV9yZXF1ZXN0O1xyXG4gICAgc2VuZGVyOiBzdHJpbmc7XHJcbiAgICByZWNlaXZlcjogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgcmVxdWVzdE1lc3NhZ2VJRDogbnVtYmVyO1xyXG4gICAgZGF0YTogYW55O1xyXG4gICAgZmlsZXM6IHsgaWQ6IG51bWJlciwgc2l6ZTogbnVtYmVyIHwgbnVsbCwgc3BsaXROdW1iZXI6IG51bWJlciB8IG51bGwsIG5hbWU6IHN0cmluZywgX2RhdGE/OiBTZW5kaW5nRmlsZSAvKiDlhoXpg6jlj5HpgIHmlofku7bml7bkvb/nlKggKi8gfVtdXHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShbdGhpcy50eXBlLCB0aGlzLnNlbmRlciwgdGhpcy5yZWNlaXZlciwgdGhpcy5wYXRoXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KFt0aGlzLnJlcXVlc3RNZXNzYWdlSUQsIHRoaXMuZGF0YSwgdGhpcy5maWxlcy5tYXAoaXRlbSA9PiBbaXRlbS5pZCwgaXRlbS5zaXplLCBpdGVtLnNwbGl0TnVtYmVyLCBpdGVtLm5hbWVdKV0pKVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3QgaXJtID0gbmV3IEludm9rZVJlcXVlc3RNZXNzYWdlKCk7XHJcbiAgICAgICAgaXJtLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBpcm0ucmVjZWl2ZXIgPSBoZWFkZXJbMl07XHJcbiAgICAgICAgaXJtLnBhdGggPSBoZWFkZXJbM107XHJcblxyXG4gICAgICAgIGlmIChpcm0ucmVjZWl2ZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGv44CCc2VuZGVy77yaJHtpcm0uc2VuZGVyfSDvvIxyZWNlaXZlcu+8miR7aXJtLnJlY2VpdmVyfWApO1xyXG5cclxuICAgICAgICBpZiAoaXJtLnBhdGgubGVuZ3RoID4gbXIucGF0aE1heExlbmd0aClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmtojmga/nmoRwYXRo6ZW/5bqm6LaF5Ye65LqG6KeE5a6a55qEJHttci5wYXRoTWF4TGVuZ3RofeS4quWtl+espmApO1xyXG5cclxuICAgICAgICBjb25zdCBwX2JvZHkgPSBKU09OLnBhcnNlKGJvZHkudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgaXJtLnJlcXVlc3RNZXNzYWdlSUQgPSBwX2JvZHlbMF07XHJcbiAgICAgICAgaXJtLmRhdGEgPSBwX2JvZHlbMV07XHJcbiAgICAgICAgaXJtLmZpbGVzID0gcF9ib2R5WzJdLm1hcCgoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIC8v56Gu5L+dc2l6ZeS4jnNwbGl0TnVtYmVy55qE5pWw5o2u57G75Z6LXHJcbiAgICAgICAgICAgIGlmICgoTnVtYmVyLmlzU2FmZUludGVnZXIoaXRlbVsxXSkgJiYgaXRlbVsxXSA+PSAwIHx8IGl0ZW1bMV0gPT09IG51bGwpICYmIChOdW1iZXIuaXNTYWZlSW50ZWdlcihpdGVtWzJdKSAmJiBpdGVtWzJdID49IDAgfHwgaXRlbVsyXSA9PT0gbnVsbCkpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBpZDogaXRlbVswXSwgc2l6ZTogaXRlbVsxXSwgc3BsaXROdW1iZXI6IGl0ZW1bMl0sIG5hbWU6IGl0ZW1bM10gfTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfmtojmga/mlbDmja7nsbvlnovplJnor68nKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlybTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY3JlYXRlKG1yOiBNZXNzYWdlUm91dGluZywgbWVzc2FnZUlEOiBudW1iZXIsIHJlY2VpdmVyOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEpIHtcclxuICAgICAgICBpZiAocGF0aC5sZW5ndGggPiBtci5wYXRoTWF4TGVuZ3RoKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOa2iOaBr+eahHBhdGjplb/luqbotoXlh7rkuobop4TlrprnmoQke21yLnBhdGhNYXhMZW5ndGh95Liq5a2X56ymYCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGlybSA9IG5ldyBJbnZva2VSZXF1ZXN0TWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBpcm0uc2VuZGVyID0gbXIubW9kdWxlTmFtZTtcclxuICAgICAgICBpcm0ucmVjZWl2ZXIgPSByZWNlaXZlcjtcclxuICAgICAgICBpcm0ucGF0aCA9IHBhdGg7XHJcbiAgICAgICAgaXJtLnJlcXVlc3RNZXNzYWdlSUQgPSBtZXNzYWdlSUQ7XHJcbiAgICAgICAgaXJtLmRhdGEgPSBkYXRhLmRhdGE7XHJcbiAgICAgICAgaXJtLmZpbGVzID0gZGF0YS5maWxlcyA9PSBudWxsID8gW10gOiBkYXRhLmZpbGVzLm1hcCgoaXRlbSwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgIEJ1ZmZlci5pc0J1ZmZlcihpdGVtLmZpbGUpID9cclxuICAgICAgICAgICAgICAgIHsgaWQ6IGluZGV4LCBzaXplOiBpdGVtLmZpbGUubGVuZ3RoLCBzcGxpdE51bWJlcjogTWF0aC5jZWlsKGl0ZW0uZmlsZS5sZW5ndGggLyBtci5maWxlUGllY2VTaXplKSwgbmFtZTogaXRlbS5uYW1lLCBfZGF0YTogaXRlbSB9IDpcclxuICAgICAgICAgICAgICAgIHsgaWQ6IGluZGV4LCBzaXplOiBudWxsLCBzcGxpdE51bWJlcjogbnVsbCwgbmFtZTogaXRlbS5uYW1lLCBfZGF0YTogaXRlbSB9XHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlybTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEludm9rZVJlc3BvbnNlTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2VEYXRhIHtcclxuXHJcbiAgICB0eXBlID0gTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlO1xyXG4gICAgc2VuZGVyOiBzdHJpbmc7XHJcbiAgICByZWNlaXZlcjogc3RyaW5nO1xyXG4gICAgcmVxdWVzdE1lc3NhZ2VJRDogbnVtYmVyO1xyXG4gICAgcmVzcG9uc2VNZXNzYWdlSUQ6IG51bWJlcjtcclxuICAgIGRhdGE6IGFueTtcclxuICAgIGZpbGVzOiB7IGlkOiBudW1iZXIsIHNpemU6IG51bWJlciB8IG51bGwsIHNwbGl0TnVtYmVyOiBudW1iZXIgfCBudWxsLCBuYW1lOiBzdHJpbmcsIF9kYXRhPzogU2VuZGluZ0ZpbGUgfVtdXHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShbdGhpcy50eXBlLCB0aGlzLnNlbmRlciwgdGhpcy5yZWNlaXZlcl0pLFxyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShbdGhpcy5yZXF1ZXN0TWVzc2FnZUlELCB0aGlzLnJlc3BvbnNlTWVzc2FnZUlELCB0aGlzLmRhdGEsIHRoaXMuZmlsZXMubWFwKGl0ZW0gPT4gW2l0ZW0uaWQsIGl0ZW0uc2l6ZSwgaXRlbS5zcGxpdE51bWJlciwgaXRlbS5uYW1lXSldKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGlybSA9IG5ldyBJbnZva2VSZXNwb25zZU1lc3NhZ2UoKTtcclxuICAgICAgICBpcm0uc2VuZGVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgIGlybS5yZWNlaXZlciA9IGhlYWRlclsyXTtcclxuXHJcbiAgICAgICAgaWYgKGlybS5yZWNlaXZlciAhPT0gbXIubW9kdWxlTmFtZSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmlLbliLDkuobkuI3lsZ7kuo7oh6rlt7HnmoTmtojmga/jgIJzZW5kZXLvvJoke2lybS5zZW5kZXJ9IO+8jHJlY2VpdmVy77yaJHtpcm0ucmVjZWl2ZXJ9YCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBfYm9keSA9IEpTT04ucGFyc2UoYm9keS50b1N0cmluZygpKTtcclxuICAgICAgICBpcm0ucmVxdWVzdE1lc3NhZ2VJRCA9IHBfYm9keVswXTtcclxuICAgICAgICBpcm0ucmVzcG9uc2VNZXNzYWdlSUQgPSBwX2JvZHlbMV07XHJcbiAgICAgICAgaXJtLmRhdGEgPSBwX2JvZHlbMl07XHJcbiAgICAgICAgaXJtLmZpbGVzID0gcF9ib2R5WzNdLm1hcCgoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIC8v56Gu5L+dc2l6ZeS4jnNwbGl0TnVtYmVy55qE5pWw5o2u57G75Z6LXHJcbiAgICAgICAgICAgIGlmICgoTnVtYmVyLmlzU2FmZUludGVnZXIoaXRlbVsxXSkgJiYgaXRlbVsxXSA+PSAwIHx8IGl0ZW1bMV0gPT09IG51bGwpICYmIChOdW1iZXIuaXNTYWZlSW50ZWdlcihpdGVtWzJdKSAmJiBpdGVtWzJdID49IDAgfHwgaXRlbVsyXSA9PT0gbnVsbCkpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBpZDogaXRlbVswXSwgc2l6ZTogaXRlbVsxXSwgc3BsaXROdW1iZXI6IGl0ZW1bMl0sIG5hbWU6IGl0ZW1bM10gfTtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfmtojmga/mlbDmja7nsbvlnovplJnor68nKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlybTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY3JlYXRlKG1yOiBNZXNzYWdlUm91dGluZywgcm06IEludm9rZVJlcXVlc3RNZXNzYWdlLCBtZXNzYWdlSUQ6IG51bWJlciwgZGF0YTogSW52b2tlU2VuZGluZ0RhdGEpIHtcclxuICAgICAgICBjb25zdCBpcm0gPSBuZXcgSW52b2tlUmVzcG9uc2VNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGlybS5zZW5kZXIgPSBtci5tb2R1bGVOYW1lO1xyXG4gICAgICAgIGlybS5yZWNlaXZlciA9IHJtLnNlbmRlcjtcclxuICAgICAgICBpcm0ucmVxdWVzdE1lc3NhZ2VJRCA9IHJtLnJlcXVlc3RNZXNzYWdlSUQ7XHJcbiAgICAgICAgaXJtLnJlc3BvbnNlTWVzc2FnZUlEID0gbWVzc2FnZUlEO1xyXG4gICAgICAgIGlybS5kYXRhID0gZGF0YS5kYXRhO1xyXG4gICAgICAgIGlybS5maWxlcyA9IGRhdGEuZmlsZXMgPT0gbnVsbCA/IFtdIDogZGF0YS5maWxlcy5tYXAoKGl0ZW0sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICBCdWZmZXIuaXNCdWZmZXIoaXRlbS5maWxlKSA/XHJcbiAgICAgICAgICAgICAgICB7IGlkOiBpbmRleCwgc2l6ZTogaXRlbS5maWxlLmxlbmd0aCwgc3BsaXROdW1iZXI6IE1hdGguY2VpbChpdGVtLmZpbGUubGVuZ3RoIC8gbXIuZmlsZVBpZWNlU2l6ZSksIG5hbWU6IGl0ZW0ubmFtZSwgX2RhdGE6IGl0ZW0gfSA6XHJcbiAgICAgICAgICAgICAgICB7IGlkOiBpbmRleCwgc2l6ZTogbnVsbCwgc3BsaXROdW1iZXI6IG51bGwsIG5hbWU6IGl0ZW0ubmFtZSwgX2RhdGE6IGl0ZW0gfVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHJldHVybiBpcm07XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBJbnZva2VGaW5pc2hNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoO1xyXG4gICAgc2VuZGVyOiBzdHJpbmc7XHJcbiAgICByZWNlaXZlcjogc3RyaW5nO1xyXG4gICAgcmVzcG9uc2VNZXNzYWdlSUQ6IG51bWJlcjtcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGUsIHRoaXMuc2VuZGVyLCB0aGlzLnJlY2VpdmVyXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKHRoaXMucmVzcG9uc2VNZXNzYWdlSUQudG9TdHJpbmcoKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGlmbSA9IG5ldyBJbnZva2VGaW5pc2hNZXNzYWdlKCk7XHJcbiAgICAgICAgaWZtLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBpZm0ucmVjZWl2ZXIgPSBoZWFkZXJbMl07XHJcblxyXG4gICAgICAgIGlmIChpZm0ucmVjZWl2ZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGv44CCc2VuZGVy77yaJHtpZm0uc2VuZGVyfSDvvIxyZWNlaXZlcu+8miR7aWZtLnJlY2VpdmVyfWApO1xyXG5cclxuICAgICAgICBpZm0ucmVzcG9uc2VNZXNzYWdlSUQgPSBOdW1iZXIucGFyc2VJbnQoYm9keS50b1N0cmluZygpKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlmbTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY3JlYXRlKG1yOiBNZXNzYWdlUm91dGluZywgcm06IEludm9rZVJlc3BvbnNlTWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnN0IGlmbSA9IG5ldyBJbnZva2VGaW5pc2hNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGlmbS5zZW5kZXIgPSBtci5tb2R1bGVOYW1lO1xyXG4gICAgICAgIGlmbS5yZWNlaXZlciA9IHJtLnNlbmRlcjtcclxuICAgICAgICBpZm0ucmVzcG9uc2VNZXNzYWdlSUQgPSBybS5yZXNwb25zZU1lc3NhZ2VJRDtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlmbTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEludm9rZUZhaWxlZE1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQ7XHJcbiAgICBzZW5kZXI6IHN0cmluZztcclxuICAgIHJlY2VpdmVyOiBzdHJpbmc7XHJcbiAgICByZXF1ZXN0TWVzc2FnZUlEOiBudW1iZXI7XHJcbiAgICBlcnJvcjogc3RyaW5nO1xyXG5cclxuICAgIHBhY2soKTogW3N0cmluZywgQnVmZmVyXSB7XHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoW3RoaXMudHlwZSwgdGhpcy5zZW5kZXIsIHRoaXMucmVjZWl2ZXJdKSxcclxuICAgICAgICAgICAgQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoW3RoaXMucmVxdWVzdE1lc3NhZ2VJRCwgdGhpcy5lcnJvcl0pKVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3QgaWZhID0gbmV3IEludm9rZUZhaWxlZE1lc3NhZ2UoKTtcclxuICAgICAgICBpZmEuc2VuZGVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgIGlmYS5yZWNlaXZlciA9IGhlYWRlclsyXTtcclxuXHJcbiAgICAgICAgaWYgKGlmYS5yZWNlaXZlciAhPT0gbXIubW9kdWxlTmFtZSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmlLbliLDkuobkuI3lsZ7kuo7oh6rlt7HnmoTmtojmga/jgIJzZW5kZXLvvJoke2lmYS5zZW5kZXJ9IO+8jHJlY2VpdmVy77yaJHtpZmEucmVjZWl2ZXJ9YCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBfYm9keSA9IEpTT04ucGFyc2UoYm9keS50b1N0cmluZygpKTtcclxuICAgICAgICBpZmEucmVxdWVzdE1lc3NhZ2VJRCA9IHBfYm9keVswXTtcclxuICAgICAgICBpZmEuZXJyb3IgPSBwX2JvZHlbMV07XHJcblxyXG4gICAgICAgIHJldHVybiBpZmE7XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIHJtOiBJbnZva2VSZXF1ZXN0TWVzc2FnZSwgZXJyOiBFcnJvcikge1xyXG4gICAgICAgIGNvbnN0IGlmYSA9IG5ldyBJbnZva2VGYWlsZWRNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGlmYS5zZW5kZXIgPSBtci5tb2R1bGVOYW1lO1xyXG4gICAgICAgIGlmYS5yZWNlaXZlciA9IHJtLnNlbmRlcjtcclxuICAgICAgICBpZmEucmVxdWVzdE1lc3NhZ2VJRCA9IHJtLnJlcXVlc3RNZXNzYWdlSUQ7XHJcbiAgICAgICAgaWZhLmVycm9yID0gZXJyLm1lc3NhZ2U7XHJcblxyXG4gICAgICAgIHJldHVybiBpZmE7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3Q7XHJcbiAgICBzZW5kZXI6IHN0cmluZztcclxuICAgIHJlY2VpdmVyOiBzdHJpbmc7XHJcbiAgICBtZXNzYWdlSUQ6IG51bWJlcjtcclxuICAgIGlkOiBudW1iZXI7XHJcbiAgICBpbmRleDogbnVtYmVyO1xyXG5cclxuICAgIHBhY2soKTogW3N0cmluZywgQnVmZmVyXSB7XHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoW3RoaXMudHlwZSwgdGhpcy5zZW5kZXIsIHRoaXMucmVjZWl2ZXJdKSxcclxuICAgICAgICAgICAgQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoW3RoaXMubWVzc2FnZUlELCB0aGlzLmlkLCB0aGlzLmluZGV4XSkpXHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgcGFyc2UobXI6IE1lc3NhZ2VSb3V0aW5nLCBoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBpZnIgPSBuZXcgSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKCk7XHJcbiAgICAgICAgaWZyLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBpZnIucmVjZWl2ZXIgPSBoZWFkZXJbMl07XHJcblxyXG4gICAgICAgIGlmIChpZnIucmVjZWl2ZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGv44CCc2VuZGVy77yaJHtpZnIuc2VuZGVyfSDvvIxyZWNlaXZlcu+8miR7aWZyLnJlY2VpdmVyfWApO1xyXG5cclxuICAgICAgICBjb25zdCBwX2JvZHkgPSBKU09OLnBhcnNlKGJvZHkudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgaWZyLm1lc3NhZ2VJRCA9IHBfYm9keVswXTtcclxuICAgICAgICBpZnIuaWQgPSBwX2JvZHlbMV07XHJcbiAgICAgICAgaWZyLmluZGV4ID0gcF9ib2R5WzJdO1xyXG5cclxuICAgICAgICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKGlmci5pbmRleCkgfHwgaWZyLmluZGV4IDwgMClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfmlofku7bniYfmrrXntKLlvJXmlbDmja7nsbvlnovplJnor68nKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlmcjtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY3JlYXRlKG1yOiBNZXNzYWdlUm91dGluZywgcm06IEludm9rZVJlcXVlc3RNZXNzYWdlIHwgSW52b2tlUmVzcG9uc2VNZXNzYWdlLCBpZDogbnVtYmVyLCBpbmRleDogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihpbmRleCkgfHwgaW5kZXggPCAwKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+aWh+S7tueJh+autee0ouW8leaVsOaNruexu+Wei+mUmeivrycpO1xyXG5cclxuICAgICAgICBjb25zdCBpZnIgPSBuZXcgSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGlmci5zZW5kZXIgPSBtci5tb2R1bGVOYW1lO1xyXG4gICAgICAgIGlmci5yZWNlaXZlciA9IHJtLnNlbmRlcjtcclxuICAgICAgICBpZnIubWVzc2FnZUlEID0gcm0gaW5zdGFuY2VvZiBJbnZva2VSZXF1ZXN0TWVzc2FnZSA/IHJtLnJlcXVlc3RNZXNzYWdlSUQgOiBybS5yZXNwb25zZU1lc3NhZ2VJRDtcclxuICAgICAgICBpZnIuaWQgPSBpZDtcclxuICAgICAgICBpZnIuaW5kZXggPSBpbmRleDtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlmcjtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX3Jlc3BvbnNlO1xyXG4gICAgc2VuZGVyOiBzdHJpbmc7XHJcbiAgICByZWNlaXZlcjogc3RyaW5nO1xyXG4gICAgbWVzc2FnZUlEOiBudW1iZXI7XHJcbiAgICBpZDogbnVtYmVyO1xyXG4gICAgaW5kZXg6IG51bWJlcjtcclxuICAgIGRhdGE6IEJ1ZmZlcjtcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIGNvbnN0IGJfanNvbiA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KFt0aGlzLm1lc3NhZ2VJRCwgdGhpcy5pZCwgdGhpcy5pbmRleF0pKTtcclxuICAgICAgICBjb25zdCBiX2pzb25fbGVuZ3RoID0gQnVmZmVyLmFsbG9jKDQpO1xyXG4gICAgICAgIGJfanNvbl9sZW5ndGgud3JpdGVVSW50MzJCRShiX2pzb24ubGVuZ3RoLCAwKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoW3RoaXMudHlwZSwgdGhpcy5zZW5kZXIsIHRoaXMucmVjZWl2ZXJdKSxcclxuICAgICAgICAgICAgQnVmZmVyLmNvbmNhdChbYl9qc29uX2xlbmd0aCwgYl9qc29uLCB0aGlzLmRhdGFdKVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3QgaWZyID0gbmV3IEludm9rZUZpbGVSZXNwb25zZU1lc3NhZ2UoKTtcclxuICAgICAgICBpZnIuc2VuZGVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgIGlmci5yZWNlaXZlciA9IGhlYWRlclsyXTtcclxuXHJcbiAgICAgICAgaWYgKGlmci5yZWNlaXZlciAhPT0gbXIubW9kdWxlTmFtZSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmlLbliLDkuobkuI3lsZ7kuo7oh6rlt7HnmoTmtojmga/jgIJzZW5kZXLvvJoke2lmci5zZW5kZXJ9IO+8jHJlY2VpdmVy77yaJHtpZnIucmVjZWl2ZXJ9YCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJfanNvbl9sZW5ndGggPSBib2R5LnJlYWRVSW50MzJCRSgwKTtcclxuICAgICAgICBjb25zdCBiX2pzb24gPSBKU09OLnBhcnNlKGJvZHkuc2xpY2UoNCwgNCArIGJfanNvbl9sZW5ndGgpLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgIGlmci5tZXNzYWdlSUQgPSBiX2pzb25bMF07XHJcbiAgICAgICAgaWZyLmlkID0gYl9qc29uWzFdO1xyXG4gICAgICAgIGlmci5pbmRleCA9IGJfanNvblsyXTtcclxuICAgICAgICBpZnIuZGF0YSA9IGJvZHkuc2xpY2UoNCArIGJfanNvbl9sZW5ndGgpO1xyXG5cclxuICAgICAgICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKGlmci5pbmRleCkgfHwgaWZyLmluZGV4IDwgMClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfmlofku7bniYfmrrXntKLlvJXmlbDmja7nsbvlnovplJnor68nKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGlmcjtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY3JlYXRlKG1yOiBNZXNzYWdlUm91dGluZywgcmZtOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UsIGRhdGE6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGlmciA9IG5ldyBJbnZva2VGaWxlUmVzcG9uc2VNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGlmci5zZW5kZXIgPSBtci5tb2R1bGVOYW1lO1xyXG4gICAgICAgIGlmci5yZWNlaXZlciA9IHJmbS5zZW5kZXI7XHJcbiAgICAgICAgaWZyLm1lc3NhZ2VJRCA9IHJmbS5tZXNzYWdlSUQ7XHJcbiAgICAgICAgaWZyLmlkID0gcmZtLmlkO1xyXG4gICAgICAgIGlmci5pbmRleCA9IHJmbS5pbmRleDtcclxuICAgICAgICBpZnIuZGF0YSA9IGRhdGE7XHJcblxyXG4gICAgICAgIHJldHVybiBpZnI7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBJbnZva2VGaWxlRmFpbGVkTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2VEYXRhIHtcclxuXHJcbiAgICB0eXBlID0gTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfZmFpbGVkO1xyXG4gICAgc2VuZGVyOiBzdHJpbmc7XHJcbiAgICByZWNlaXZlcjogc3RyaW5nO1xyXG4gICAgbWVzc2FnZUlEOiBudW1iZXI7XHJcbiAgICBpZDogbnVtYmVyO1xyXG4gICAgZXJyb3I6IHN0cmluZztcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGUsIHRoaXMuc2VuZGVyLCB0aGlzLnJlY2VpdmVyXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KFt0aGlzLm1lc3NhZ2VJRCwgdGhpcy5pZCwgdGhpcy5lcnJvcl0pKVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3QgaWZmID0gbmV3IEludm9rZUZpbGVGYWlsZWRNZXNzYWdlKCk7XHJcbiAgICAgICAgaWZmLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBpZmYucmVjZWl2ZXIgPSBoZWFkZXJbMl07XHJcblxyXG4gICAgICAgIGlmIChpZmYucmVjZWl2ZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGv44CCc2VuZGVy77yaJHtpZmYuc2VuZGVyfSDvvIxyZWNlaXZlcu+8miR7aWZmLnJlY2VpdmVyfWApO1xyXG5cclxuICAgICAgICBjb25zdCBwX2JvZHkgPSBKU09OLnBhcnNlKGJvZHkudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgaWZmLm1lc3NhZ2VJRCA9IHBfYm9keVswXTtcclxuICAgICAgICBpZmYuaWQgPSBwX2JvZHlbMV07XHJcbiAgICAgICAgaWZmLmVycm9yID0gcF9ib2R5WzJdO1xyXG5cclxuICAgICAgICByZXR1cm4gaWZmO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBjcmVhdGUobXI6IE1lc3NhZ2VSb3V0aW5nLCBybTogSW52b2tlRmlsZVJlcXVlc3RNZXNzYWdlLCBlcnI6IEVycm9yKSB7XHJcbiAgICAgICAgY29uc3QgaWZmID0gbmV3IEludm9rZUZpbGVGYWlsZWRNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGlmZi5zZW5kZXIgPSBtci5tb2R1bGVOYW1lO1xyXG4gICAgICAgIGlmZi5yZWNlaXZlciA9IHJtLnNlbmRlcjtcclxuICAgICAgICBpZmYubWVzc2FnZUlEID0gcm0ubWVzc2FnZUlEO1xyXG4gICAgICAgIGlmZi5pZCA9IHJtLmlkO1xyXG4gICAgICAgIGlmZi5lcnJvciA9IGVyci5tZXNzYWdlO1xyXG5cclxuICAgICAgICByZXR1cm4gaWZmO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaDtcclxuICAgIHNlbmRlcjogc3RyaW5nO1xyXG4gICAgcmVjZWl2ZXI6IHN0cmluZztcclxuICAgIG1lc3NhZ2VJRDogbnVtYmVyO1xyXG4gICAgaWQ6IG51bWJlcjtcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGUsIHRoaXMuc2VuZGVyLCB0aGlzLnJlY2VpdmVyXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KFt0aGlzLm1lc3NhZ2VJRCwgdGhpcy5pZF0pKVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3QgaWZmID0gbmV3IEludm9rZUZpbGVGaW5pc2hNZXNzYWdlKCk7XHJcbiAgICAgICAgaWZmLnNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICBpZmYucmVjZWl2ZXIgPSBoZWFkZXJbMl07XHJcblxyXG4gICAgICAgIGlmIChpZmYucmVjZWl2ZXIgIT09IG1yLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pS25Yiw5LqG5LiN5bGe5LqO6Ieq5bex55qE5raI5oGv44CCc2VuZGVy77yaJHtpZmYuc2VuZGVyfSDvvIxyZWNlaXZlcu+8miR7aWZmLnJlY2VpdmVyfWApO1xyXG5cclxuICAgICAgICBjb25zdCBwX2JvZHkgPSBKU09OLnBhcnNlKGJvZHkudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgaWZmLm1lc3NhZ2VJRCA9IHBfYm9keVswXTtcclxuICAgICAgICBpZmYuaWQgPSBwX2JvZHlbMV07XHJcblxyXG4gICAgICAgIHJldHVybiBpZmY7XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIHJtOiBJbnZva2VGaWxlUmVxdWVzdE1lc3NhZ2UpIHtcclxuICAgICAgICBjb25zdCBpZmYgPSBuZXcgSW52b2tlRmlsZUZpbmlzaE1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgaWZmLnNlbmRlciA9IG1yLm1vZHVsZU5hbWU7XHJcbiAgICAgICAgaWZmLnJlY2VpdmVyID0gcm0uc2VuZGVyO1xyXG4gICAgICAgIGlmZi5tZXNzYWdlSUQgPSBybS5tZXNzYWdlSUQ7XHJcbiAgICAgICAgaWZmLmlkID0gcm0uaWQ7XHJcblxyXG4gICAgICAgIHJldHVybiBpZmY7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCcm9hZGNhc3RNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5icm9hZGNhc3Q7XHJcbiAgICBzZW5kZXI6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGRhdGE6IGFueTtcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGUsIHRoaXMuc2VuZGVyLCBudWxsLCB0aGlzLnBhdGhdKSxcclxuICAgICAgICAgICAgQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkodGhpcy5kYXRhKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGJtID0gbmV3IEJyb2FkY2FzdE1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgYm0uc2VuZGVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgIGJtLnBhdGggPSBoZWFkZXJbM107XHJcblxyXG4gICAgICAgIGlmIChibS5wYXRoLmxlbmd0aCA+IG1yLnBhdGhNYXhMZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5raI5oGv55qEcGF0aOmVv+W6pui2heWHuuS6huinhOWumueahCR7bXIucGF0aE1heExlbmd0aH3kuKrlrZfnrKZgKTtcclxuXHJcbiAgICAgICAgYm0uZGF0YSA9IEpTT04ucGFyc2UoYm9keS50b1N0cmluZygpKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGJtO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBjcmVhdGUobXI6IE1lc3NhZ2VSb3V0aW5nLCBwYXRoOiBzdHJpbmcsIGRhdGE6IGFueSkge1xyXG4gICAgICAgIGlmIChwYXRoLmxlbmd0aCA+IG1yLnBhdGhNYXhMZW5ndGgpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5raI5oGv55qEcGF0aOmVv+W6pui2heWHuuS6huinhOWumueahCR7bXIucGF0aE1heExlbmd0aH3kuKrlrZfnrKZgKTtcclxuXHJcbiAgICAgICAgY29uc3QgYm0gPSBuZXcgQnJvYWRjYXN0TWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBibS5zZW5kZXIgPSBtci5tb2R1bGVOYW1lO1xyXG4gICAgICAgIGJtLnBhdGggPSBwYXRoO1xyXG4gICAgICAgIGJtLmRhdGEgPSBkYXRhO1xyXG5cclxuICAgICAgICByZXR1cm4gYm07XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCcm9hZGNhc3RPcGVuTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2VEYXRhIHtcclxuXHJcbiAgICB0eXBlID0gTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW47XHJcbiAgICBtZXNzYWdlSUQ6IG51bWJlcjtcclxuICAgIGJyb2FkY2FzdFNlbmRlcjogc3RyaW5nOyAgIC8v5bm/5pKt55qE5Y+R6YCB6ICFICBcclxuICAgIHBhdGg6IHN0cmluZzsgICAgICAgICAgICAgIC8v5bm/5pKt55qE6Lev5b6EXHJcblxyXG4gICAgcGFjaygpOiBbc3RyaW5nLCBCdWZmZXJdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShbdGhpcy50eXBlXSksXHJcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KFt0aGlzLm1lc3NhZ2VJRCwgdGhpcy5icm9hZGNhc3RTZW5kZXIsIHRoaXMucGF0aF0pKVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIHBhcnNlKG1yOiBNZXNzYWdlUm91dGluZywgaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3QgYm9tID0gbmV3IEJyb2FkY2FzdE9wZW5NZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBfYm9keSA9IEpTT04ucGFyc2UoYm9keS50b1N0cmluZygpKTtcclxuICAgICAgICBib20ubWVzc2FnZUlEID0gcF9ib2R5WzBdO1xyXG4gICAgICAgIGJvbS5icm9hZGNhc3RTZW5kZXIgPSBwX2JvZHlbMV07XHJcbiAgICAgICAgYm9tLnBhdGggPSBwX2JvZHlbMl07XHJcblxyXG4gICAgICAgIGlmIChib20uYnJvYWRjYXN0U2VuZGVyICE9PSBtci5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOWvueaWueWwneivleaJk+W8gOS4jeWxnuS6juiHquW3seeahOW5v+aSreOAguWvueaWueaJgOacn+W+heeahOW5v+aSreWPkemAgeiAhToke2JvbS5icm9hZGNhc3RTZW5kZXJ9YCk7XHJcblxyXG4gICAgICAgIGlmIChib20ucGF0aC5sZW5ndGggPiBtci5wYXRoTWF4TGVuZ3RoKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOa2iOaBr+eahHBhdGjplb/luqbotoXlh7rkuobop4TlrprnmoQke21yLnBhdGhNYXhMZW5ndGh95Liq5a2X56ymYCk7XHJcblxyXG4gICAgICAgIHJldHVybiBib207XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIG1lc3NhZ2VJRDogbnVtYmVyLCBicm9hZGNhc3RTZW5kZXI6IHN0cmluZywgcGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKHBhdGgubGVuZ3RoID4gbXIucGF0aE1heExlbmd0aClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmtojmga/nmoRwYXRo6ZW/5bqm6LaF5Ye65LqG6KeE5a6a55qEJHttci5wYXRoTWF4TGVuZ3RofeS4quWtl+espmApO1xyXG5cclxuICAgICAgICBjb25zdCBib20gPSBuZXcgQnJvYWRjYXN0T3Blbk1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgYm9tLm1lc3NhZ2VJRCA9IG1lc3NhZ2VJRDtcclxuICAgICAgICBib20uYnJvYWRjYXN0U2VuZGVyID0gYnJvYWRjYXN0U2VuZGVyO1xyXG4gICAgICAgIGJvbS5wYXRoID0gcGF0aDtcclxuXHJcbiAgICAgICAgcmV0dXJuIGJvbTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZURhdGEge1xyXG5cclxuICAgIHR5cGUgPSBNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbl9maW5pc2g7XHJcbiAgICBtZXNzYWdlSUQ6IG51bWJlcjtcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGVdKSxcclxuICAgICAgICAgICAgQnVmZmVyLmZyb20odGhpcy5tZXNzYWdlSUQudG9TdHJpbmcoKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGJvZiA9IG5ldyBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZSgpO1xyXG5cclxuICAgICAgICBib2YubWVzc2FnZUlEID0gTnVtYmVyLnBhcnNlSW50KGJvZHkudG9TdHJpbmcoKSk7XHJcblxyXG4gICAgICAgIHJldHVybiBib2Y7XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIGJvbTogQnJvYWRjYXN0T3Blbk1lc3NhZ2UpIHtcclxuICAgICAgICBjb25zdCBib2YgPSBuZXcgQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgYm9mLm1lc3NhZ2VJRCA9IGJvbS5tZXNzYWdlSUQ7XHJcblxyXG4gICAgICAgIHJldHVybiBib2Y7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZTtcclxuICAgIG1lc3NhZ2VJRDogbnVtYmVyO1xyXG4gICAgYnJvYWRjYXN0U2VuZGVyOiBzdHJpbmc7ICAgLy/lub/mkq3nmoTlj5HpgIHogIUgIFxyXG4gICAgcGF0aDogc3RyaW5nOyAgICAgICAgICAgICAgLy/lub/mkq3nmoTot6/lvoRcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGVdKSxcclxuICAgICAgICAgICAgQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoW3RoaXMubWVzc2FnZUlELCB0aGlzLmJyb2FkY2FzdFNlbmRlciwgdGhpcy5wYXRoXSkpXHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgcGFyc2UobXI6IE1lc3NhZ2VSb3V0aW5nLCBoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBiY20gPSBuZXcgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBfYm9keSA9IEpTT04ucGFyc2UoYm9keS50b1N0cmluZygpKTtcclxuICAgICAgICBiY20ubWVzc2FnZUlEID0gcF9ib2R5WzBdO1xyXG4gICAgICAgIGJjbS5icm9hZGNhc3RTZW5kZXIgPSBwX2JvZHlbMV07XHJcbiAgICAgICAgYmNtLnBhdGggPSBwX2JvZHlbMl07XHJcblxyXG4gICAgICAgIGlmIChiY20uYnJvYWRjYXN0U2VuZGVyICE9PSBtci5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOWvueaWueWwneivleWFs+mXreS4jeWxnuS6juiHquW3seeahOW5v+aSreOAguWvueaWueaJgOacn+W+heeahOW5v+aSreWPkemAgeiAhToke2JjbS5icm9hZGNhc3RTZW5kZXJ9YCk7XHJcblxyXG4gICAgICAgIGlmIChiY20ucGF0aC5sZW5ndGggPiBtci5wYXRoTWF4TGVuZ3RoKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOa2iOaBr+eahHBhdGjplb/luqbotoXlh7rkuobop4TlrprnmoQke21yLnBhdGhNYXhMZW5ndGh95Liq5a2X56ymYCk7XHJcblxyXG4gICAgICAgIHJldHVybiBiY207XHJcbiAgICB9XHJcblxyXG4gICAgc3RhdGljIGNyZWF0ZShtcjogTWVzc2FnZVJvdXRpbmcsIG1lc3NhZ2VJRDogbnVtYmVyLCBicm9hZGNhc3RTZW5kZXI6IHN0cmluZywgcGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKHBhdGgubGVuZ3RoID4gbXIucGF0aE1heExlbmd0aClcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmtojmga/nmoRwYXRo6ZW/5bqm6LaF5Ye65LqG6KeE5a6a55qEJHttci5wYXRoTWF4TGVuZ3RofeS4quWtl+espmApO1xyXG5cclxuICAgICAgICBjb25zdCBiY20gPSBuZXcgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKCk7XHJcblxyXG4gICAgICAgIGJjbS5tZXNzYWdlSUQgPSBtZXNzYWdlSUQ7XHJcbiAgICAgICAgYmNtLmJyb2FkY2FzdFNlbmRlciA9IGJyb2FkY2FzdFNlbmRlcjtcclxuICAgICAgICBiY20ucGF0aCA9IHBhdGg7XHJcblxyXG4gICAgICAgIHJldHVybiBiY207XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlRGF0YSB7XHJcblxyXG4gICAgdHlwZSA9IE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9jbG9zZV9maW5pc2g7XHJcbiAgICBtZXNzYWdlSUQ6IG51bWJlcjtcclxuXHJcbiAgICBwYWNrKCk6IFtzdHJpbmcsIEJ1ZmZlcl0ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFt0aGlzLnR5cGVdKSxcclxuICAgICAgICAgICAgQnVmZmVyLmZyb20odGhpcy5tZXNzYWdlSUQudG9TdHJpbmcoKSlcclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBwYXJzZShtcjogTWVzc2FnZVJvdXRpbmcsIGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbnN0IGJjZiA9IG5ldyBCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgYmNmLm1lc3NhZ2VJRCA9IE51bWJlci5wYXJzZUludChib2R5LnRvU3RyaW5nKCkpO1xyXG5cclxuICAgICAgICByZXR1cm4gYmNmO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRpYyBjcmVhdGUobXI6IE1lc3NhZ2VSb3V0aW5nLCBiY206IEJyb2FkY2FzdENsb3NlTWVzc2FnZSkge1xyXG4gICAgICAgIGNvbnN0IGJjZiA9IG5ldyBCcm9hZGNhc3RDbG9zZUZpbmlzaE1lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgYmNmLm1lc3NhZ2VJRCA9IGJjbS5tZXNzYWdlSUQ7XHJcblxyXG4gICAgICAgIHJldHVybiBiY2Y7XHJcbiAgICB9XHJcbn0iXX0=
