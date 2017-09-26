import { SendingData } from '../../index';

/**
 * 要被发送的数据头部
 * 
 * @export
 * @interface DataTitle
 */
export interface DataTitle {
    sender: SendingData['sender'];
    receiver: SendingData['receiver'];
    messageName: SendingData['messageName'];
    type: SendingData['type'];
    sendTime: SendingData['sendTime'];
    expire: SendingData['expire'];
}

/**
 * 数据body
 * 
 * @export
 * @interface DataBody
 */
export type DataBody = [
    boolean,    //data 是不是一个数组。如果是数组则需要使用binary-ws的BaseSocket.deserialize解序列化一下
    any,    //data[0]
    SendingData['messageID'],
    SendingData['error']
]