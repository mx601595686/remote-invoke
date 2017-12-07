import * as http from 'http';
import expect = require('expect.js');
import { Server, ServerSocket, ReadyState } from 'binary-ws';
import { EventSpace } from 'eventspace/bin/classes/EventSpace';

import { RemoteInvoke, MessageType } from '../src';
import { BinaryWS_socket } from './BinaryWS_socket';

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

                s_rv.printMessage = true;
                c_rv.printMessage = true;

                (s_rv.timeout as any) = 3 * 1000; //修改为3秒过期超时
                (c_rv.timeout as any) = 3 * 1000;

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

            const result = await c_rv.invoke('server', 'test/a');
            expect(result.data).to.be(2);
        });

        describe('测试获取远端方法反馈的错误', function () {
            it('promise版', function (done) {
                s_rv.export('test', async (data) => {
                    throw new Error('test error');
                });

                c_rv.invoke('server', 'test').catch(err => {
                    expect(err).to.be.a(Error);
                    expect(err.message).to.be('test error');
                    done();
                });
            });

            it('回调函数版', function (done) {
                s_rv.export('test', async (data) => {
                    throw new Error('test error');
                });

                c_rv.invoke('server', 'test', undefined, async (err: any, data) => {
                    expect(err).to.be.a(Error);
                    expect(err.message).to.be('test error');
                    expect(data).to.be(undefined);
                    done();
                });
            });
        });

        describe('测试超时', function () {

            describe('测试调用超时', function () {

                it('promise版', function (done) {
                    this.timeout(10 * 1000);

                    s_rv.export('test', (data) => {
                        return new Promise((resolve, reject) => {
                            setTimeout(() => resolve, 5 * 1000);
                        });
                    });

                    c_rv.invoke('server', 'test').catch(err => {
                        expect(err.message).to.be('请求超时');
                        done();
                    });
                });

                it('回调函数版', function (done) {
                    this.timeout(10 * 1000);

                    s_rv.export('test', (data) => {
                        return new Promise((resolve, reject) => {
                            setTimeout(() => resolve, 5 * 1000);
                        });
                    });

                    c_rv.invoke('server', 'test', undefined, async (err: any, data) => {
                        expect(err.message).to.be('请求超时');
                        done();
                    });
                });
            });

            it.only('测试被调用端超时后清理资源', function (done) {
                this.timeout(10 * 1000);

                s_rv.export('test', async (data) => {
                    return { data: null, files: [{ name: 'test file', file: Buffer.alloc(512 * 1024 * 4) }] };
                });

                c_rv.invoke('server', 'test', undefined, (err, data) => {
                    return new Promise((resolve1) => {
                        expect(err).to.be(undefined);
                        data.files[0].onData((err, isEnd, index, data) => {
                            return new Promise((resolve2) => {
                                if (index === 0) {
                                    expect(err).to.be(undefined);
                                    setTimeout(resolve2, 5 * 1000);
                                } else {
                                    expect((<Error>err).message).to.be('请求超时');
                                    resolve1();
                                    done();
                                }
                            });
                        });
                    });
                });
            });

            describe('测试请求文件片段超时', function () {

            });

            describe('测试下载文件延长调用超时', function () { });

        });

        describe('测试向对方发送文件', function () {
            describe('测试发送固定大小文件', function () { });
            describe('测试发送不固定大小文件', function () { });
            describe('测试发送文件进度', function () { });
            describe('测试在发送文件过程中出错', function () { });
        });

        describe('测试接收对方发送的文件', function () {
            /**
             * 这一条测试注意观察，下载完文件后"invoke_finish"是否发送
             */

            describe('测试接收固定大小文件', function () { });
            describe('测试接收不固定大小文件', function () { });
            describe('测试从指定位置开始接收文件', function () { });
            describe('测试在接收文件过程中出错', function () { });
        });

        describe('测试收发数据与文件', function () { });

        describe('压力测试', function () { });

        describe('测试在执行完上面的操作后，_messageListener中对应类型的监听器是否为空', function () { });
    });

    describe('测试 broadcast', function () {
        it('测试注册广播', function () {
            /**
             * 注意查看broadcast_open
             */
        })

        it('测试取消注册广播', function () {
            /**
             * 注意查看broadcast_close
             */
        })

        it('测试发送对方没有注册过的广播', function () {
            /**
             * 注意查看broadcast_close
             */
        })

        it('测试向对方发送广播广播', function () {
            /**
             * 注意查看broadcast_close
             */
        })


        it('测试发送带有层级关系的广播', function () {
            /**
             * 注意查看broadcast_close
             */
        })

        it('测试网络连接断开后，清空对方注册过的广播', function () {
            /**
             * 注意查看broadcast_close
             */
        })

        it('测试网络重连后，向方发送注册过的广播', function () {
            /**
             * 注意查看broadcast_close
             */
        })
    });
});