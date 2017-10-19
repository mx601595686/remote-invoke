import { RemoteInvoke } from '../../src';
import { Socket, ReadyState } from 'binary-ws/bin/browser';
import { BinaryWsConnectionPort } from '../../src/implements/binary-ws/BinaryWsConnectionPort';

describe('测试remote-invoke', function () {

    let c_socket: Socket;   //客户端ws
    let c_rv: RemoteInvoke;

    beforeEach(function (done) {
        c_socket = new Socket();
        c_socket.on('error', (err) => console.error('测试客户端端接口错误：', err));
        c_rv = new RemoteInvoke({ moduleName: 'client', timeout: 1000, reportErrorStack: true });
        c_rv.addConnectionPort(new BinaryWsConnectionPort(c_socket));
        //c_rv.once('addConnectionPort', () => setTimeout(() => done(), 100));
        c_rv.once('addConnectionPort', () => done());
    });

    afterEach(function (done) {
        if (c_socket.readyState === ReadyState.OPEN) {
            c_socket.on('close', () => {
                c_socket = undefined as any;
                c_rv = undefined as any;
                done();
            });

            c_rv.removeAndCloseAllConnectionPort();
        } else
            done();
    });

    it('属性检查', function () {
        expect(c_rv.moduleName).to.be('client');
        expect(c_rv._conPort.length).to.be(1);
        expect(c_rv._conPort[0].sending).to.be(false);
        expect(c_rv.exportList.size).to.be(0);
        expect(c_rv.receiveList.size).to.be(0);
    });

    it('导出与取消导出测试', function () {
        c_rv.export('ping', async () => 'pong');
        expect(c_rv.export.bind(c_rv)).withArgs('ping', async () => 'pong').throwError();
        expect(c_rv.exportList.size).to.be(1);
        c_rv.cancelExport('ping');
        expect(c_rv.exportList.size).to.be(0);
    });

    it('注册与取消注册广播测试', function () {
        c_rv.receive('client', 'broadcast', () => { });
        expect(c_rv.receive.bind(c_rv)).withArgs('client', 'broadcast', () => { }).throwError();
        expect(c_rv.receiveList.size).to.be(1);
        c_rv.cancelReceive('client', 'broadcast');
        const _module = c_rv.receiveList.get('client');
        expect(_module && _module.size).to.be(0);
    });

    it('测试添加与移除端口', function (done) {
        const socket1 = new Socket();
        socket1.on('open', function () {
            const socket2 = new BinaryWsConnectionPort(new Socket());
            const socket3 = new BinaryWsConnectionPort(new Socket());
            c_rv.addConnectionPort(new BinaryWsConnectionPort(socket1));
            c_rv.once('addConnectionPort', () => {
                expect(c_rv._conPort.length).to.be(2);
                c_rv.addConnectionPort(socket2);
                c_rv.once('addConnectionPort', () => {
                    expect(c_rv._conPort.length).to.be(3);
                    c_rv.addConnectionPort(socket3);
                    c_rv.once('addConnectionPort', () => {
                        expect(c_rv._conPort.length).to.be(4);
                        expect(c_rv.addConnectionPort.bind(c_rv)).withArgs(socket3).throwException();
                        expect(c_rv._conPort.length).to.be(4);
                        c_rv.removeConnectionPort(socket3);
                        expect(c_rv._conPort.length).to.be(3);
                        expect(socket3._socket.readyState).to.be(ReadyState.OPEN);
                        socket3.close();
                        socket3.onClose = () => {
                            expect(socket3._socket.readyState).to.be(ReadyState.CLOSED);
                            c_rv.removeAndCloseConnectionPort(socket2);
                            c_rv.once('removeConnectionPort', () => {
                                expect(socket2._socket.readyState).to.be(ReadyState.CLOSED);
                                expect(c_rv._conPort.length).to.be(2);

                                socket1.close();
                                c_rv.once('removeConnectionPort', () => {
                                    expect(c_rv._conPort.length).to.be(1);
                                    done();
                                });
                            });
                        };
                    });
                });
            });
        });
    });

    it('测试远程调用', async function () {
        c_rv.export('ping', async () => 'pong');
        c_rv.export('return', async (arg: any) => arg);

        expect(await c_rv.invoke('client', 'ping')).to.be('pong');
        const result = await c_rv.invoke('client', 'return', [0, 1.1, '2', true, false, null, { a: 123 }, [1, 2, 3]]);
        expect(result[0]).to.be(0);
        expect(result[1]).to.be(1.1);
        expect(result[2]).to.be('2');
        expect(result[3]).to.be(true);
        expect(result[4]).to.be(false);
        expect(result[5]).to.be(null);
        expect(result[6]).to.be.eql({ a: 123 });
        expect(result[7]).to.be.eql([1, 2, 3]);
    });

    it('测试远程调用错误返回异常', function (done) {
        c_rv.export('error', async (arg) => {
            const err = new Error('test');
            err.stack = arg;
            throw err;
        });

        c_rv.invoke('client', 'error', 123)
            .then(() => done('代码逻辑存在问题，不可能执行到这'))
            .catch((err: Error) => {
                expect(err.message).to.be('test');
                expect(err.stack).to.be(123);
                done();
            });
    });

    it('测试调用超时', function (done) {
        let s_received = false;
        c_rv.export('ping', (arg) => {
            return new Promise((resolve, reject) => {
                s_received = true;
                setTimeout(function () {
                    resolve('pong');
                }, 1500);
            });
        });

        c_rv.invoke('client', 'ping')
            .then(() => done('代码逻辑存在问题，不可能执行到这'))
            .catch((err: Error) => {
                expect(s_received).to.be.ok();
                expect(err).to.be.a(Error);
                done();
            });
    });

    it('测试调用收到不是自己的消息', function (done) {
        c_rv.export('ping', async (arg) => {
            done('代码逻辑存在问题，不可能执行到这');
        });

        let s_err = false;
        c_rv.on('error', (err) => {
            expect(err).to.be.a(Error);
            s_err = true;
        });

        c_rv.invoke('abc', 'ping', 123)
            .then(() => done('代码逻辑存在问题，不可能执行到这'))
            .catch((err) => {
                expect(err).to.be.a(Error);
                expect(s_err).to.be.ok();
                done();
            });
    });

    it('测试调用失败重试', function (done) {
        let retryIndex = 0;

        c_rv.export('error', async (arg) => {
            if (++retryIndex < 3) {
                const err = new Error('test');
                err.stack = retryIndex.toString();
                throw err;
            }
            return retryIndex;
        });

        c_rv.invoke('client', 'error', 123, undefined, 3)
            .then((arg) => {
                expect(retryIndex).to.be(3);
                expect(arg).to.be(3);
                done();
            })
            .catch(() => done('代码逻辑存在问题，不可能执行到这'));
    });

    it('测试无可用端口发送数据', function (done) {
        c_rv.removeAndCloseAllConnectionPort();

        c_rv.invoke('client', 'ping')
            .then(() => done('代码逻辑存在问题，不可能执行到这'))
            .catch(() => done());
    });

    it('测试发送广播', function (done) {
        let ranTest1 = false;
        c_rv.receive('client', 'test1', (arg) => {
            ranTest1 = true;
            expect(arg).to.be(undefined);
        });

        c_rv.receive('client', 'test2', (result) => {
            expect(ranTest1).to.be.ok();
            expect(result[0]).to.be(0);
            expect(result[1]).to.be(1.1);
            expect(result[2]).to.be('2');
            expect(result[3]).to.be(true);
            expect(result[4]).to.be(false);
            expect(result[5]).to.be(null);
            expect(result[6]).to.be.eql({ a: 123 });
            expect(result[7]).to.be.eql([1, 2, 3]);
            done();
        });

        c_rv.broadcast('test1');
        c_rv.broadcast('test2', [0, 1.1, '2', true, false, null, { a: 123 }, [1, 2, 3]]);
    });

    it('测试广播收到自己没有订阅过的消息', function (done) {
        c_rv.on('error', (err) => {
            expect(err).to.a(Error);
            done();
        });

        c_rv.broadcast('qwe');
    });
});