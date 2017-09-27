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
    boolean,    //要发送的data 是不是一个数组。如果是数组则需要使用binary-ws的BaseSocket.serialize序列化一下
    any,        //要发送的data
    SendingData['messageID'],
    SendingData['error']
]