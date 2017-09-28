import { SendingData } from './common/SendingData';
import { ConnectionPort } from './common/ConnectionPort';
import { SendingManagerConfig } from './common/SendingManagerConfig';
import * as Emitter from 'component-emitter';

/**
 * 发送管理器，负责端口的添加删除，负载均衡
 * 
 * @export
 * @class SendingManager
 */
export abstract class SendingManager extends Emitter {

    private _portIndex = 0;    //指示使用哪个端口来发送消息

    private readonly _loadBalance: boolean; //是否启用负载均衡

    _conPort: { port: ConnectionPort, sending: boolean }[] = []; //注册的连接端口。sending表示当前接口是否正在发送数据

    constructor(config: SendingManagerConfig) {
        super();
        this._loadBalance = config.loadBalance === undefined ? true : config.loadBalance;
    }

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
    protected _sendData(data: SendingData): Promise<void> {
        if (this._conPort.length === 0)
            return Promise.reject(new Error('没有可用的端口来发送消息'));
        else {
            let selectedPort: any;

            if (this._conPort.length > 1 && this._loadBalance) {    //负载均衡
                for (let i = 0, j = this._conPort.length - 1; i < j; i++) {  // -1 是为了确保走完一圈，也不会落到上次使用的端口上
                    const port = this._conPort[++this._portIndex < this._conPort.length ? this._portIndex : this._portIndex = 0];
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
     * 注意：只有当添加的端口连接打开之后才会触发addConnectionPort事件
     * 
     * @param {ConnectionPort} connection 连接端口
     * @memberof RemoteInvoke
     */
    addConnectionPort(connection: ConnectionPort) {
        if (this._conPort.find(item => item.port === connection))
            throw new Error('相同的端口不可以重复添加');

        connection.onOpen = () => {
            connection.onMessage = this._onMessage.bind(this);
            connection.onClose = () => this.removeConnectionPort(connection);
            this._conPort.push({ port: connection, sending: false });
            this.emit('addConnectionPort', connection);
        };
    }

    /**
     * 删除连接端口。删除成功触发removeConnectionPort事件
     * 
     * @param {ConnectionPort} connection 连接端口
     * @returns {boolean} 
     * @memberof RemoteInvoke
     */
    removeConnectionPort(connection: ConnectionPort) {
        const before = this._conPort.length;
        this._conPort = this._conPort.filter(item => item.port !== connection);

        if (before > this._conPort.length)
            this.emit('removeConnectionPort', connection);
    }

    /**
     * 删除并关闭连接端口。
     * 
     * @param {ConnectionPort} connection 连接端口
     * @memberof SendingManager
     */
    removeAndCloseConnectionPort(connection: ConnectionPort) {
        connection.close();
    }

    /**
     * 删除所有连接端口。
     * 
     * @memberof SendingManager
     */
    removeAllConnectionPort() {
        this._conPort.forEach(item => this.removeConnectionPort(item.port));
    }

    /**
     * 删除并关闭所有连接端口。
     * 
     * @memberof SendingManager
     */
    removeAndCloseAllConnectionPort() {
        this._conPort.forEach(item => this.removeAndCloseConnectionPort(item.port));
    }
}