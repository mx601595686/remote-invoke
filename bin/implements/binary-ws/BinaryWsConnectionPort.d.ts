import { BaseSocket } from 'binary-ws/bin/common/BaseSocket';
import { ConnectionPort, SendingData } from '../../index';
/**
 * 这是一个基于binary-ws的ConnectionPort实现类，
 * 使用时直接将binary-ws的socket传入构造函数即可。
 *
 * @export
 * @class BinaryWsConnectionPort
 * @implements {ConnectionPort}
 */
export declare class BinaryWsConnectionPort implements ConnectionPort {
    readonly _socket: BaseSocket;
    constructor(_socket: BaseSocket);
    send(data: SendingData): Promise<void>;
    close(): void;
    onMessage?: (data: SendingData) => void;
    onClose?: () => void;
    onOpen?: () => void;
}
