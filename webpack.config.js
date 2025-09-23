const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        popup: path.resolve('./src/popup.tsx'),
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'babel-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                // This explicitly tells webpack to use the original file's name and extension
                // for the output file, which flattens the directory structure.
                { from: "src/manifest.json", to: "[name][ext]" },
                { from: "src/popup.html", to: "[name][ext]" },
            ],
        }),
    ],
};
