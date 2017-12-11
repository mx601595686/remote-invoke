import * as http from 'http';
import expect = require('expect.js');
import { Server, ServerSocket, ReadyState } from 'binary-ws';
import { EventSpace } from 'eventspace/bin/classes/EventSpace';

import { RemoteInvoke, MessageType } from '../src';
import { BinaryWS_socket } from './BinaryWS_socket';

//注意：测试需要8080端口，请确保不会被占用
describe('测试remote-invoke', function () {
    let server: Server;           //ws服务器
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

                //s_rv.printMessage = true;
                //c_rv.printMessage = true;

                (s_rv.timeout as any) = 5 * 1000; //修改为5秒过期超时
                (c_rv.timeout as any) = 5 * 1000;

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
            ((<any>c_rv)._messageListener as EventSpace).cancelDescendants([MessageType.invoke_request] as any);
        });

        it('测试接收到不属于自己的消息', function (done) {
            this.timeout(20 * 1000);

            //注意：这个没法测试，只有观察输出有没有错误提示
            console.log('注意：下面输出一段错误才是正确的');

            c_rv.invoke('not server', 'test')
                .then(() => done('不可能执行到这'))
                .catch(err => {
                    expect(err.message).to.be('请求超时');
                    done();
                });
        });

        it('调用不存在的方法', function (done) {
            c_rv.invoke('server', 'test').catch(err => {
                expect(err.message).to.be('调用的方法不存在');
                done();
            });
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

        describe('测试调用的远端方法报错', function () {

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
                    this.timeout(20 * 1000);

                    s_rv.export('test', (data) => {
                        return new Promise((resolve, reject) => {
                            setTimeout(() => resolve, 10 * 1000);
                        });
                    });

                    c_rv.invoke('server', 'test').catch(err => {
                        expect(err.message).to.be('请求超时');
                        done();
                    });
                });

                it('回调函数版', function (done) {
                    this.timeout(20 * 1000);

                    s_rv.export('test', (data) => {
                        return new Promise((resolve, reject) => {
                            setTimeout(() => resolve, 10 * 1000);
                        });
                    });

                    c_rv.invoke('server', 'test', undefined, async (err: any, data) => {
                        expect(err.message).to.be('请求超时');
                        done();
                    });
                });
            });

            it('测试被调用端超时后清理资源', function (done) {
                //注意查看输出，第二次请求文件，应当是收不到回应的
                this.timeout(20 * 1000);

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
                                    setTimeout(resolve2, 10 * 1000);
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

            it('测试请求文件片段超时', function (done) {
                this.timeout(20 * 1000);

                s_rv.export('test', async (data) => {
                    return {
                        data: null, files: [{
                            name: 'test file',
                            file: (index) => {
                                return new Promise((resolve, reject) => {
                                    setTimeout(resolve, 10 * 1000, Buffer.alloc(10));
                                });
                            }
                        }]
                    };
                });

                c_rv.invoke('server', 'test', undefined, (err, data) => {
                    return new Promise((resolve, reject) => {
                        expect(err).to.be(undefined);
                        data.files[0].getFile().then(() => done('不可能执行到这')).catch(err => {
                            expect((<Error>err).message).to.be('请求超时');
                            resolve();
                            done();
                        });
                    });
                });
            });
        });

        it('测试下载文件延长调用超时', function (done) {
            this.timeout(20 * 1000);

            s_rv.export('test', async (data) => {
                return {
                    data: null, files: [{
                        name: 'test file',
                        file: (index) => {
                            return new Promise((resolve, reject) => {
                                if (index > 1)
                                    resolve();
                                else
                                    setTimeout(resolve, 3 * 1000, Buffer.alloc(10));
                            });
                        }
                    }]
                };
            });

            const startTime = (new Date).getTime();
            c_rv.invoke('server', 'test').then(data => {
                expect((new Date).getTime()).greaterThan(startTime + 5 * 1000);
                done();
            }).catch(err => done(err));
        });

        describe('测试向对方发送文件', function () {

            it('测试发送固定大小文件', async function () {
                this.timeout(20 * 1000);

                const testObj = { a: '1', b: 2, c: true, d: null, e: [1.1, 2.2, 3.3] };
                const testBuffer = Buffer.alloc(1023 * 1023);
                for (let index = 0; index < testBuffer.length; index++) {
                    testBuffer[index] = index % 2 === 0 ? 0 : 1;
                }

                s_rv.export('test', async (data) => {
                    expect(data.data).to.be.eql(testObj);
                    expect(data.files[0].name).to.be('test file');
                    expect(data.files[0].size).to.be(testBuffer.length);
                    expect(data.files[0].splitNumber).to.be(Math.ceil(testBuffer.length / 512 / 1024));
                    expect(testBuffer.equals(await data.files[0].getFile())).to.be.ok();

                    return { data: 'ok' };
                });

                let index = 0;  //第几次触发onProgress
                const result = await c_rv.invoke('server', 'test', {
                    data: testObj,
                    files: [{
                        name: 'test file', file: testBuffer, onProgress(err, progress) {
                            expect(err).to.be(undefined);
                            if (index++ === 0) {
                                expect(progress).to.be(0.5);
                            } else {
                                expect(progress).to.be(1);
                            }
                        }
                    }]
                });

                expect(index).to.be(2);
                expect(result.data).to.be('ok');
            });

            it('测试发送不固定大小文件', async function () {
                this.timeout(20 * 1000);

                const testObj = { a: '1', b: 2, c: true, d: null, e: [1.1, 2.2, 3.3] };

                s_rv.export('test', async (data) => {
                    expect(data.data).to.be.eql(testObj);
                    expect(data.files[0].name).to.be('test file');
                    expect(data.files[0].size).to.be(null);
                    expect(data.files[0].splitNumber).to.be(null);
                    expect(Buffer.from([1, 2, 3]).equals(await data.files[0].getFile())).to.be.ok();

                    return { data: 'ok' };
                });

                const result = await c_rv.invoke('server', 'test', {
                    data: testObj,
                    files: [{
                        name: 'test file', file: async (index) => {
                            if (index < 3) {
                                return Buffer.from([index + 1]);
                            }
                        }, onProgress(err, progress) {  //file为回调版本，只有出错才会触发onProgress
                            throw new Error('不可能执行到这')
                        }
                    }]
                });

                expect(result.data).to.be('ok');
            });

            it('测试在发送文件过程中出错', function (done) {
                this.timeout(20 * 1000);

                s_rv.export('test', async (data) => {
                    await data.files[0].getFile();  //这里会收到错误
                });

                c_rv.invoke('server', 'test', { data: null, files: [{ name: '', file: async () => { throw new Error('发送文件异常'); } }] })
                    .then(() => done('不可能执行到这'))
                    .catch(err => {
                        expect(err.message).to.be('发送文件异常');
                        done();
                    });
            });
        });

        describe('测试接收对方发送的文件', function () {
            /**
             * 这一条测试注意观察，下载完文件后"invoke_finish"是否发送
             */
            describe('测试接收文件', function () {

                it('promise版', async function () {
                    this.timeout(20 * 1000);

                    const testObj = { a: '1', b: 2, c: true, d: null, e: [1.1, 2.2, 3.3] };
                    const testBuffer1 = Buffer.alloc(1023 * 1023);
                    for (let index = 0; index < testBuffer1.length; index++) {
                        testBuffer1[index] = index % 2 === 0 ? 0 : 1;
                    }
                    const testBuffer2 = Buffer.alloc(1023 * 1023);
                    for (let index = 0; index < testBuffer2.length; index++) {
                        testBuffer2[index] = index % 2 === 0 ? 1 : 0;
                    }

                    s_rv.export('test', async (data) => {
                        return {
                            data: testObj, files: [
                                { name: '1', file: testBuffer1 },
                                { name: '2', file: testBuffer2 }
                            ]
                        };
                    });

                    const result = await c_rv.invoke('server', 'test');

                    expect(result.data).to.be.eql(testObj);
                    expect(result.files[0].name).to.be('1');
                    expect(testBuffer1.equals(result.files[0].data)).to.be.ok();
                    expect(result.files[1].name).to.be('2');
                    expect(testBuffer2.equals(result.files[1].data)).to.be.ok();
                });

                it('回调函数版', function (done) {
                    this.timeout(20 * 1000);

                    const testObj = { a: '1', b: 2, c: true, d: null, e: [1.1, 2.2, 3.3] };
                    const testBuffer = Buffer.alloc(1023 * 1023);
                    for (let index = 0; index < testBuffer.length; index++) {
                        testBuffer[index] = index % 2 === 0 ? 0 : 1;
                    }

                    s_rv.export('test', async (data) => {
                        return { data: testObj, files: [{ name: '1', file: testBuffer }] };
                    });

                    c_rv.invoke('server', 'test', undefined, (err, data) => {
                        return new Promise((resolve, reject) => {
                            expect(err).to.be(undefined);
                            expect(data.data).to.be.eql(testObj);
                            expect(data.files[0].name).to.be('1');
                            expect(data.files[0].size).to.be(testBuffer.length);
                            expect(data.files[0].splitNumber).to.be(Math.ceil(testBuffer.length / 512 / 1024));

                            let idx = 0;  //判断执行到第几次了
                            data.files[0].onData(async (err, isEnd, index, data) => {
                                expect(err).to.be(undefined);
                                idx++;

                                if (idx === 1) {
                                    expect(isEnd).to.be(false);
                                    expect(index).to.be(0);
                                    expect(testBuffer.slice(0, 512 * 1024).equals(data)).to.be.ok();
                                } else if (idx === 2) {
                                    expect(isEnd).to.be(false);
                                    expect(index).to.be(1);
                                    expect(testBuffer.slice(512 * 1024).equals(data)).to.be.ok();
                                } else {
                                    expect(isEnd).to.be(true);
                                    expect(index).to.be(2);
                                    expect(data.length).to.be(0);

                                    expect(idx).to.be(3);
                                    resolve();
                                    done();
                                }
                            });
                        });
                    });
                });
            });

            it('测试重复下载文件', function (done) {
                this.timeout(20 * 1000);

                s_rv.export('test', async (data) => {
                    return { data: null, files: [{ name: '1', file: Buffer.alloc(1) }] };
                });

                c_rv.invoke('server', 'test', undefined, (err, data) => {
                    return new Promise((resolve, reject) => {
                        expect(err).to.be(undefined);
                        data.files[0].getFile()
                            .then(() => {
                                data.files[0].getFile()
                                    .then(() => done('不可能执行到这'))
                                    .catch(err => {
                                        expect(err.message).to.be('不可重复下载文件');
                                        resolve();
                                        done();
                                    });
                            })
                            .catch(err => done(err));
                    });
                });
            })

            it('测试从指定位置开始接收文件', function (done) {
                this.timeout(20 * 1000);

                const testBuffer = Buffer.alloc(1023 * 1023);
                for (let index = 0; index < testBuffer.length; index++) {
                    testBuffer[index] = index % 2 === 0 ? 0 : 1;
                }

                s_rv.export('test', async (data) => {
                    return { data: null, files: [{ name: '1', file: testBuffer }] };
                });

                c_rv.invoke('server', 'test', undefined, (err, data) => {
                    return new Promise((resolve, reject) => {
                        expect(err).to.be(undefined);

                        data.files[0].onData(async (err, isEnd, index, data) => {
                            if (index === 1) {
                                expect(err).to.be(undefined);
                                expect(isEnd).to.be(false);
                                expect(index).to.be(1);
                                expect(testBuffer.slice(512 * 1024).equals(data)).to.be.ok();
                            } else {
                                expect(err).to.be(undefined);
                                expect(isEnd).to.be(true);
                                expect(index).to.be(2);
                                expect(data.length).to.be(0)

                                resolve();
                                done();
                            }
                        }, 1);
                    });
                });
            });

            it('测试指定的位置超出了范围', function (done) {
                //注意观察：如果指定的位置超出了范围则直接判定为下载结束，不会发送文件请求消息
                this.timeout(20 * 1000);

                const testBuffer = Buffer.alloc(1023 * 1023);
                for (let index = 0; index < testBuffer.length; index++) {
                    testBuffer[index] = index % 2 === 0 ? 0 : 1;
                }

                s_rv.export('test', async (data) => {
                    return { data: null, files: [{ name: '1', file: testBuffer }] };
                });

                c_rv.invoke('server', 'test', undefined, (err, data) => {
                    return new Promise((resolve, reject) => {
                        expect(err).to.be(undefined);

                        data.files[0].onData(async (err, isEnd, index, data) => {
                            expect(err).to.be(undefined);
                            expect(isEnd).to.be(true);
                            expect(index).to.be(2);
                            expect(data.length).to.be(0);

                            resolve();
                            done();
                        }, 2);
                    });
                });
            });

            it('测试中途终止接收文件', function (done) {
                this.timeout(20 * 1000);

                const testBuffer = Buffer.alloc(1023 * 1023);
                for (let index = 0; index < testBuffer.length; index++) {
                    testBuffer[index] = index % 2 === 0 ? 0 : 1;
                }

                s_rv.export('test', async (data) => {
                    return { data: null, files: [{ name: '1', file: testBuffer }] };
                });

                c_rv.invoke('server', 'test', undefined, (err, data) => {
                    return new Promise((resolve, reject) => {
                        expect(err).to.be(undefined);

                        data.files[0].onData(async (err, isEnd, index, data) => {
                            expect(err).to.be(undefined);
                            expect(isEnd).to.be(false);
                            expect(index).to.be(0);
                            expect(testBuffer.slice(0, 512 * 1024).equals(data)).to.be.ok();

                            setTimeout(() => {  //确保只触发一次
                                resolve();
                                done();
                            }, 1000);

                            return true;
                        });
                    });
                });
            });
        });

        it('压力测试', function (done) {
            this.timeout(20 * 1000);

            (async () => {
                const testObj = { a: '1', b: 2, c: true, d: null, e: [1.1, 2.2, 3.3] };
                const testBuffer1 = Buffer.alloc(1023 * 1023);
                for (let index = 0; index < testBuffer1.length; index++) {
                    testBuffer1[index] = index % 2 === 0 ? 0 : 1;
                }
                const testBuffer2 = Buffer.alloc(1020 * 1020);
                for (let index = 0; index < testBuffer2.length; index++) {
                    testBuffer2[index] = index % 2 === 0 ? 1 : 0;
                }

                s_rv.export('test', async (data) => {
                    expect(data.data).to.be.eql(testObj);
                    expect(data.files[0].name).to.be('1');
                    expect(data.files[0].size).to.be(testBuffer1.length);
                    expect(data.files[0].splitNumber).to.be(Math.ceil(testBuffer1.length / 512 / 1024));

                    const file = await data.files[0].getFile();
                    expect(testBuffer1.equals(file)).to.be.ok();

                    return { data: data.data, files: [{ name: data.files[0].name, file }] };
                });

                c_rv.export('test2', async (data) => {
                    expect(data.data).to.be.eql(testObj);
                    expect(data.files[0].name).to.be('2');
                    expect(data.files[0].size).to.be(testBuffer2.length);
                    expect(data.files[0].splitNumber).to.be(Math.ceil(testBuffer2.length / 512 / 1024));

                    const file = await data.files[0].getFile();
                    expect(testBuffer2.equals(file)).to.be.ok();

                    return { data: data.data, files: [{ name: data.files[0].name, file }] };
                });

                for (let index = 0; index < 50; index++) {
                    const data = await c_rv.invoke('server', 'test', { data: testObj, files: [{ name: '1', file: testBuffer1 }] });
                    expect(data.data).to.be.eql(testObj);
                    expect(data.files[0].name).to.be('1');
                    expect(testBuffer1.equals(data.files[0].data)).to.be.ok();
                }

                for (let index = 0; index < 50; index++) {
                    const data = await s_rv.invoke('client', 'test2', { data: testObj, files: [{ name: '2', file: testBuffer2 }] });
                    expect(data.data).to.be.eql(testObj);
                    expect(data.files[0].name).to.be('2');
                    expect(testBuffer2.equals(data.files[0].data)).to.be.ok();
                }

                //测试在执行完上面的操作后，_messageListener中对应类型的监听器是否为空
                setTimeout(() => {  //等待1秒，确保所有发送的消息都被收到了
                    const s_es = ((<any>s_rv)._messageListener as EventSpace);
                    const c_es = ((<any>c_rv)._messageListener as EventSpace);

                    expect(s_es.hasDescendants([MessageType.invoke_response] as any)).to.not.be.ok();
                    expect(s_es.hasDescendants([MessageType.invoke_finish] as any)).to.not.be.ok();
                    expect(s_es.hasDescendants([MessageType.invoke_failed] as any)).to.not.be.ok();
                    expect(s_es.hasDescendants([MessageType.invoke_file_request] as any)).to.not.be.ok();
                    expect(s_es.hasDescendants([MessageType.invoke_file_response] as any)).to.not.be.ok();
                    expect(s_es.hasDescendants([MessageType.invoke_file_finish] as any)).to.not.be.ok();
                    expect(s_es.hasDescendants([MessageType.invoke_file_failed] as any)).to.not.be.ok();

                    expect(c_es.hasDescendants([MessageType.invoke_response] as any)).to.not.be.ok();
                    expect(c_es.hasDescendants([MessageType.invoke_finish] as any)).to.not.be.ok();
                    expect(c_es.hasDescendants([MessageType.invoke_failed] as any)).to.not.be.ok();
                    expect(c_es.hasDescendants([MessageType.invoke_file_request] as any)).to.not.be.ok();
                    expect(c_es.hasDescendants([MessageType.invoke_file_response] as any)).to.not.be.ok();
                    expect(c_es.hasDescendants([MessageType.invoke_file_finish] as any)).to.not.be.ok();
                    expect(c_es.hasDescendants([MessageType.invoke_file_failed] as any)).to.not.be.ok();

                    done();
                }, 1000);
            })();
        });
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