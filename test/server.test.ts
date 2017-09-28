import expect = require('expect.js');
import { RemoteInvoke } from '../src';
import { Server, Socket, ReadyState } from 'binary-ws';
import { BinaryWsConnectionPort } from '../src/implements/binary-ws/BinaryWsConnectionPort';

//注意：测试需要8080端口，请确保不会被占用

describe('测试remote-invoke', function () {

    let server: Server;
    let s_socket: Socket;   //服务器ws
    let c_socket: Socket;   //客户端ws
    let s_rv: RemoteInvoke;
    let c_rv: RemoteInvoke;

    before(function (done) {
        server = new Server();
        server.on('error', (err) => console.error('测试服务器错误：', err));
        server.once('listening', () => done());
    });

    after(function (done) {
        server.once('close', () => {
            server = undefined as any;
            done();
        });
        server.close();
    });

    beforeEach(function (done) {
        server.once('connection', (socket) => {
            s_socket = socket;
            s_socket.on('error', (err) => console.error('测试服务器端接口错误：', err));
            s_rv = new RemoteInvoke({ moduleName: 'server', reportErrorStack: true });
            s_rv.addConnectionPort(new BinaryWsConnectionPort(s_socket));
        });

        c_socket = new Socket('ws://localhost:8080');
        c_socket.on('error', (err) => console.error('测试客户端端接口错误：', err));
        c_rv = new RemoteInvoke({ moduleName: 'client', timeout: 1000 });
        c_rv.addConnectionPort(new BinaryWsConnectionPort(c_socket));
        c_rv.once('addConnectionPort', () => done());
    });

    afterEach(function (done) {
        if (s_socket !== undefined) {
            s_socket.once('close', () => {
                s_socket = undefined as any;
                c_socket = undefined as any;
                s_rv = undefined as any;
                c_rv = undefined as any;
                done();
            });

            s_rv.removeAndCloseAllConnectionPort();
            c_rv.removeAndCloseAllConnectionPort();
        } else {
            done();
        }
    });

    it('属性检查', function () {
        expect(c_rv.moduleName).to.be('client');
        expect(c_rv._conPort.length).to.be(1);
        expect(c_rv._conPort[0].sending).to.be(false);
        expect(c_rv.exportList.size).to.be(0);
        expect(c_rv.receiveList.size).to.be(0);
    });

    it('导出与取消导出测试', function () {
        s_rv.export('ping', async () => 'pong');
        expect(s_rv.export.bind(s_rv)).withArgs('ping', async () => 'pong').throwError();
        expect(s_rv.exportList.size).to.be(1);
        s_rv.cancelExport('ping');
        expect(s_rv.exportList.size).to.be(0);
    });

    it('注册与取消注册广播测试', function () {
        s_rv.receive('client', 'broadcast', () => { });
        expect(s_rv.receive.bind(s_rv)).withArgs('client', 'broadcast', () => { }).throwError();
        expect(s_rv.receiveList.size).to.be(1);
        s_rv.cancelReceive('client', 'broadcast');
        const _module = s_rv.receiveList.get('client');
        expect(_module && _module.size).to.be(0);
    });

    it('测试添加与移除端口', function (done) {
        const socket1 = new Socket('ws://localhost:8080');
        socket1.on('open', function () {
            const socket2 = new BinaryWsConnectionPort(new Socket('ws://localhost:8080'));
            const socket3 = new BinaryWsConnectionPort(new Socket('ws://localhost:8080'));
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
                        c_rv.removeAndCloseConnectionPort(socket2);
                        c_rv.once('removeConnectionPort', () => {
                            expect(socket3._socket.readyState).to.be(ReadyState.CLOSED);
                            expect(socket2._socket.readyState).to.be(ReadyState.CLOSED);
                            expect(c_rv._conPort.length).to.be(2);

                            c_rv.removeAndCloseAllConnectionPort();
                            socket1.on('close', () => {
                                expect(c_rv._conPort.length).to.be(0);
                                s_socket = undefined as any;
                                done();
                            });
                        });
                    });
                });
            });

        });
    });

    it('测试远程调用', async function () {
        s_rv.export('ping', async () => 'pong');
        s_rv.export('return', async (arg: any) => arg);

        expect(await c_rv.invoke('server', 'ping')).to.be('pong');
        const result = await c_rv.invoke('server', 'return', [0, 1.1, '2', true, false, null, undefined, { a: 123 }, [1, 2, 3], Buffer.from('123')]);
        expect(result[0]).to.be(0);
        expect(result[1]).to.be(1.1);
        expect(result[2]).to.be('2');
        expect(result[3]).to.be(true);
        expect(result[4]).to.be(false);
        expect(result[5]).to.be(null);
        expect(result[6]).to.be(undefined);
        expect(result[7]).to.be.eql({ a: 123 });
        expect(result[8]).to.be.eql([1, 2, 3]);
        expect(Buffer.from('123').equals(result[9])).to.be.ok();
    });

    it('测试远程调用错误返回异常', function (done) {
        s_rv.export('error', async (arg) => {
            const err = new Error('test');
            err.stack = arg;
            throw err;
        });

        c_rv.invoke('server', 'error', 123)
            .then(() => done('代码逻辑存在问题，不可能执行到这'))
            .catch((err: Error) => {
                expect(err.message).to.be('test');
                expect(err.stack).to.be(123);
                done();
            });
    });

    it('测试调用超时', function (done) {
        let s_received = false;
        s_rv.export('ping', (arg) => {
            return new Promise((resolve, reject) => {
                s_received = true;
                setTimeout(function () {
                    resolve('pong');
                }, 1500);
            });
        });

        c_rv.invoke('server', 'ping')
            .then(() => done('代码逻辑存在问题，不可能执行到这'))
            .catch((err: Error) => {
                expect(s_received).to.be.ok();
                expect(err).to.be.a(Error);
                done();
            });
    });

    it('测试调用收到不是自己的消息', function (done) {
        s_rv.export('ping', async (arg) => {
            done('代码逻辑存在问题，不可能执行到这');
        });

        let s_err = false;
        s_rv.on('error', (err) => {
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

    it('测试无可用端口发送数据', function (done) {
        c_rv.removeAndCloseAllConnectionPort();
        s_socket = undefined as any;

        c_rv.invoke('server', 'ping')
            .then(() => done('代码逻辑存在问题，不可能执行到这'))
            .catch((err) => { expect(err).to.be.a(Error); done(); });
    });

    it('测试发送广播', function (done) {
        let ranTest1 = false;
        s_rv.receive('client', 'test1', (arg) => {
            ranTest1 = true;
            expect(arg).to.be(undefined);
        });

        s_rv.receive('client', 'test2', (result) => {
            expect(ranTest1).to.be.ok();
            expect(result[0]).to.be(0);
            expect(result[1]).to.be(1.1);
            expect(result[2]).to.be('2');
            expect(result[3]).to.be(true);
            expect(result[4]).to.be(false);
            expect(result[5]).to.be(null);
            expect(result[6]).to.be(undefined);
            expect(result[7]).to.be.eql({ a: 123 });
            expect(result[8]).to.be.eql([1, 2, 3]);
            expect(Buffer.from('123').equals(result[9])).to.be.ok();
            done();
        });

        c_rv.broadcast('test1');
        c_rv.broadcast('test2', [0, 1.1, '2', true, false, null, undefined, { a: 123 }, [1, 2, 3], Buffer.from('123')]);
    });

    it('测试广播收到自己没有订阅过的消息', function (done) {
        s_rv.on('error', (err) => {
            expect(err).to.a(Error);
            done();
        });

        c_rv.broadcast('qwe');
    });

    it('测试负载均衡(轮流调用端口发送)', function (done) {
        server.once('connection', (socket) => {
            const s_rv2 = new RemoteInvoke({ moduleName: 'server', reportErrorStack: true });
            s_rv2.addConnectionPort(new BinaryWsConnectionPort(socket));

            let s1_rec = 0, s2_rec = 0;
            s_rv.receive('client', 'test', index => {
                //console.log('s_rv1', index);
                s1_rec++;
            });

            s_rv2.receive('client', 'test', index => {
                //console.log('s_rv2', index);
                s2_rec++;
            });

            s_rv2.on('addConnectionPort', function () {
                for (let i = 1; i <= 1000; i++)
                    setTimeout(() => c_rv.broadcast('test', i), i);

                setTimeout(() => {
                    console.log('s1_rec', s1_rec, 's2_rec', s2_rec);
                    expect(Math.abs(s1_rec / s2_rec - 1)).to.be.lessThan(0.1);
                    done();
                }, 1100);
            });
        });

        c_rv.addConnectionPort(new BinaryWsConnectionPort(new Socket('ws://localhost:8080')));
    });
});