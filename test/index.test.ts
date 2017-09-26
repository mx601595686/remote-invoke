import expect = require('expect.js');
import { RemoteInvoke } from '../src';
import { Server, Socket, ReadyState } from 'binary-ws';
import { BinaryWsConnectionPort } from '../src/implements/binary-ws/BinaryWsConnectionPort';

//  注意：测试需要8080端口，请确保不会被占用

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

            setTimeout(() => done(), 0);  //避免还没有触发open事件就接着向下执行了
        });

        c_socket = new Socket('ws://localhost:8080');
        c_socket.on('error', (err) => console.error('测试客户端端接口错误：', err));
        c_rv = new RemoteInvoke({ moduleName: 'client' });
        c_rv.addConnectionPort(new BinaryWsConnectionPort(c_socket));
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

            c_rv.removeAndCloseAllConnectionPort();
        } else {
            done();
        }
    });

    it('属性检查', function () {
        expect(c_rv._conPort.length).to.be(1);
        expect(c_rv._conPort[0].sending).to.be(false);
        expect(c_rv.exportList.size).to.be(0);
        expect(c_rv.receiveList.size).to.be(0);
    });

    it('导出与取消导出测试', function () {
        s_rv.export('ping', async () => 'pong');
        expect(s_rv.export.bind(s_rv)).withArgs('ping', async () => 'pong').throwError();
        expect(s_rv.exportList.size).to.be(1);
        s_rv.cancelExport('ping')
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
            c_rv.addConnectionPort(socket2);
            c_rv.addConnectionPort(socket3);
            setTimeout(function () {
                expect(c_rv._conPort.length).to.be(4);
                c_rv.removeConnectionPort(socket3);
                expect(c_rv._conPort.length).to.be(3);
                expect(socket3._socket.readyState).to.be(ReadyState.OPEN);
                socket3.close();

                c_rv.removeAndCloseConnectionPort(socket2);
                setTimeout(function () {
                    expect(socket3._socket.readyState).to.be(ReadyState.CLOSED);
                    expect(c_rv._conPort.length).to.be(2);
                    expect(socket2._socket.readyState).to.be(ReadyState.CLOSED);

                    c_rv.removeAndCloseAllConnectionPort();
                    socket1.on('close', () => {
                        expect(c_rv._conPort.length).to.be(0);
                        s_socket = undefined as any;
                        done();
                    });
                }, 50);
            }, 50);
        });
    });

    it.only('测试远程调用', async function () {
        s_rv.export('ping', async () => 'pong');
        s_rv.export('return', async (...args: any[]) => args);

        //expect(await c_rv.invoke('server', 'ping')).to.be('pong');
        //expect(await c_rv.invoke('server', 'return', [0, 1.1, '2', true, false, null, { a: 123 }, [1, 2, 3]]))
        //    .to.eql([0, 1.1, '2', true, false, null, { a: 123 }, [1, 2, 3]]);
        expect(await c_rv.invoke('server', 'return', [undefined])).to.eql(undefined);
        //expect(Buffer.from('123').equals(await c_rv.invoke('server', 'return', [Buffer.from('123')]))).to.be.ok();
    });

    it('测试远程调用错误返回异常', async function () {
        s_rv.export('error', async () => { throw new Error('test') });
    })

    it('测试调用超时')

    it('测试收到不是自己的消息', function () {

    })


    it('测试负载均衡(轮流调用端口发送)')


    it('测试发送广播')
    it('测试广播超时')

    it('压力测试')

});