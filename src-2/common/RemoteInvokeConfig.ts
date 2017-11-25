import { SendingManagerConfig } from './SendingManagerConfig';

/**
 * RemoteInvoke 构造函数参数
 * 
 * @export
 * @interface RemoteInvokeConfig
 * @extends {SendingManagerConfig}
 */
export interface RemoteInvokeConfig extends SendingManagerConfig {

    /**
     * 当前模块的名称。用于标记消息发送者
     * 
     * @type {string}
     * @memberof RemoteInvokeConfig
     */
    moduleName: string;

    /**
     * 设置全局的请求超时。如果0则表示不限制请求超时。默认0
     * 
     * @type {number}
     * @memberof RemoteInvokeConfig
     */
    timeout?: number;

    /**
     * 当被导出的方法执行错误时，是否需要向调用者汇报Error.stack信息。默认false
     * 
     * @type {boolean}
     * @memberof RemoteInvokeConfig
     */
    reportErrorStack?: boolean;

    /**
     * 设置全局的调用失败自动重试次数（默认0，不重试）
     * 
     * @type {number}
     * @memberof RemoteInvokeConfig
     */
    invokeFailedRetry?: number;
}