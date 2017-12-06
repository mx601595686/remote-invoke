import { ConnectionSocket, RemoteInvoke } from "../src";
import { BaseSocket, ReadyState } from 'binary-ws';

/**
 * 使用binary-ws简单实现的通信接口
 */
export class BinaryWS_socket implements ConnectionSocket {

    ri: RemoteInvoke;
    onMessage: (header: string, body: Buffer) => void;
    onOpen: () => void;
    onClose: () => void;

    get connected() {
        return this._socket.readyState === ReadyState.OPEN;
    }

    constructor(private readonly _socket: BaseSocket) {
        this._socket.once('open', this.onOpen);
        this._socket.once('close', this.onClose);
        this._socket.once('message', this.onMessage);
    }

    send(header: string, body: Buffer): Promise<void> {
        const result = this._socket.send(header, body);
        const timer = setTimeout(() => {
            this._socket.cancel(result.messageID)
        }, this.ri.timeout);

        return result.then(() => clearTimeout(timer));
    }
}