import * as http from 'http';
import expect = require('expect.js');
import { Server, ServerSocket, ReadyState } from 'binary-ws';
import { EventSpace } from 'eventspace/bin/classes/EventSpace';

import { RemoteInvoke,MessageType } from '../../src';
import { BinaryWS_socket } from './../BinaryWS_socket';

//注意：测试需要8080端口，请确保不会被占用
describe('测试remote-invoke', function () {
    let server: Server;
    let s_socket: ServerSocket;   //服务器ws
    let c_socket: ServerSocket;   //客户端ws
    let s_rv: RemoteInvoke;
    let c_rv: RemoteInvoke;

    before(function (done) {
        const httpServer = http.createServer();
        httpServer.listen(8080);
        server = new Server(httpServer, { url: 'ws://localhost:8080' });

        server.on('error', (err) => console.error('测试服务器出错：', err));
        server.once('listening', () => {
            server.once('connection', (socket) => {
                s_socket = socket;
                s_socket.on('error', (err) => console.error('测试服务器端接口错误：', err));
                c_socket.on('error', (err) => console.error('测试客户端端接口错误：', err));

                s_rv = new RemoteInvoke(new BinaryWS_socket(s_socket), 'server');
                c_rv = new RemoteInvoke(new BinaryWS_socket(c_socket), 'client');

                c_rv.printMessage = true;

                done();
            });

            c_socket = new ServerSocket({ url: 'ws://localhost:8080' });
        });
    });

    after(function (done) {
        server.once('close', () => done());
        server.close();
    });

    describe('测试 invoke', function () {

        afterEach(function () {
            //清除所有导出的方法
            ((<any>s_rv)._messageListener as EventSpace).cancelDescendants([MessageType.invoke_request] as any);
        });

        it('测试在相同的path上重复导出方法', async function () {
            s_rv.export('test/a', async (data) => {
                return { data: 1 };
            });

            s_rv.export('test/a', async (data) => {
                return { data: 2 };
            });

            const result = await c_rv.invoke('server', 'test/a', { data: null });
            expect(result.data).to.be(2);
        });

        it.only('测试远端方法反馈错误', function (done) {
            s_rv.export('test', async (data) => {
                throw new Error('test error');
            });

            c_rv.invoke('server', 'test', { data: null }).catch(err => {
                expect(err).to.be.a(Error);
                expect(err.message).to.be('test error');
                done();
            });
        });

        it('测试取消导出方法')
        it('测试导出方法')
        it('测试导出方法')
        it('测试导出方法')
        it('测试导出方法')
        it('测试导出方法')
    });

    describe('测试 broadcast', function () {

    });
});