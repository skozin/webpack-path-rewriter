This is a [Webpack](http://webpack.github.io) plugin that:

  * writes text resources to the file system;
  * in these resources, replaces selected paths with their public counterparts.

Plays nicely with [webpack-dev-server](http://webpack.github.io/docs/webpack-dev-server.html);
see `includeHash` option of [the constructor](#new-pathrewriteropts--undefined).


## Example

index.jade:

```jade
doctype html
head
  title My awesome app
  meta( charset="utf-8" )
  link( href="[[ app-*.css ]]", media="all", rel="stylesheet" )
body
  p Hi everyone!
  img( src="[[ images/hi.png ]]" )
  script( src="[[ app-*.js ]]" )
```

webpack.config.js:

```js
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
    new ExtractTextPlugin('app-[contenthash].css', { allChunks: true }),
    new PathRewriterPlugin()
  ]
}
```

After the build, `_dist/index.html` will contain the following:

```html
<!DOCTYPE html>
<head>
  <title>My awesome app</title>
  <meta charset="utf-8">
  <link href="/public/path/app-aeeae55eaf7373d1be14ccc3fa44272d.css" media="all" rel="stylesheet">
</head>
<body>
  <p>Hi everyone!</p>
  <img src="/public/path/images/hi-9bc044c418aba70701582981061b685f.png">
  <script src="/public/path/app-c5db2b3d825a8bccf99b.js"></script>
</body>
```


## Usage

This plugin is content-agnostic, so it doesn't perform any parsing. You need to explicitly mark
each path that needs to be rewritten.

By default, you do this by wrapping such paths inside the `"[[original/path]]"` construction, which
after rewriting transforms to the `"rewritten/path"`. You can control this behavior using options,
both global and per-resource.

There are two types of assets.

### 1. Normal assets

Most of the assets already exist in the source tree before you run the build. To rewrite paths to
such assets, just mark these paths with the special construction described above.

For example, if you have `views/index.jade` and `images/hi.png`, in the index.jade you can specify
`"[[../images/hi.png]]"` and it will be replaced with whatever public path `images/hi.png` is
assigned to, e.g. `"/static/images/hi-somelonghash.png"`.

### 2. Generated assets

Some of the assets appear as a result of the build. These include JavaScript bundles (chunks)
and files produced by
[extract-text-webpack-plugin](https://github.com/webpack/extract-text-webpack-plugin).
To rewrite path to an asset of this kind, you need to replace any variable parts of this path
with asterisk `*` symbols.

For example, to rewrite path from `views/index.jade` to the JS bundle which gets placed to
`[hash]/scripts/app-[chunkhash].js`, the path should be specified as `"[[../*/scripts/app-*.js]]"`.


## Customizing the path marker

Sometimes it may be inconvenient to use the default `"[[...]]"` marker. It can be customized using
three options: `pathRegExp`, `pathMatchIndex` (index of capturing group containing extracted path)
and `pathReplacer` (template of the replacement string).

For example, you can use the following options to rewrite all `src` and `href` HTML attributes that
end with some extension (non-relative paths are automatically skipped):

```js
{
  pathRegExp: /(src|href)\s*=\s*"(.*?\.[\w\d]{1,6})"/,
  pathMatchIndex: 2,
  pathReplacer: '[1]="[path]"'
}
```


## API

#### `PathRewriter.rewriteAndEmit(loader | opts)`

Marks a resource for rewriting paths and emitting to the file system. Use it in conjunction with the `new PathRewriter()` in the plugins list.

Takes one argument, which is either string or object. If string, then it specifies the resource's
loader string along with the options, e.g.

```js
PathRewriter.rewriteAndEmit('?name=[path][name]-[hash].[ext]')
PathRewriter.rewriteAndEmit('jade-html?pretty')
PathRewriter.rewriteAndEmit('?name=[path][name].[ext]!jade-html?pretty')
```

Object form allows to pass the following options:

* `loader` the resource's loader string.
* `loaders` an array of loaders; mutually exclusive with the `loader` option.
* `name` the path to the output file. Defaults to `"[path][name].[ext]"`. May contain the
  following tokens:
    - `[ext]` the extension of the resource;
    - `[name]` the basename of the resource;
    - `[path]` the path of the resource relative to the `context` option;
    - `[hash]` the hash of the resource's content;
    - `[<hashType>:hash:<digestType>:<length>]` see
       [loader-utils docs](https://github.com/webpack/loader-utils#interpolatename);
    - `[N]` content of N-th capturing group obtained from matching the resource's path
      against the `nameRegExp` option.
* `nameRegExp, context` see `name`.
* `publicPath` allows to override the global `output.publicPath` setting.
* `pathRegExp, pathMatchIndex, pathReplacer` allow to override options for rewriting paths
  in this resource.
  
For example:

```js
PathRewriter.rewriteAndEmit({
  name: '[path][name]-[hash].html',
  loader: 'jade-html?pretty'
})
```

#### `new PathRewriter(opts | undefined)`

A plugin that emits to the filesystem all resources that were marked with the
`PathRewriter.rewriteAndEmit()` loader. Options:

* `silent` don't print rewritten paths. Defaults to `false`.
* `emitStats` write `stats.json` file. May be string specifying the file's name.
   Defaults to `true`.
* `pathRegExp` regular expression for matching paths. Defaults to `/"\[\[(.*?)\]\]"/`, which tests
  for `"[[...]]"` constructions and captures the string between the braces.
* `pathMatchIndex` the index of capturing group in the `pathRegExp` that corresponds to a path.
  Defaults to `1`.
* `pathReplacer` template for replacing matched path with the rewritten one. Defaults to
  `"[path]"`. May contain following tokens:
    - `[path]` the rewritten path;
    - `[N]` the content of N-th capturing group of `pathRegExp`.
* `includeHash` make compilation's hash dependent on contents of this resource. Useful with live
  reload, as it causes the app to reload each time this resources changes. Defaults to `false`.
