import { MessageType } from "../interfaces/MessageType";

let messageID_index = 0; //基本上每新建一条消息，该变量+1

/**
 * 所有消息的基类
 */
export abstract class MessageData {

    /**
     * 消息的类型
     */
    abstract readonly type: MessageType;

    /**
     * 该条消息的编号
     */
    abstract readonly messageID: number;

    /**
     * 打包消息，返回消息头部以及消息body
     */
    abstract pack(): [string, Buffer];

    /**
     * 解包消息
     * @param header 消息头部
     * @param body 消息body
     */
    static unpack(header: string, body: Buffer): MessageData {
        throw new Error(`${this.name} 未实现unpack方法`);
    }
}

/**
 * 调用远端消息
 */
export class InvokeMeesageData extends MessageData {

    readonly type = MessageType.invoke;

    readonly messageID = messageID_index++;

    /**
     * 发送者的名称
     */
    readonly sender: string;

    /**
     * 接受者的名称
     */
    readonly receiver: string;

    /**
     * 要调用的方法名称
     */
    readonly invokeName: string;

    readonly expire: number;

    pack(): [string, Buffer] {
        throw new Error("Method not implemented.");
    }

}