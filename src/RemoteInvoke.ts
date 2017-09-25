import log from 'log-formatter';
import { SendingData } from './common/SendingData';
import { MessageType } from './common/MessageType';
import { RemoteInvokeConfig } from './common/RemoteInvokeConfig';
import { SendingManager } from './SendingManager';
import { InvokeCallback } from './common/InvokeCallback';

/**
 *  远程调用控制器
 * 
 * @export
 * @class RemoteInvoke
 */
export class RemoteInvoke {

    private static _messageID = 0;  //消息编号从0开始

    private readonly _timeout: number; //请求超时

    private readonly _moduleName: string;    //模块名称

    private readonly _reportErrorStack: boolean;

    private readonly _sendingManager: SendingManager;

    private readonly _exportList: Map<string, (any: any[]) => Promise<any>> = new Map();  //对外导出的方法列表

    private readonly _receiveList: Map<string, Map<string, (any: any[]) => void>> = new Map();   //key moduleName -> messageName

    private readonly _invokeCallback: Map<number, InvokeCallback> = new Map();  // 注册调用回调

    constructor(config: RemoteInvokeConfig) {
        this._moduleName = config.moduleName;
        this._reportErrorStack = !!config.reportErrorStack;
        this._timeout = config.timeout === undefined ? 0 : config.timeout < 0 ? 0 : config.timeout;
        this._sendingManager = new SendingManager(this._onMessage.bind(this), config);
    }

    /**
     * 发送消息
     * 
     * @private
     * @param {(string | undefined)} receiver 接收模块的名称
     * @param {string} messageName 消息的名称
     * @param {string} messageID 消息的编号
     * @param {MessageType} type 消息的类型
     * @param {(number | undefined)} expire 过期时间
     * @param {any[]} data 要发送的数据
     * @returns {Promise<void>} 
     * @memberof RemoteInvoke
     */
    private _send(receiver: string | undefined, messageName: string | undefined, messageID: number, type: MessageType, expire: number, data: any[], error?: Error): Promise<void> {

        const sendingData: SendingData = {
            sender: this._moduleName,
            receiver,
            messageID,
            messageName,
            type,
            sendTime: (new Date).getTime(),
            expire,
            data,
            error: error === undefined ? undefined : { message: error.message, stack: this._reportErrorStack ? error.stack : undefined }
        };

        return this._sendingManager.send(sendingData);
    }

    /**
     * 接收到消息
     * 
     * @private
     * @param {SendingData} data 
     * @memberof RemoteInvoke
     */
    private _onMessage(data: SendingData) {
        switch (data.type) {
            case MessageType.invoke:
                if (data.receiver !== this._moduleName) {   //确保收件人
                    this._errorLog('收到了不属于自己的消息', data);
                } else if (data.expire === 0 || data.expire > (new Date).getTime()) {   //确保消息还没有过期
                    const func = this._exportList.get(data.messageName as string);
                    const send = this._send.bind(this, data.sender, undefined, data.messageID, MessageType.replyInvoke, data.expire);
                    if (func !== undefined) {
                        //确保执行完了也在过期时间之内
                        func(data.data).then((result) => data.expire > (new Date).getTime() && send([result])).catch(err => { });
                    } else {
                        send([], new Error('调用远端模块的方法不存在或者没有被导出'));
                    }
                }
                break;

            case MessageType.replyInvoke:
                if (data.receiver !== this._moduleName) {
                    this._errorLog('收到了不属于自己的消息', data);
                } else {
                    const ctrl = this._invokeCallback.get(data.messageID);
                    if (ctrl !== undefined) {
                        if (ctrl.targetName !== data.sender) {
                            ctrl.reject(new Error(`远端调用返回的结果并不是由期望的被调用者返回的！\r\n期望的远端：${ctrl.targetName}   实际返回结果的远端：${data.sender}`));
                        } else {
                            if (data.error === undefined)   //检查远端执行是否出错
                                ctrl.resolve(data.data);
                            else {
                                const err = new Error(data.error.message);
                                if (data.error.stack !== undefined)
                                    err.stack = data.error.stack;
                                ctrl.reject(err);
                            }
                        }
                    }
                }
                break;

            case MessageType.broadcast:
                if (data.sender === undefined) {
                    this._errorLog('收到了没有标注发送者的广播', data);
                } else if (data.messageName === undefined) {
                    this._errorLog('收到了消息名称为空的广播', data);
                } else {
                    const _module = this._receiveList.get(data.sender);
                    if (_module !== undefined) {
                        const receivers = _module.get(data.messageName);
                        receivers && receivers(data.data);
                    }
                }
                break;

            default:
                this._errorLog('收到异常消息类型', data);
                break;
        }
    }

    /**
     * 打印错误消息
     * 
     * @private
     * @param {string} description 描述
     * @param {*} data 收到的数据
     * @memberof RemoteInvoke
     */
    private _errorLog(description: string, data: any) {
        log.warn
            .location.yellow
            .title.yellow
            .content.yellow(`remote-invoke: 模块：${this._moduleName}`, description, `收到的数据：${data}`);
    }

    /**
     * 对外导出方法
     * 
     * @param {string} name 要被导出的方法的名称
     * @param {(any: any) => Promise<any>} func 要被导出的方法
     * @returns {(any: any) => Promise<any>} 
     * @memberof RemoteInvoke
     */
    export<F extends (any: any[]) => Promise<any>>(name: string, func: F): F {
        if (this._exportList.has(name))
            throw new Error(`方法 '${name}' 不可以重复导出。`);

        this._exportList.set(name, func);
        return func;
    }

    /**
     * 取消导出方法
     * 
     * @param {string} name 导出的方法的名称
     * @returns {void} 
     * @memberof RemoteInvoke
     */
    cancelExport(name: string) {
        this._exportList.delete(name);
    }

    /**
     * 注册广播接收器
     * 
     * @param {string} sender 发送者的模块名称
     * @param {string} name 广播消息的名称
     * @param {Function} func 对应的回调方法
     * @returns {Function} 
     * @memberof RemoteInvoke
     */
    receive<F extends (any: any[]) => void>(sender: string, name: string, func: F): F {
        let _module = this._receiveList.get(sender);
        if (_module === undefined) {
            _module = new Map();
            this._receiveList.set(sender, _module);
        }

        if (_module.has(name))
            throw new Error(`不可以重复注册广播接收器。 '${sender}：${name}'`);

        _module.set(name, func);
        return func;
    }

    /**
     * 删除广播接收器
     * 
     * @param {string} sender 发送者的模块名称
     * @param {string} name 广播消息的名称
     * @returns 
     * @memberof RemoteInvoke
     */
    cancelReceive(sender: string, name: string) {
        const _module = this._receiveList.get(sender);
        if (_module)
            _module.delete(name);
    }

    /**
     * 调用远端模块的方法
     * 
     * @param {string} target 远端模块的名称
     * @param {string} name 要调用的方法名称
     * @param {any[]} [data] 要传递的数据
     * @returns {Promise<any>} 
     * @memberof RemoteInvoke
     */
    invoke(target: string, name: string, data?: any[]): Promise<any[]>
    /**
     * 调用远端模块的方法
     * 
     * @param {string} target 远端模块的名称
     * @param {string} name 要调用的方法名称
     * @param {any[]} [data] 要传递的数据
     * @param {number} [timeout] 调用超时的毫秒数
     * @returns {Promise<any>} 
     * @memberof RemoteInvoke
     */
    invoke(target: string, name: string, data?: any[], timeout?: number): Promise<any[]>
    invoke(target: string, name: string, ...args: any[]): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const data = args[0] || [];
            const timeout = args[1] === undefined ? this._timeout : args[1] < 0 ? 0 : args[1];
            const expire = timeout === 0 ? 0 : (new Date).getTime() + timeout;

            const control: InvokeCallback = {
                messageID: RemoteInvoke._messageID++,
                targetName: target,
                resolve: (data) => {
                    resolve(data);
                    clearTimeout(timer);
                    this._invokeCallback.delete(control.messageID);
                },
                reject: (err) => {
                    reject(err);
                    clearTimeout(timer);
                    this._invokeCallback.delete(control.messageID);
                }
            };

            const timer = timeout === 0 ? -1 : setTimeout(() => {
                const ctrl = this._invokeCallback.get(control.messageID);
                ctrl && ctrl.reject(new Error('调用超时'));
            }, timeout);

            this._invokeCallback.set(control.messageID, control);
            this._send(target, name, control.messageID, MessageType.invoke, expire, data).catch(control.reject);
        });
    }

    /**
     * 向外广播消息
     * 
     * @param {string} name 消息的名称
     * @param {any[]} [data] 要发送的数据
     * @param {number} [timeout] 指定消息过期的毫秒数
     * 
     * @returns {Promise<any>} 
     * @memberof RemoteInvoke
     */
    broadcast(name: string, data: any[] = [], timeout?: number): Promise<void> {
        timeout = timeout === undefined ? this._timeout : timeout < 0 ? 0 : timeout;
        const expire = timeout === 0 ? 0 : (new Date).getTime() + timeout;
        return this._send(undefined, name, RemoteInvoke._messageID++, MessageType.broadcast, expire, data);
    }
}