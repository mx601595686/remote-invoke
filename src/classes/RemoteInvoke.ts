import { EventSpace } from 'eventspace';
import { EventLevel } from 'eventspace/bin/classes/EventLevel';
import log from 'log-formatter';

import { MessageType } from '../interfaces/MessageType';
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { InvokeReceivingData, ReceivingFile } from '../interfaces/InvokeReceivingData';
import { InvokeSendingData, SendingFile } from '../interfaces/InvokeSendingData';
import {
    InvokeRequestMessage,
    InvokeResponseMessage,
    InvokeFinishMessage,
    InvokeFailedMessage,
    InvokeFileRequestMessage,
    InvokeFileResponseMessage,
    InvokeFileFailedMessage,
    InvokeFileFinishMessage,
    BroadcastMessage,
    BroadcastOpenMessage,
    BroadcastOpenFinishMessage,
    BroadcastCloseMessage,
    BroadcastCloseFinishMessage,
    MessageData
} from './MessageData';
import { MessageRouting } from './MessageRouting';

export class RemoteInvoke extends MessageRouting {

    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket: ConnectionSocket, moduleName: string) {
        super(socket, moduleName);

        if (this._socket.ri != null)
            throw new Error('传入的ConnectionSocket已在其他地方被使用');

        this._socket.ri = this;
    }

    /**
     * 对外导出方法。     
     * 如果要向调用方反馈错误，直接 throw new Error() 即可。     
     * 注意：对于导出方法，当它执行完成，返回结果后就不可以再继续下载文件了。     
     * 注意：一个path上只允许导出一个方法。如果重复导出则后面的应该覆盖掉前面的。     
     * @param path 所导出的路径
     * @param func 导出的方法 
     */
    export<F extends (data: InvokeReceivingData) => Promise<void | InvokeSendingData>>(path: string, func: F): F {
        this.cancelExport(path);
        this._messageListener.receive([MessageType.invoke_request, path] as any, async (msg: InvokeRequestMessage) => {
            const { data, clean } = this._prepare_InvokeReceivingData(msg);

            try {
                const result = await func(data) || { data: null };
                const rm = InvokeResponseMessage.create(this, msg, this._messageID++, result);

                try {
                    if (rm.files.length === 0) {
                        const clean = await this._prepare_InvokeSendingData(rm);
                        clean();
                    } else {
                        const clean = await this._prepare_InvokeSendingData(rm, () => {
                            this._messageListener.cancel([MessageType.invoke_finish, rm.receiver, rm.responseMessageID] as any);
                        });

                        this._messageListener.receiveOnce([MessageType.invoke_finish, rm.receiver, rm.responseMessageID] as any, clean);
                    }
                } catch (error) {
                    this._printError('发送"调用响应"失败', error);
                }
            } catch (error) {
                this._send_InvokeFailedMessage(msg, error);
            } finally {
                clean();
            }
        });

        return func;
    }

    /**
     * 取消对外导出的方法
     * @param path 之前导出的路径
     */
    cancelExport(path: string) {
        this._messageListener.cancel([MessageType.invoke_request, path] as any);
    }

    /**
     * 调用远端模块导出的方法。直接返回数据与文件
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     */
    invoke(receiver: string, path: string, data?: InvokeSendingData | undefined): Promise<{ data: any, files: { name: string, data: Buffer }[] }>
    /**
     * 调用远端模块导出的方法。
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     * @param callback 接收响应数据的回调。注意：一旦回调执行完成就不能再下载文件了。
     */
    invoke(receiver: string, path: string, data: InvokeSendingData | undefined, callback: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): void
    invoke(receiver: string, path: string, data: InvokeSendingData = { data: null }, callback?: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): any {
        const rm = InvokeRequestMessage.create(this, this._messageID++, receiver, path, data);
        const cleanMessageListener = () => {   //清理注册的消息监听器
            this._messageListener.cancel([MessageType.invoke_response, rm.receiver, rm.requestMessageID] as any);
            this._messageListener.cancel([MessageType.invoke_failed, rm.receiver, rm.requestMessageID] as any);
        };
        const sendInvokeFinish = (msg: InvokeResponseMessage) => {  //响应被调用者，调用结束
            if (msg.files.length > 0)
                this._sendMessage(InvokeFinishMessage.create(this, msg));
        }

        if (callback) {   //回调函数版本
            this._prepare_InvokeSendingData(rm, () => {
                cleanMessageListener();
                (callback as any)(new Error('请求超时'));
            }).then(cleanSendRequest => {
                this._messageListener.receiveOnce([MessageType.invoke_response, rm.receiver, rm.requestMessageID] as any, (msg: InvokeResponseMessage) => {
                    cleanSendRequest();
                    cleanMessageListener();

                    const { data, clean } = this._prepare_InvokeReceivingData(msg);

                    callback(undefined, data).then(() => {
                        clean();
                        sendInvokeFinish(msg);
                    }).catch(err => {
                        clean();
                        sendInvokeFinish(msg);
                        throw err;
                    });
                });

                this._messageListener.receiveOnce([MessageType.invoke_failed, rm.receiver, rm.requestMessageID] as any, (msg: InvokeFailedMessage) => {
                    cleanSendRequest();
                    cleanMessageListener();

                    (callback as any)(new Error(msg.error));
                });
            }).catch(callback as any);
        } else {
            return new Promise((resolve, reject) => {
                this._prepare_InvokeSendingData(rm, () => {
                    cleanMessageListener();
                    reject(new Error('请求超时'));
                }).then(cleanSendRequest => {
                    this._messageListener.receiveOnce([MessageType.invoke_response, rm.receiver, rm.requestMessageID] as any, async (msg: InvokeResponseMessage) => {
                        cleanSendRequest();
                        cleanMessageListener();

                        const { data, clean } = this._prepare_InvokeReceivingData(msg);

                        try {
                            const result: { name: string, data: Buffer }[] = [];

                            for (const item of data.files) {
                                result.push({ name: item.name, data: await item.getFile() });
                            }

                            resolve({ data: data.data, files: result });
                        } catch (error) {
                            reject(error);
                        } finally {
                            clean();
                            sendInvokeFinish(msg);
                        }
                    });

                    this._messageListener.receiveOnce([MessageType.invoke_failed, rm.receiver, rm.requestMessageID] as any, (msg: InvokeFailedMessage) => {
                        cleanSendRequest();
                        cleanMessageListener();

                        reject(new Error(msg.error));
                    });
                }).catch(reject);
            });
        }
    }

    /**
     * 注册广播监听器      
     * @param sender 发送者
     * @param name 广播的路径
     * @param func 对应的回调方法
     */
    receive<F extends (arg: any) => any>(sender: string, path: string, func: F): F {
        const eventName = [MessageType.broadcast, sender, ...path.split('.')] as any;

        if (!this._messageListener.has(eventName)) {  //如果还没注册过，通知对方现在要接收指定路径广播
            this._send_BroadcastOpenMessage(sender, path);
        }

        this._messageListener.receive(eventName, func); //不包装一下监听器，是为了考虑到cancelReceive
        return func;
    }

    /**
     * 删除指定路径上的所有广播监听器，可以传递一个listener来只删除一个特定的监听器
     * @param sender 发送者
     * @param name 广播的路径
     * @param listener 要指定删除的监听器
     */
    cancelReceive(sender: string, path: string, listener?: (arg: any) => any) {
        const eventName = [MessageType.broadcast, sender, ...path.split('.')] as any;

        if (this._messageListener.has(eventName)) {  //确保真的有注册过再执行删除
            this._messageListener.cancel(eventName, listener);

            if (!this._messageListener.has(eventName)) {    //如果删光了，就通知对方不再接收了
                this._send_BroadcastCloseMessage(sender, path);
            }
        }
    }

    /**
     * 对外广播数据
     * @param path 广播的路径
     * @param data 要发送的数据
     */
    broadcast(path: string, data: any = null): Promise<void> {
        return this._send_BroadcastMessage(path, data);
    }

    /**
     * 准备好下载回调。返回InvokeReceivingData与清理资源回调
     */
    private _prepare_InvokeReceivingData(msg: InvokeRequestMessage | InvokeResponseMessage) {
        const messageID = msg instanceof InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;

        const files = msg.files.map(item => {
            let start: boolean = false;             //是否已经开始获取了，主要是用于防止重复下载
            let index = -1;                         //现在接收到第几个文件片段了
            let downloadedSize = 0;                 //已下载大小

            const downloadNext = () => {            //下载下一个文件片段
                this._send_InvokeFileRequestMessage(msg, item.id, ++index)
                    .then(data => {
                        if (data) {
                            downloadedSize += data.length;
                            if (item.size != null && downloadedSize > item.size)
                                cb_error(new Error('下载到的文件大小超出了发送者所描述的大小'));
                            else
                                cb_receive(data, false);
                        } else
                            cb_receive(Buffer.alloc(0), true);
                    })
                    .catch(err => cb_error(err));
            };

            let cb_error: (err: Error) => void; //下载出错回调
            let cb_receive: (data: Buffer, isEnd: boolean) => void; //接收文件回调

            const result: ReceivingFile = {
                size: item.size,
                splitNumber: item.splitNumber,
                name: item.name,
                onData: (callback, startIndex = 0) => {
                    if (start) {
                        (<any>callback)(new Error('不可重复下载文件'));
                    } else {
                        start = true;

                        cb_error = err => {    //确保只触发一次
                            (<any>callback)(err);
                            cb_receive = cb_error = () => { };
                        };
                        cb_receive = (data, isEnd) => {
                            if (isEnd) {
                                callback(undefined, isEnd, index, data);
                                cb_receive = cb_error = () => { };  //下载完成后就不允许再触发了
                            } else
                                callback(undefined, isEnd, index, data).then(result => {
                                    if (result === true)    //不再下载了
                                        cb_receive = cb_error = () => { };
                                    else
                                        downloadNext();
                                });
                        };

                        if (item.splitNumber != null && startIndex >= item.splitNumber) { //如果传入的起始位置已经到达了末尾
                            index = startIndex;
                            cb_receive(Buffer.alloc(0), true);
                        } else {
                            index = startIndex - 1;
                            downloadNext();
                        }
                    }
                },
                getFile: () => new Promise<Buffer>((resolve, reject) => {   //下载文件回调
                    if (start) {
                        reject(new Error('不可重复下载文件'));
                    } else {
                        start = true;
                        const filePieces: Buffer[] = [];    //下载到的文件片段

                        cb_error = reject;
                        cb_receive = (data, isEnd) => {
                            filePieces.push(data);
                            isEnd ? resolve(Buffer.concat(filePieces)) : downloadNext();
                        };

                        downloadNext();
                    }
                })
            }

            return result;
        });

        return {
            data: { data: msg.data, files },
            clean: () => { //清理资源
                this._messageListener.triggerDescendants([MessageType.invoke_file_failed, msg.sender, messageID] as any, { error: '下载终止' });

                this._messageListener.cancelDescendants([MessageType.invoke_file_response, msg.sender, messageID] as any);
                this._messageListener.cancelDescendants([MessageType.invoke_file_failed, msg.sender, messageID] as any);
                this._messageListener.cancelDescendants([MessageType.invoke_file_finish, msg.sender, messageID] as any);
            }
        };
    }

    /**
     * 准备发送文件，返回清理资源回调。如果超时或发送错误会自动清理资源
     * @param msg 要发送的数据
     * @param onTimeout 没有文件请求超时
     */
    private async _prepare_InvokeSendingData(msg: InvokeRequestMessage | InvokeResponseMessage, onTimeout?: () => void) {

        try {
            await this._sendMessage(msg);
        } catch (error) {
            clean(); throw error;
        }

    }
}