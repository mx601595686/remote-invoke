import * as http from 'http';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as BWS from 'binary-ws';
import opener = require('opener');
import * as webpack from 'webpack';
import memoryFS = require('memory-fs');
const webpackConfig = require('./webpack.config.js');

function log(...args: any[]) {
    console.log(`[${(new Date).toLocaleTimeString()}]  `, ...args);
}

const mfs = new memoryFS();
const compiler: webpack.Compiler = webpack(webpackConfig);
compiler.outputFileSystem = mfs;

const server = http.createServer((req, res) => {
    let url = req.url || '';

    if (url === '/') {
        res.writeHead(301, { 'Location': '/test/browser/index.html' });
        res.end();
    } else if (url.endsWith('browser.test.ts')) {
        compiler.run((err, stats) => {
            if (stats.hasErrors()) {
                log(stats.toString());
                res.statusCode = 500;
                res.end();
            } else {
                const content = mfs.readFileSync('/index.js');
                res.end(content);
            }
        });
    } else {
        try {
            const file = fs.readFileSync(path.resolve(__dirname, '../../', '.' + url));
            res.end(file);
        } catch (error) {
            res.statusCode = 404;
            res.end();
        }
    }
});

const ws = new BWS.Server({ server, maxPayload: 2000 });

ws.on('error', (err) => console.error(err));
ws.on('connection', socket => {
    log('有新socket连接：', socket.id);
    socket.on('error', err => log('socket', socket.id, '错误：', err));
    socket.on('close', () => log('Socket断开：', socket.id));
    socket.on('message', (name, data) => {
        //log('socket', socket.id, '收到消息：', `{${name}}`, data);
        socket.send(name, data, false).catch(err => { log(err) });
    });
});

server.listen(8080, () => {
    log('浏览器测试服务已启动！不同浏览器和各种网络环境请都测试一下。');
    opener('http://localhost:8080');
});

server.on('close', () => log("浏览器测试服务已关闭！"));
