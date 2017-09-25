import { SendingData } from './common/SendingData';
import { ConnectionPort } from './common/ConnectionPort';
import { SendingManagerConfig } from './common/SendingManagerConfig';
/**
 * 发送管理器，负责端口的添加删除，负载均衡
 *
 * @export
 * @class SendingManager
 */
export declare abstract class SendingManager {
    private _conPort;
    private _portIndex;
    private readonly _loadBalance;
    constructor(config: SendingManagerConfig);
    /**
     * 子类复写，收到消息的回调
     *
     * @protected
     * @abstract
     * @param {SendingData} data 收到的数据
     * @memberof SendingManager
     */
    protected abstract _onMessage(data: SendingData): void;
    /**
     * 调用绑定的端口发送数据
     * @param data 要被发送的数据
     */
    protected _sendData(data: SendingData): Promise<void>;
    /**
     * 添加连接端口。可以添加多个端口，这样流量可以自动分担到每个端口上。如果某个端口被关闭，则它将自动被移除。
     *
     * @param {ConnectionPort} connection 连接端口
     * @memberof RemoteInvoke
     */
    addConnectionPort(connection: ConnectionPort): void;
    /**
     * 删除连接端口。
     *
     * @param {ConnectionPort} connection 连接端口
     * @returns {boolean}
     * @memberof RemoteInvoke
     */
    removeConnectionPort(connection: ConnectionPort): void;
}
