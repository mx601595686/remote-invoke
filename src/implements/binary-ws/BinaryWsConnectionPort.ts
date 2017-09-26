import { ReadyState } from 'binary-ws';
import { BaseSocket } from 'binary-ws/bin/common/BaseSocket';
import { ConnectionPort, SendingData } from '../../index';
import { DataTitle, DataBody } from './DataFormat';

/**
 * 这是一个基于binary-ws的ConnectionPort实现类，
 * 使用时直接将binary-ws的socket传入构造函数即可。   
 * 
 * 注意：如果发送的是一个数组，则数组会自动使用BaseSocket.serialize进行序列化
 * 
 * @export
 * @class BinaryWsConnectionPort
 * @implements {ConnectionPort}
 */
export class BinaryWsConnectionPort implements ConnectionPort {

    constructor(readonly _socket: BaseSocket) {
        _socket.once('open', () => {
            this.onOpen && this.onOpen();
        });

        _socket.once('close', () => {
            this.onClose && this.onClose();
        });

        _socket.on('message', (name, data: any[]) => {
            if (this.onMessage !== undefined) {

                const title: DataTitle = JSON.parse(name);

                this.onMessage(Object.assign(title, {
                    error: data[3],
                    messageID: data[2],
                    data: data[0] ? BaseSocket.deserialize(data[1]) : data[1]
                }));
            }
        });

        if (_socket.readyState === ReadyState.OPEN)
            setTimeout(() => this.onOpen && this.onOpen(), 0);
    }

    send(data: SendingData): Promise<void> {
        const title: DataTitle = {
            sender: data.sender,
            receiver: data.receiver,
            messageName: data.messageName,
            type: data.type,
            sendTime: data.sendTime,
            expire: data.expire
        };

        const dataIsArray = Array.isArray(data.data);
        const body: DataBody = [
            dataIsArray,
            dataIsArray ? BaseSocket.serialize(data.data) : data.data,
            data.messageID,
            data.error
        ];

        return this._socket.send(JSON.stringify(title), body, false);
    }

    close(): void {
        this._socket.close();
    }

    onMessage?: (data: SendingData) => void;
    onClose?: () => void;
    onOpen?: () => void;
}