import { SendingData } from './common/SendingData';
import { MessageType } from './common/MessageType';
import { RemoteInvokeConfig } from './common/RemoteInvokeConfig';
import { SendingManager } from './SendingManager';
/**
 *  远程调用控制器
 *
 * @export
 * @class RemoteInvoke
 */
export declare class RemoteInvoke extends SendingManager {
    private static _messageID;
    private readonly _timeout;
    private readonly _moduleName;
    private readonly _reportErrorStack;
    private readonly _exportList;
    private readonly _receiveList;
    private readonly _invokeCallback;
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
     * @param {any[]} data 要发送的数据
     * @returns {Promise<void>}
     * @memberof RemoteInvoke
     */
    protected _send(receiver: string | undefined, messageName: string | undefined, messageID: number, type: MessageType, expire: number, data: any[], error?: Error): Promise<void>;
    /**
     * 接收到消息
     *
     * @private
     * @param {SendingData} data
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
     * @param {(any: any) => Promise<any>} func 要被导出的方法
     * @returns {(any: any) => Promise<any>}
     * @memberof RemoteInvoke
     */
    export<F extends (any: any[]) => Promise<any>>(name: string, func: F): F;
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
    receive<F extends (any: any[]) => void>(sender: string, name: string, func: F): F;
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
     * @param {any[]} [data] 要传递的数据
     * @returns {Promise<any>}
     * @memberof RemoteInvoke
     */
    invoke(target: string, name: string, data?: any[]): Promise<any[]>;
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
    invoke(target: string, name: string, data?: any[], timeout?: number): Promise<any[]>;
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
    broadcast(name: string, data?: any[], timeout?: number): Promise<void>;
}
