import { MessageType } from '../interfaces/MessageType';
import { ConnectionSocket } from "../interfaces/ConnectionSocket";
import { InvokeReceivingData, ReceivingFile } from '../interfaces/InvokeReceivingData';
import { InvokeSendingData } from '../interfaces/InvokeSendingData';
import { InvokeRequestMessage, InvokeResponseMessage } from './MessageData';
import { MessageRouting } from './MessageRouting';

export class RemoteInvoke extends MessageRouting {

    /**
     * @param socket 连接端口
     * @param moduleName 当前模块的名称
     */
    constructor(socket: ConnectionSocket, moduleName: string) {
        if (socket.ri != null)
            throw new Error('传入的ConnectionSocket已在其他地方被使用');

        super(socket, moduleName);

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
        this._messageListener.get([MessageType.invoke_request, path] as any).on(async (msg: InvokeRequestMessage) => {
            const { data, clean } = this._prepare_InvokeReceivingData(msg);

            try {
                const result = await func(data) || { data: null };
                this._send_InvokeResponseMessage(msg, result);
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
        this._messageListener.get([MessageType.invoke_request, path] as any).off();
    }

    /**
     * 调用远端模块导出的方法。返回数据和所有下载到的文件
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     */
    invoke(receiver: string, path: string, data?: InvokeSendingData): Promise<{ data: any, files: { name: string, data: Buffer }[] }>
    /**
     * 调用远端模块导出的方法。
     * @param receiver 远端模块的名称
     * @param path 方法的路径
     * @param data 要传递的数据
     * @param callback 接收响应的回调。注意：一旦回调执行完成就不能再下载文件了。
     */
    invoke(receiver: string, path: string, data: InvokeSendingData | undefined, callback: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): void
    invoke(receiver: string, path: string, data: InvokeSendingData = { data: null }, callback?: (err: Error | undefined, data: InvokeReceivingData) => Promise<void>): any {
        if (callback) {   //回调函数版本
            this._send_InvokeRequestMessage(receiver, path, data).then(msg => {
                const { data, clean } = this._prepare_InvokeReceivingData(msg);
                callback(undefined, data).then(() => {
                    clean();
                    this._send_InvokeFinishMessage(msg);
                }).catch(err => {
                    clean();
                    this._send_InvokeFinishMessage(msg);
                    throw err;
                });
            }).catch(callback as any);
        } else {
            return (async () => {
                const msg = await this._send_InvokeRequestMessage(receiver, path, data);
                const { data: r_data, clean } = this._prepare_InvokeReceivingData(msg);

                try {
                    const result: { name: string, data: Buffer }[] = [];

                    for (const item of r_data.files) {
                        result.push({ name: item.name, data: await item.getFile() });
                    }

                    return { data: r_data.data, files: result };
                } catch (error) {
                    throw error;
                } finally {
                    clean();
                    this._send_InvokeFinishMessage(msg);
                }
            })();
        }
    }

    /**
     * 注册广播监听器      
     * @param sender 发送者
     * @param name 广播的路径
     * @param func 对应的回调方法
     */
    receive<F extends (arg: any) => any>(sender: string, path: string, func: F): F {
        const layer = this._messageListener.get([MessageType.broadcast, sender, ...path.split('.')] as any);

        if (!layer.has())   //如果还没注册过，通知对方现在要接收指定路径广播
            this._send_BroadcastOpenMessage(sender, path);

        layer.on(func); //不包装一下监听器，是为了考虑到cancelReceive
        return func;
    }

    /**
     * 删除指定路径上的所有广播监听器，可以传递一个listener来只删除一个特定的监听器
     * @param sender 发送者
     * @param name 广播的路径
     * @param listener 要指定删除的监听器
     */
    cancelReceive(sender: string, path: string, listener?: (arg: any) => any) {
        const layer = this._messageListener.get([MessageType.broadcast, sender, ...path.split('.')] as any);

        if (layer.has(listener as any)) {  //确保真的有注册过再执行删除
            layer.off(listener as any);

            if (!layer.has()) {    //如果删光了，就通知对方不再接收了
                this._send_BroadcastCloseMessage(sender, path);
            }
        }
    }

    /**
     * 对外广播数据
     * @param path 广播的路径
     * @param data 要发送的数据
     */
    broadcast(path: string, data: any = null) {
        this._send_BroadcastMessage(path, data);
    }

    /**
     * 准备好下载回调。返回InvokeReceivingData与清理资源回调
     */
    private _prepare_InvokeReceivingData(msg: InvokeRequestMessage | InvokeResponseMessage) {
        const messageID = msg instanceof InvokeRequestMessage ? msg.requestMessageID : msg.responseMessageID;
        let cleaned = false;   //是否下载已被清理

        const files = msg.files.map(item => {
            let start: boolean = false;             //是否已经开始获取了，主要是用于防止重复下载
            let index = -1;                         //现在接收到第几个文件片段了
            let downloadedSize = 0;                 //已下载大小

            const downloadNext = () => {            //下载下一个文件片段
                if (cleaned)
                    return Promise.reject(new Error('下载终止'));

                index++;

                if (item.splitNumber != null && index >= item.splitNumber) {    //判断是否下载完了
                    return Promise.resolve();
                } else {
                    return this._send_InvokeFileRequestMessage(msg, item.id, index).then(data => {
                        if (data && item.size != null && (downloadedSize += data.length) > item.size)
                            throw new Error('下载到的文件大小超出了发送者所描述的大小');

                        return data;
                    });
                }
            };

            const result: ReceivingFile = {
                size: item.size,
                splitNumber: item.splitNumber,
                name: item.name,
                onData: async (callback, startIndex = 0) => {
                    if (start) {
                        (<any>callback)(new Error('不可重复下载文件'));
                    } else {
                        start = true;
                        index = startIndex - 1;

                        while (true) {
                            try {
                                var data = await downloadNext();
                            } catch (error) {
                                (<any>callback)(error);
                                break;
                            }

                            if (data) {
                                const isNext = await callback(undefined, false, index, data);
                                if (isNext === true) break;
                            } else {
                                callback(undefined, true, index, Buffer.alloc(0));
                                break;
                            }
                        }
                    }
                },
                getFile: async () => {   //下载文件回调
                    if (start) {
                        throw new Error('不可重复下载文件');
                    } else {
                        start = true;
                        const filePieces: Buffer[] = [];    //下载到的文件片段

                        while (true) {
                            const data = await downloadNext();

                            if (data) {
                                filePieces.push(data);
                            } else {
                                return Buffer.concat(filePieces);
                            }
                        }
                    }
                }
            }

            return result;
        });

        return {
            data: { remoteName: msg.sender, data: msg.data, files },
            clean: () => { //清理正在下载的
                cleaned = true;
                this._messageListener.get([MessageType.invoke_file_failed, msg.sender, messageID] as any).triggerDescendants({ error: '下载终止' });
            }
        };
    }
}