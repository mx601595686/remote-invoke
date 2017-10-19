import { SendingData } from './common/SendingData';
import { RemoteInvokeConfig } from './common/RemoteInvokeConfig';
import { SendingManager } from './SendingManager';
import { ConnectionPort } from './common/ConnectionPort';
/**
 *  远程调用控制器
 *
 * @export
 * @class RemoteInvoke
 */
export declare class RemoteInvoke extends SendingManager {
    private static _messageID;
    private readonly _timeout;
    private readonly _reportErrorStack;
    private readonly _invokeCallback;
    private readonly _invokeFailedRetry;
    /**
     * 模块名称
     */
    readonly moduleName: string;
    /**
     * 对外导出的方法列表
     */
    readonly exportList: Map<string, (arg: any) => Promise<any>>;
    /**
     * 注册的广播接收器
     *
     * key：moduleName -> messageName
     */
    readonly receiveList: Map<string, Map<string, (arg: any) => void>>;
    constructor(config: RemoteInvokeConfig);
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
     * @param {Error} [error] 要反馈给调用则的错误信息
     * @returns {Promise<void>}
     * @memberof RemoteInvoke
     */
    private _send(receiver, messageName, messageID, type, expire, data, error?);
    /**
     * 接收消息
     *
     * @protected
     * @param {SendingData} data 收到的数据
     * @memberof RemoteInvoke
     */
    protected _onMessage(data: SendingData): void;
    /**
     * 打印错误消息
     *
     * @private
     * @param {string} description 描述
     * @param {*} data 收到的数据
     * @memberof RemoteInvoke
     */
    private _errorLog(description, data);
    /**
     * 对外导出方法
     *
     * @param {string} name 要被导出的方法的名称
     * @param {Function} func 要被导出的方法
     * @returns {Function}
     * @memberof RemoteInvoke
     */
    export<F extends (arg: any) => Promise<any>>(name: string, func: F): F;
    /**
     * 取消导出方法
     *
     * @param {string} name 导出的方法的名称
     * @returns {void}
     * @memberof RemoteInvoke
     */
    cancelExport(name: string): void;
    /**
     * 注册广播接收器
     *
     * @param {string} sender 发送者的模块名称
     * @param {string} name 广播消息的名称
     * @param {Function} func 对应的回调方法
     * @returns {Function}
     * @memberof RemoteInvoke
     */
    receive<F extends (arg: any) => void>(sender: string, name: string, func: F): F;
    /**
     * 删除广播接收器
     *
     * @param {string} sender 发送者的模块名称
     * @param {string} name 广播消息的名称
     * @returns
     * @memberof RemoteInvoke
     */
    cancelReceive(sender: string, name: string): void;
    /**
     * 调用远端模块的方法
     *
     * @param {string} target 远端模块的名称
     * @param {string} name 要调用的方法名称
     * @param {any} [data] 要传递的数据
     * @returns {Promise<any>}
     * @memberof RemoteInvoke
     */
    invoke(target: string, name: string, data?: any): Promise<any>;
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
    invoke(target: string, name: string, data?: any, timeout?: number): Promise<any>;
    /**
     * 调用远端模块的方法
     *
     * @param {string} target 远端模块的名称
     * @param {string} name 要调用的方法名称
     * @param {any} [data] 要传递的数据
     * @param {number} [timeout] 覆盖默认的调用超时的毫秒数
     * @param {number} [invokeFailedRetry] 调用失败自动重试次数（默认0，不重试）
     * @returns {Promise<any>}
     * @memberof RemoteInvoke
     */
    invoke(target: string, name: string, data?: any, timeout?: number, invokeFailedRetry?: number): Promise<any>;
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
    broadcast(name: string, data?: any, timeout?: number): Promise<void>;
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
    once(event: 'error', listener: (err: Error) => any): this;
    once(event: 'export', listener: (name: string) => any): this;
    once(event: 'cancelExport', listener: (name: string) => any): this;
    once(event: 'receive', listener: (name: string) => any): this;
    once(event: 'cancelReceive', listener: (name: string) => any): this;
    once(event: 'addConnectionPort', listener: (connection: ConnectionPort) => any): this;
    once(event: 'removeConnectionPort', listener: (connection: ConnectionPort) => any): this;
}
