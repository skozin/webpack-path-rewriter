var ExtractTextPlugin = require('extract-text-webpack-plugin'),
    PathRewriterPlugin = require('webpack-path-rewriter')

module.exports = {
  entry: {
    app: './scripts/index'
  },
  output: {
    path: '_dist',
    filename: 'app-[chunkhash].js',
    publicPath: '/public/path/'
  },
  module: {
    loaders: [{
      test: /[/]images[/]/,
      loader: 'file?name=[path][name]-[hash].[ext]'
    }, {
      test: /[.]styl$/,
      loader: ExtractTextPlugin.extract('css?sourceMap!stylus?sourceMap')
    }, {
      test: /[.]jade$/,
      loader: PathRewriterPlugin.rewriteAndEmit({
        name: '[path][name].html',
        loader: 'jade-html?' + JSON.stringify({ pretty: true })
      })
    }]
  },
  plugins: [
    new ExtractTextPlugin('app-[chunkhash].css', { allChunks: true }),
    new PathRewriterPlugin()
  ]
}
