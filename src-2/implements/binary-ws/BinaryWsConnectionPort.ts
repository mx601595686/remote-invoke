import { ReadyState } from 'binary-ws';
import { BaseSocket } from 'binary-ws/bin/common/BaseSocket';
import { ConnectionPort, SendingData } from '../../index';
import { DataTitle, DataBody } from './DataFormat';

/**
 * 这是一个基于binary-ws的ConnectionPort实现类，
 * 使用时直接将binary-ws的socket传入构造函数即可。   
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

        _socket.on('message', (title: any, data: any[]) => {
            if (this.onMessage !== undefined) {
                const message: SendingData = {
                    sender: title[0],
                    receiver: title[1],
                    messageName: title[2],
                    type: title[3],
                    sendTime: title[4],
                    expire: title[5],
                    data: data[0],
                    messageID: data[1],
                    error: data[2]
                };
                this.onMessage(message);
            }
        });

        if (_socket.readyState === ReadyState.OPEN)
            setTimeout(() => this.onOpen && this.onOpen(), 0);
    }

    send(data: SendingData): Promise<void> {
        const now = (new Date).getTime();
        if (data.expire === 0 || data.expire > now) {
            const title: DataTitle = [
                data.sender,
                data.receiver,
                data.messageName,
                data.type,
                data.sendTime,
                data.expire
            ];

            const body: DataBody = [
                data.data,
                data.messageID,
                data.error
            ];

            const sending = this._socket.send(title, body, false);

            if (data.expire !== 0) {
                //超时取消发送
                const timer = setTimeout(() => {
                    this._socket.cancel(sending.messageID);
                }, data.expire - now);

                return sending.then(() => { clearTimeout(timer) }).catch((err) => { clearTimeout(timer); throw err; });
            } else
                return sending;
        } else
            return Promise.reject(new Error('发送超时'));
    }

    close(): void {
        this._socket.close();
    }

    onMessage?: (data: SendingData) => void;
    onClose?: () => void;
    onOpen?: () => void;
}