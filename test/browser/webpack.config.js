const webpack = require('webpack');
const path = require('path');

module.exports = {
    entry: {
        index: path.resolve(__dirname, './browser.test.ts')
    },
    output: {
        filename: 'index.js',
        path: '/'
    },
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /.ts?$/,
                use: 'ts-loader?' + JSON.stringify({
                    compilerOptions: {
                        declaration: false,
                        allowJs: true,
                        target: "es2017"
                    }
                }),
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [".ts", ".js"]
    }
}