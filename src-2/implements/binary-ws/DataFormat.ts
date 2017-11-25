import { SendingData } from '../../index';

/**
 * 要被发送的数据头部
 */
export type DataTitle = [
    SendingData['sender'],
    SendingData['receiver'],
    SendingData['messageName'],
    SendingData['type'],
    SendingData['sendTime'],
    SendingData['expire']
]

/**
 * 数据body
 */
export type DataBody = [
    SendingData['data'],
    SendingData['messageID'],
    SendingData['error']
]