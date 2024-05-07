const path = require('path');

module.exports = {
    mode: 'development',
    entry: './js/dev/starTracker.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'js/build'),
    },
};