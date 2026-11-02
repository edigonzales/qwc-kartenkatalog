const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
const availableLanguages = require('./static/translations/tsconfig.json').languages;
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');
const packageJson = require('./package.json');

const today = new Date();
const buildDate = today.getFullYear() + "." + String(1 + today.getMonth()).padStart(2, '0') + "." + String(today.getDate()).padStart(2, '0');

const isQwcLts = 'qwc2-lts' in (packageJson.dependencies ?? {}) || (packageJson.workspaces ?? []).includes('qwc2-lts');
console.log(isQwcLts)
const qwc2ModName = isQwcLts ? 'qwc2-lts' : 'qwc2';

module.exports = (env, argv) => {
    const isProd = argv.mode === "production";
    const remote = env.REMOTE === "1";

    return {
        entry: {
            QWC2App: path.resolve(__dirname, 'js', 'app.jsx')
        },
        output: {
            hashFunction: 'sha256',
            publicPath: remote ? '/map/' : 'auto',
            path: path.resolve(__dirname, 'prod'),
            filename: 'dist/QWC2App.js',
            assetModuleFilename: 'dist/[hash][ext][query]',
            clean: true
        },
        watchOptions: {
            ignored: new RegExp(String.raw`node_modules(\\|\/)(?!${qwc2ModName})`)
        },
        devtool: isProd ? 'source-map' : 'inline-source-map',
        optimization: {
            minimize: isProd
        },
        devServer: {
            static: [
                {
                    directory: path.resolve(__dirname, 'static'),
                    publicPath: remote ? '/map/' : '/'
                }
            ],
            compress: true,
            hot: true,
            liveReload: true,
            host: remote ? "127.0.0.1" : "0.0.0.0",
            port: remote ? Number(process.env.QWC_PORT || 8082) : 8080,
            setupMiddlewares: remote ? (middlewares) => {
                middlewares.unshift({name: "live-config", middleware: require("./dev/remote.cjs").createRemoteMiddleware()});
                return middlewares;
            } : undefined
        },
        resolve: {
            extensions: [".mjs", ".js", ".jsx"],
            alias: {
                "@giro3d/giro3d": "@sourcepole/qwc-giro3d",
                "qwc2": qwc2ModName
            },
            fallback: {
                path: require.resolve("path-browserify")
            }
        },
        snapshot: {
            managedPaths: [new RegExp(String.raw`(.*(\\|\/)node_modules(\\|\/)(?!${qwc2ModName}))`)]
        },
        plugins: [
            new webpack.DefinePlugin({
                'process.env': {
                    NODE_ENV: JSON.stringify(argv.mode),
                    RemoteDev: JSON.stringify(remote),
                    BuildDate: JSON.stringify(buildDate),
                    AvailableLanguages: JSON.stringify(availableLanguages)
                }
            }),
            new webpack.NormalModuleReplacementPlugin(/openlayers$/, path.join(__dirname, "node_modules", qwc2ModName, "libs", "openlayers")),
            new HtmlWebpackPlugin({
                template: path.resolve(__dirname, "index.html"),
                build: buildDate,
                remoteDev: remote,
                hash: true
            }),
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'static' }
                ]
            }),
            env.ANALYZE === "1" ? new BundleAnalyzerPlugin({
                analyzerMode: 'server',   // opens browser automatically
                openAnalyzer: true,       // ensures browser launches
                generateStatsFile: true  // optional, creates stats.json
            }) : null
        ],
        module: {
            rules: [
                {
                    test: /\.css$/,
                    use: [
                        {loader: 'style-loader'},
                        {loader: 'css-loader'}
                    ]
                },
                {
                    test: /(.woff|.woff2|.png|.jpg|.gif|.svg|.glb)/,
                    type: 'asset/inline'
                },
                {
                    test: /\.jsx?$/,
                    exclude: /node_modules(\\|\/)(?!qwc2)/,
                    use: {
                        loader: 'babel-loader',
                        options: { babelrcRoots: ['.', path.resolve(__dirname, 'node_modules', qwc2ModName)] }
                    }
                },
                {
                    test: /(.mjs|.js)$/,
                    type: 'javascript/auto'
                },
                {
                    test: /\.js$/,
                    enforce: "pre",
                    use: ["source-map-loader"]
                }
            ]
        }
    };
};
