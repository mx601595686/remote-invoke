import { SendingData } from './common/SendingData';
import { ConnectionPort } from './common/ConnectionPort';
import { SendingManagerConfig } from './common/SendingManagerConfig';

/**
 * 发送管理器，负责端口的添加删除，负载均衡
 * 
 * @export
 * @class SendingManager
 */
export class SendingManager {

    private _conPort: { port: ConnectionPort, sending: boolean }[] = []; //注册的连接端口。sending表示当前接口是否正在发送数据

    private _portIndex = 0;    //指示使用哪个端口来发送消息

    private readonly _loadBalance: boolean; //是否启用负载均衡

    private readonly _onMessage: (data: SendingData) => void;

    constructor(onMessage: (data: SendingData) => void, config: SendingManagerConfig) {
        this._onMessage = onMessage;
        this._loadBalance = config.loadBalance === undefined ? true : config.loadBalance;
    }

    send(data: SendingData): Promise<void> {
        if (this._conPort.length === 0)
            return Promise.reject(new Error('没有可用的端口来发送消息'));
        else {
            let selectedPort: any;

            if (this._conPort.length > 1 && this._loadBalance) {    //负载均衡
                for (let i = 0, j = this._conPort.length - 1; i < j; i++) {  // -1 是为了确保走完一圈，也不会落到上次使用的端口上
                    const port = this._conPort[this._portIndex < this._conPort.length ? this._portIndex++ : this._portIndex = 0];
                    if (!port.sending) {
                        selectedPort = port;
                        break;
                    }
                }

                if (selectedPort === undefined) {
                    selectedPort = this._conPort[this._portIndex];
                }
            } else {
                selectedPort = this._conPort[0];
            }

            selectedPort.sending = true;
            return selectedPort.port.send(data)
                .then(() => { selectedPort.sending = false })
                .catch((err: Error) => { selectedPort.sending = false; throw err; });
        }
    }

    /**
     * 添加连接端口。可以添加多个端口，这样流量可以自动分担到每个端口上。如果某个端口被关闭，则它将自动被移除。
     * 
     * @param {ConnectionPort} connection 连接端口
     * @memberof RemoteInvoke
     */
    addConnectionPort(connection: ConnectionPort) {
        if (this._conPort.find(item => item.port === connection))
            throw new Error('相同的端口不可以重复添加');

        connection.onOpen = () => {
            connection.onMessage = this._onMessage;
            connection.onClose = () => this.removeConnectionPort(connection);
            this._conPort.push({ port: connection, sending: false });
        };
    }

    /**
     * 删除连接端口。
     * 
     * @param {ConnectionPort} connection 连接端口
     * @returns {boolean} 
     * @memberof RemoteInvoke
     */
    removeConnectionPort(connection: ConnectionPort) {
        this._conPort = this._conPort.filter(item => item.port !== connection);
    }
}