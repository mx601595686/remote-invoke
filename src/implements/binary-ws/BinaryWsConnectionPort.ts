import { BaseSocket } from 'binary-ws/bin/common/BaseSocket';
import { ConnectionPort, SendingData } from '../../index';
import { DataBody, DataTitle } from './DataFormat';

/**
 * 这是一个基于binary-ws的ConnectionPort实现
 * 使用时直接将binary-ws的socket传入构造函数即可
 * 
 * @export
 * @class BinaryWsConnectionPort
 * @implements {ConnectionPort}
 */
export class BinaryWsConnectionPort implements ConnectionPort {

    constructor(private _socket: BaseSocket) {
        _socket.on('open', () => {
            this.onOpen && this.onOpen();
        });

        _socket.on('close', () => {
            this.onClose && this.onClose();
        });

        _socket.on('message', (name, data) => {
            if (this.onMessage !== undefined) {
                const title: DataTitle = JSON.parse(name);
                const body = data as DataBody;
                this.onMessage(Object.assign(title, {
                    messageID: body[0],
                    data: body[1],
                    error: data[2]
                }));
            }
        });
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

        const body: DataBody = [data.messageID, data.data, data.error];
        return this._socket.send(JSON.stringify(title), body);
    }

    close(): void {
        this._socket.close();
    }

    onMessage?: (data: SendingData) => void;
    onClose?: () => void;
    onOpen?: () => void;
}