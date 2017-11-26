/// <reference types="node" />
import { MessageType } from "../interfaces/MessageType";
/**
 * 所有消息的基类
 */
export declare abstract class MessageData {
    /**
     * 消息的类型
     */
    readonly type: MessageType;
    /**
     * 该条消息的编号
     */
    readonly messageID: number;
    /**
     * 打包消息，返回消息头部以及消息body
     */
    abstract pack(): [string, Buffer];
    /**
     * 解包消息
     * @param header 消息头部
     * @param body 消息body
     */
    static unpack(header: string, body: Buffer): MessageData;
}
