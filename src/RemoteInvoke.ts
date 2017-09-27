import log from 'log-formatter';
import { SendingData } from './common/SendingData';
import { MessageType } from './common/MessageType';
import { RemoteInvokeConfig } from './common/RemoteInvokeConfig';
import { SendingManager } from './SendingManager';
import { InvokeCallback } from './common/InvokeCallback';
import { ConnectionPort } from './common/ConnectionPort';

/**
 *  远程调用控制器
 * 
 * @export
 * @class RemoteInvoke
 */
export class RemoteInvoke extends SendingManager {

    private static _messageID = 0;  //消息编号从0开始

    private readonly _timeout: number; //请求超时

    private readonly _reportErrorStack: boolean;

    private readonly _invokeCallback: Map<number, InvokeCallback> = new Map();  // 注册调用回调

    /**
     * 模块名称
     */
    readonly moduleName: string;

    /**
     * 对外导出的方法列表
     */
    readonly exportList: Map<string, (arg: any) => Promise<any>> = new Map();

    /**
     * 注册的广播接收器    
     * 
     * key：moduleName -> messageName
     */
    readonly receiveList: Map<string, Map<string, (arg: any) => void>> = new Map();

    constructor(config: RemoteInvokeConfig) {
        super(config);
        this.moduleName = config.moduleName;
        this._reportErrorStack = !!config.reportErrorStack;
        this._timeout = config.timeout === undefined ? 0 : config.timeout < 0 ? 0 : config.timeout;
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
     * @param {any} data 要发送的数据
     * @returns {Promise<void>} 
     * @memberof RemoteInvoke
     */
    private _send(receiver: string | undefined, messageName: string | undefined, messageID: number, type: MessageType, expire: number, data: any, error?: Error): Promise<void> {

        const sendingData: SendingData = {
            sender: this.moduleName,
            receiver,
            messageID,
            messageName,
            type,
            sendTime: (new Date).getTime(),
            expire,
            data,
            error: error === undefined ? undefined : { message: error.message, stack: this._reportErrorStack ? error.stack : undefined }
        };
        
        return super._sendData(sendingData);
    }

    /**
     * 接收消息
     * 
     * @protected
     * @param {SendingData} data 收到的数据
     * @memberof RemoteInvoke
     */
    protected _onMessage(data: SendingData) {
        
        switch (data.type) {
            case MessageType.invoke:
                if (data.receiver !== this.moduleName) {   //确保收件人
                    this._errorLog('收到了不属于自己的消息', data);
                } else if (data.expire === 0 || data.expire > (new Date).getTime()) {   //确保消息还没有过期
                    const func = this.exportList.get(data.messageName as string);
                    const send = this._send.bind(this, data.sender, undefined, data.messageID, MessageType.replyInvoke, data.expire);
                    if (func !== undefined) {
                        //确保执行完了也在过期时间之内
                        func(data.data)
                            .then((result) => [result])
                            .catch((err) => [undefined, err])
                            .then(result => {
                                if (data.expire === 0 || data.expire > (new Date).getTime())
                                    send(...result).catch(() => { });
                            });
                    } else {
                        send(undefined, new Error('调用远端模块的方法不存在或者没有被导出')).catch(() => { });
                    }
                }
                break;

            case MessageType.replyInvoke:
                if (data.receiver !== this.moduleName) {
                    this._errorLog('收到了不属于自己的消息', data);
                } else {
                    const ctrl = this._invokeCallback.get(data.messageID);
                    if (ctrl !== undefined) {
                        if (ctrl.targetName !== data.sender) {
                            ctrl.reject(new Error(`远端调用返回的结果并不是由期望的被调用者返回的！\r\n期望的被调用者：${ctrl.targetName}   实际返回结果的被调用者：${data.sender}`));
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
                    this._errorLog('收到了没有指明发送者的广播', data);
                } else if (data.messageName === undefined) {
                    this._errorLog('收到了消息名称为空的广播', data);
                } else {
                    const _module = this.receiveList.get(data.sender);
                    const receivers = _module && _module.get(data.messageName);

                    if (receivers !== undefined) {
                        receivers(data.data);
                    } else {
                        this._errorLog('收到了自己没有注册过的广播', data);
                    }
                }
                break;

            default:
                this._errorLog('收到了不存在的消息类型', data);
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
        if (this.hasListeners('error')) {   //如果注册了错误监听器就不打印了
            this.emit('error', new Error(`模块：${this.moduleName} ${description}。收到的数据：${JSON.stringify(data)}`));
        } else {
            log.warn
                .location.white
                .title.yellow
                .content.yellow
                .text.yellow(`remote-invoke: 模块：${this.moduleName}`, description, `收到的数据：`, data);
        }
    }

    /**
     * 对外导出方法
     * 
     * @param {string} name 要被导出的方法的名称
     * @param {Function} func 要被导出的方法
     * @returns {Function} 
     * @memberof RemoteInvoke
     */
    export<F extends (arg: any) => Promise<any>>(name: string, func: F): F {
        if (this.exportList.has(name))
            throw new Error(`方法 '${name}' 不可以重复导出。`);

        this.exportList.set(name, func);
        this.emit('export', name);
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
        if (this.exportList.delete(name))
            this.emit('cancelExport', name);
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
    receive<F extends (arg: any) => void>(sender: string, name: string, func: F): F {
        let _module = this.receiveList.get(sender);
        if (_module === undefined) {
            _module = new Map();
            this.receiveList.set(sender, _module);
        }

        if (_module.has(name))
            throw new Error(`不可以重复注册广播接收器。 '${sender}：${name}'`);

        _module.set(name, func);
        this.emit('receive', name);
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
        const _module = this.receiveList.get(sender);
        if (_module && _module.delete(name))
            this.emit('cancelReceive', name);
    }

    /**
     * 调用远端模块的方法
     * 
     * @param {string} target 远端模块的名称
     * @param {string} name 要调用的方法名称
     * @param {any} [data] 要传递的数据
     * @returns {Promise<any>} 
     * @memberof RemoteInvoke
     */
    invoke(target: string, name: string, data?: any): Promise<any>
    /**
     * 调用远端模块的方法
     * 
     * @param {string} target 远端模块的名称
     * @param {string} name 要调用的方法名称
     * @param {any} [data] 要传递的数据
     * @param {number} [timeout] 覆盖默认的调用超时的毫秒数
     * @returns {Promise<any>} 
     * @memberof RemoteInvoke
     */
    invoke(target: string, name: string, data?: any, timeout?: number): Promise<any>
    invoke(target: string, name: string, ...args: any[]): Promise<any> {
        return new Promise((resolve, reject) => {
            const data = args[0];
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
     * @param {any} [data] 要发送的数据
     * @param {number} [timeout] 指定消息过期的毫秒数
     * 
     * @returns {Promise<any>} 
     * @memberof RemoteInvoke
     */
    broadcast(name: string, data?: any, timeout?: number): Promise<void> {
        timeout = timeout === undefined ? this._timeout : timeout < 0 ? 0 : timeout;
        const expire = timeout === 0 ? 0 : (new Date).getTime() + timeout;
        return this._send(undefined, name, RemoteInvoke._messageID++, MessageType.broadcast, expire, data);
    }

    // 定义事件

    /**
     * 注册错误监听器。如果没有注册错误监听器，则自动会将所有错误消息打印出来
     */
    on(event: 'error', listener: (err: Error) => any): this;
    /**
     * 当有新的方法被导出时触发
     */
    on(event: 'export', listener: (name: string) => any): this;
    /**
     * 当有方法被取消导出时触发
     */
    on(event: 'cancelExport', listener: (name: string) => any): this;
    /**
     * 当有新的广播接收器被注册时触发
     */
    on(event: 'receive', listener: (name: string) => any): this;
    /**
     * 当有广播接收器被删除时触发
     */
    on(event: 'cancelReceive', listener: (name: string) => any): this;
    /**
     * 注册添加新的连接端口监听器
     */
    on(event: 'addConnectionPort', listener: (connection: ConnectionPort) => any): this;
    /**
     * 注册删除连接端口监听器
     */
    on(event: 'removeConnectionPort', listener: (connection: ConnectionPort) => any): this;
    on(event: string, listener: Function): this {
        super.on(event, listener);
        return this;
    }

    once(event: 'error', listener: (err: Error) => any): this;
    once(event: 'export', listener: (name: string) => any): this;
    once(event: 'cancelExport', listener: (name: string) => any): this;
    once(event: 'receive', listener: (name: string) => any): this;
    once(event: 'cancelReceive', listener: (name: string) => any): this;
    once(event: 'addConnectionPort', listener: (connection: ConnectionPort) => any): this;
    once(event: 'removeConnectionPort', listener: (connection: ConnectionPort) => any): this;
    once(event: string, listener: Function): this {
        super.once(event, listener);
        return this;
    }
}