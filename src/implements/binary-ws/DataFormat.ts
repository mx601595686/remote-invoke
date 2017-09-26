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
    SendingData['messageID'],
    SendingData['data'],
    SendingData['error']
]