var PathRewriterPlugin = require('webpack-path-rewriter')

module.exports = {
  entry: {
    app: "./app/index.jsx"
  },
  output: {
    path: '_dist',
    filename: 'app-[chunkhash].js',
    publicPath: '/public/path/'
  },
  module: {
    loaders: [{
      test: /[.]jsx?$/,
      exclude: /node_modules/,
      loader: 'babel?optional=runtime'
    }, {
      test: /[/]images[/]/,
      loader: 'file?name=[path][name]-[hash].[ext]'
    }, {
      test: /[.]css$/,
      loader: 'file?name=[path][name]-[hash].[ext]'
    }, {
      test: /[.]html$/,
      loader: PathRewriterPlugin.rewriteAndEmit({
        name: '[name].html'
      })
    }]
  },
  plugins: [
    new PathRewriterPlugin()
  ]
}
