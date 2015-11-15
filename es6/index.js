import loaderUtils from 'loader-utils'
import path from 'path'


const PATH_REGEXP = /"\[\[(.*?)\]\]"/g,
      PATH_MATCH_INDEX = 1,
      PATH_REPLACER = '"[path]"'

const INLINE_REGEXP = /\[\[\s*INLINE\(([^)]*)\)\s*\]\]/g

const ABS_PATH_REGEXP = /^[/]|^\w+:[/][/]/,
      HASH_REGEXP_SRC = '[\\w\\d_-]+[=]*'


class PathRewriter
{
  /**
   * Marks a resource for rewriting paths and emitting to the file system.
   * Use it in conjunction with the `new PathRewriter()` plugin.
   * 
   * The `opts` argument is either string or object. If string, it specifies
   * the resource's loader string along with the options, e.g.
   *
   *   PathRewriter.rewriteAndEmit('?name=[path][name]-[hash].[ext]')
   *   PathRewriter.rewriteAndEmit('jade-html?pretty')
   *   PathRewriter.rewriteAndEmit('?name=[path][name].[ext]!jade-html?pretty')
   *
   * Object form allows to specify the following options:
   *
   * - loader: the resource's loader string.
   *
   * - loaders: the array of loaders; mutually exclusive with the `loader` option.
   *
   * - name: the path to the output file, may contain the following tokens:
   *
   *   - [ext] the extension of the resource;
   *   - [name] the basename of the resource;
   *   - [path] the path of the resource relative to the `context` option;
   *   - [hash] the hash of the resource's content;
   *   - [<hashType>:hash:<digestType>:<length>]
   *     see https://github.com/webpack/loader-utils#interpolatename;
   *   - [N] content of N-th capturing group obtained from matching
   *     the resource's path against the `nameRegExp` option.
   *
   *   Defaults to '[path][name].[ext]'.
   *
   * - nameRegExp, context: see `name`.
   *
   * - publicPath: allows to override the global output.publicPath setting.
   *
   * - pathRegExp, pathMatchIndex, pathReplacer: allow to override options for
   *   rewriting paths in this resource. See documentation for the constructor.
   *
   * Example:
   *
   *   PathRewriter.rewriteAndEmit({
   *     name: '[path][name]-[hash].html',
   *     loader: 'jade-html?pretty'
   *   })
   */
  static rewriteAndEmit(rwOpts)
  {
    var thisLoader = module.filename,
        loader = ''
    
    if ('string' == typeof rwOpts) {
      return thisLoader + (/^[?!]/.test(rwOpts)
        ? rwOpts
        : rwOpts && '!' + rwOpts
      )
    }

    if (rwOpts.loader != undefined) {
      loader = rwOpts.loader
    }
    
    if (rwOpts.loaders != undefined) {
      if (rwOpts.loader != undefined) {
        throw new Error('cannot use both loader and loaders')
      }
      loader = rwOpts.loaders.join('!')
    }

    var query = extend({}, rwOpts, (key) => key != 'loader' && key != 'loaders')

    if (query.pathRegExp) {
      let re = query.pathRegExp; query.pathRegExp = re instanceof RegExp ? {
        source: re.source,
        flags: (re.ignoreCase ? 'i' : '') + (re.multiline ? 'm' : '')
      } : {
        source: '' + re,
        flags: ''
      }
    }

    if (query.inlineRegExp) {
      let re = query.inlineRegExp; query.inlineRegExp = re instanceof RegExp ? {
        source: re.source,
        flags: (re.ignoreCase ? 'i' : '') + (re.multiline ? 'm' : '')
      } : {
        source: '' + re,
        flags: ''
      }
    }

    // we need to temporarily replace all exclamation marks because they have
    // special meaning in loader strings                     v
    //
    return thisLoader + '?' + JSON.stringify(query).replace(/!/g, ':BANG:') + (/^!/.test(loader)
      ? loader
      : loader && '!' + loader
    )
  }


  /**
   * A plugin that emits to the filesystem all resources that are marked
   * with `PathRewriter.rewriteAndEmit()` loader.
   *
   * Options:
   *
   * - silent: don't print rewritten paths. Defaults to false.
   *
   * - emitStats: write stats.json file. May be string specifying
   *   the file's name. Defaults to true.
   *
   * - pathRegExp: regular expression for matching paths. Defaults
   *   to /"\[\[(.*?)\]\]"/, which tests for \"[[...]]\" constructions,
   *   capturing the string between the braces.
   *
   * - pathMatchIndex: the index of capturing group in the pathRegExp
   *   that corresponds to a path.
   *
   * - pathReplacer: template for replacing matched path with the
   *   rewritten one. May contain following tokens:
   *   - [path] the rewritten path;
   *   - [N] the content of N-th capturing group of pathRegExp.
   *   Defaults to \"[path]\".
   *
   * - includeHash: make compilation's hash dependent on contents
   *   of this resource. Useful with live reload, as it causes the app
   *   to reload each time this resources changes. Defaults to false.
   */
  constructor(opts)
  {
    this.opts = extend({
      silent: false,
      emitStats: true,
      includeHash: false,
      pathRegExp: undefined,
      pathReplacer: undefined,
      pathMatchIndex: undefined
    }, opts)
    this.pathRegExp = PathRewriter.makeRegExp(this.opts.pathRegExp) || PATH_REGEXP
    this.pathMatchIndex = this.opts.pathMatchIndex == undefined
      ? PATH_MATCH_INDEX
      : this.opts.pathMatchIndex
    this.pathReplacer = this.opts.pathReplacer || PATH_REPLACER
    this.inlineRegExp = PathRewriter.makeRegExp(this.opts.inlineRegExp) || INLINE_REGEXP
    this.rwPathsCache = {}
    this.modules = []
    this.modulesByRequest = {}
    this.compilationRwPathsCache = undefined
    this.compilationAssetsPaths = undefined
  }


  static loader(content) // loader entry point, called by Webpack; see PathRewriterEntry
  {
    this.cacheable && this.cacheable()

    var rewriter = this[ __dirname ]
    if (rewriter == undefined) {
      throw new Error(
        'webpack-path-rewriter loader is used without the corresponding plugin;\n  ' +
        'add `new PathRewriter()` to the list of plugins in the Webpack config'
      )
    }

    var query = loaderUtils.parseQuery(this.query && this.query.replace(/:BANG:/g, '!')),
        topLevelContext = this.options.context,
        publicPath = query.publicPath || this.options.output.publicPath || ''

    if (publicPath.length && publicPath[ publicPath.length - 1 ] != '/') {
      publicPath = publicPath + '/'
    }

    var url = loaderUtils.interpolateName(this, query.name || '[path][name].[ext]', {
      content: content,
      context: query.context || topLevelContext,
      regExp: query.nameRegExp
    })

    var moduleData = {url, content, publicPath, topLevelContext,
      request: this.request,
      context: this.context,
      relPath: path.relative(topLevelContext, this.resourcePath),
      pathRegExp: PathRewriter.makeRegExp(query.pathRegExp) || rewriter.pathRegExp,
      pathReplacer: query.pathReplacer || rewriter.pathReplacer,
      pathMatchIndex: +(query.pathMatchIndex == undefined
        ? rewriter.pathMatchIndex
        : query.pathMatchIndex
      ),
      inlineRegExp: PathRewriter.makeRegExp(query.inlineRegExp) || rewriter.inlineRegExp
    }

    var exportStatement = 'module.exports = "' + publicPath + url + (rewriter.opts.includeHash
      ? '" // content hash: ' + loaderUtils.interpolateName(this, '[hash]', { content })
      : '"'
    )

    var callback = this.async(); PathRewriter.extractAssets(this, moduleData, assetRequests =>
    {
      rewriter.addModule(moduleData)

      callback(null, assetRequests
        .map(req => `require(${ JSON.stringify(req) })`)
        .join('\n') + '\n' + exportStatement
      )
    })
  }


  static makeRegExp(desc)
  {
    if (desc == undefined) {
      return undefined
    }
    if (desc instanceof RegExp) {
      return new RegExp(desc.source, 'g'
        + (desc.ignoreCase ? 'i' : '')
        + (desc.multiline ? 'm' : '')
      )
    }
    var src = desc.source || '' + desc,
        flags = desc.flags || 'g'
    return new RegExp(src, flags.indexOf('g') == -1
      ? flags + 'g'
      : flags
    )
  }


  static extractAssets(loaderCtx, moduleData, cb)
  {
    var paths = PathRewriter.findNonWildcardPaths(moduleData),
        numPaths = paths.length,
        numPathsDone = 0,
        assetsData = []
    if (paths.length == 0) {
      return done(assetsData)
    }
    paths.forEach(path => {
      var request = loaderUtils.urlToRequest(path)
      // we need to discard all possibly generated assets, i.e. those
      // that are not present in the source tree, because we cannot
      // require them
      loaderCtx.resolve(moduleData.context, request, (err, _) => {
        if (err == null) {
          assetsData.push({ path, request, rwPath: undefined })
        }
        if (++numPathsDone == numPaths) {
          done(assetsData)
        }
      })
    })
    function done(assetsData) {
      var byPath = {}, byRequest = {}
      assetsData.forEach(data => {
        byRequest[ data.request ] = data
        byPath[ data.path ] = data
      })
      moduleData.assetDataByPath = byPath
      moduleData.assetDataByRequest = byRequest
      cb(assetsData.map(data => data.request))
    }
  }


  static findNonWildcardPaths({ content, pathRegExp, pathMatchIndex })
  {
    var results = [],
        matches
    while (matches = pathRegExp.exec(content)) {
      var path = trim(matches[ pathMatchIndex ])
      if (path
       && path.indexOf('*') == -1
       && results.indexOf(path) == -1
       && loaderUtils.isUrlRequest(path)
      ){
        results.push(path)
      }
    }
    pathRegExp.lastIndex = 0
    return results
  }


  addModule(moduleData)
  {
    this.modules.push(moduleData)
    this.modulesByRequest[ moduleData.request ] = moduleData
  }


  apply(compiler) // plugin entry point, called by Webpack
  {
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('normal-module-loader', (loaderContext, module) => {
        if (loaderContext[ __dirname ])
          throw new Error('cannot use more than one instance of PathRewriter in the plugins list')
        loaderContext[ __dirname ] = this
      })
    })
    compiler.plugin('after-compile', (compilation, callback) => {
      this.onAfterCompile(compilation, callback)
    })
    compiler.plugin('emit', (compiler, callback) => {
      this.onEmit(compiler, callback)
    })
  }


  onAfterCompile(compilation, callback)
  {
    compilation.modules.forEach(module => {
      var moduleData = this.modulesByRequest[ module.request ]
      moduleData && this.extractModuleAssetsPublicPaths(moduleData, module)
    })
    callback()
  }


  extractModuleAssetsPublicPaths(moduleData, module)
  {
    var assetDataByRequest = moduleData.assetDataByRequest,
        deps = module.dependencies

    for (var i = 0; i < deps.length; ++i) {
      var dep = deps[i]
      if (!dep.request || !dep.module) continue

      var assetData = assetDataByRequest[ dep.request ]
      if (assetData == undefined) continue

      var assets = dep.module.assets && Object.keys(dep.module.assets) || []
      if (assets.length != 1) {
        let paths = assets.map(a => `"${a}"`).join(', ')
        assetData.error = new PathRewriterError(
          `invalid number of assets for path "${ assetData.path }", assets: [${ paths }]`,
          moduleData
        )
        continue
      }

      assetData.rwPath = assets[0]
    }
  }


  onEmit(compiler, callback)
  {
    var stats = compiler.getStats().toJson()
    
    this.compilationAssetsPaths = stats.assets.map(asset => asset.name)
    this.compilationRwPathsCache = {}

    this.modules.forEach(moduleData => {
      this.rewriteModulePaths(moduleData, compiler)
    })
    
    this.modules = []
    this.modulesByRequest = {}

    // WARN WTF
    //
    // We need to cache assets from previous compilations in watch mode
    // because, for some reason, some assets don't get included in the
    // assets list after recompilations.
    //
    extend(this.rwPathsCache, this.compilationRwPathsCache)

    if (this.opts.emitStats) {
      var statsJson = JSON.stringify(stats, null, '  '),
          statsPath = typeof this.opts.emitStats == 'string'
            ? this.opts.emitStats
            : 'stats.json'
      compiler.assets[ statsPath ] = {
        source: () => statsJson,
        size: () => statsJson.length
      }
    }

    callback()
  }


  rewriteModulePaths(moduleData, compiler)
  {
    var content = moduleData.content.replace(moduleData.pathRegExp, (...matches) => {
      var srcPath = trim(matches[ moduleData.pathMatchIndex ])
      try {
        var rwPath = this.rewritePath(srcPath, moduleData)
        rwPath = this.prependPublicPath(moduleData.publicPath, rwPath)
        this.opts.silent || (srcPath != rwPath) && console.log(
          `PathRewriter[ ${ moduleData.relPath } ]: "${ srcPath }" -> "${ rwPath }"`
        )
        return moduleData.pathReplacer.replace(/\[(path|\d+)\]/g, (_, t) => {
          return t == 'path' ? rwPath : matches[ +t ]
        })
      }
      catch(e) {
        if (!(e instanceof PathRewriterError) && !this.opts.silent) {
          console.error(e.stack)
        }
        compiler.errors.push(e)
        return srcPath
      }
    }).replace(moduleData.inlineRegExp, (match, assetUrl) => {
      let asset = compiler.assets[ assetUrl ]
      if (!asset) {
        compiler.errors.push(new Error(
          `Cannot inline asset "${ assetUrl }" in ${ moduleData.relPath }: not found`
        ))
        return match
      }
      else if (!this.opts.silent) {
        console.log(`PathRewriter[ ${ moduleData.relPath } ]: inlined "${ assetUrl }"`)
      }
      return asset.source()
    })
    compiler.assets[ moduleData.url ] = {
      source: () => content,
      size: () => content.length
    }
  }


  rewritePath(srcPath, moduleData)
  {
    var key = moduleData.context + '|' + srcPath,
        rwPath = this.compilationRwPathsCache[ key ]

    if (rwPath)
      return rwPath

    var assetData = moduleData.assetDataByPath[ srcPath ]
    if (assetData) {
      if (assetData.error)
        throw assetData.error
      rwPath = assetData.rwPath
    }
    else {
      rwPath = this.rewriteGeneratedAssetPath(srcPath, moduleData)
    }

    if (rwPath == undefined) {
      // in watch mode, sometimes some assets are not listed during
      // recompilations, so we need to use a long-term cache
      rwPath = this.rwPathsCache[ key ]
    }

    if (rwPath == undefined || rwPath.length == 0) {
      throw new PathRewriterError(`could not resolve path "${ srcPath }"`, moduleData)
    }

    this.compilationRwPathsCache[ key ] = rwPath
    return rwPath
  }


  rewriteGeneratedAssetPath(srcPath, moduleData)
  {
    if (ABS_PATH_REGEXP.test(srcPath))
      return srcPath

    var parts = srcPath.split(/[*]+/)

    if (parts.join('').length == 0) {
      throw new PathRewriterError(
        `invalid wildcard path "${ srcPath }", must contain at least one non-wildcard symbol`,
        moduleData
      )
    }

    var searchRE = new RegExp('^' + parts.map(escapeRegExp).join(HASH_REGEXP_SRC) + '$')

    for (var i = 0; i < this.compilationAssetsPaths.length; ++i) {
      var rwPath = this.compilationAssetsPaths[i]
      if (searchRE.test(rwPath)) {
        return rwPath
      }
    }

    return undefined
  }


  prependPublicPath(publicPath, path)
  {
    return ABS_PATH_REGEXP.test(path)
      ? path
      : publicPath + path
  }
}


function trim(s) {
  return s && s.replace(/^\s+|\s+$/g, '')
}


function escapeRegExp(s) {
  return s && s.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')
}


function extend(dst, src, filter) {
  if (src) Object.keys(src).forEach(filter == undefined
    ? key => { dst[ key ] = src[ key ] }
    : key => {
      if (filter(key)) {
        dst[ key ] = src[ key ]
      }
    }
  )
  return dst
}


function PathRewriterError(msg, moduleData)
{
  Error.call(this)
  Error.captureStackTrace(this, PathRewriterError)
  this.name = 'PathRewriterError'
  this.message = moduleData.relPath + ': ' + msg
}
PathRewriterError.prototype = Object.create(Error.prototype)


function PathRewriterEntry(arg)
{
  return this instanceof PathRewriterEntry
    ? new PathRewriter(arg) // called with new => plugin
    : PathRewriter.loader.call(this, arg) // called as a funtion => loader
}
PathRewriterEntry.rewriteAndEmit = PathRewriter.rewriteAndEmit


module.exports = PathRewriterEntry
export default PathRewriterEntry
