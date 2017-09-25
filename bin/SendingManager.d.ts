import { SendingData } from './common/SendingData';
import { ConnectionPort } from './common/ConnectionPort';
import { SendingManagerConfig } from './common/SendingManagerConfig';
/**
 * 发送管理器，负责端口的添加删除，负载均衡
 *
 * @export
 * @class SendingManager
 */
export declare class SendingManager {
    private _conPort;
    private _portIndex;
    private readonly _loadBalance;
    private readonly _onMessage;
    constructor(onMessage: (data: SendingData) => void, config: SendingManagerConfig);
    send(data: SendingData): Promise<void>;
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
