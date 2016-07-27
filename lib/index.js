'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _loaderUtils = require('loader-utils');

var _loaderUtils2 = _interopRequireDefault(_loaderUtils);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var PATH_REGEXP = /"\[\[(.*?)\]\]"/g,
    PATH_MATCH_INDEX = 1,
    PATH_REPLACER = '"[path]"';

var INLINE_REGEXP = /\[\[\s*INLINE\(([^)]*)\)\s*\]\]/g;

var ABS_PATH_REGEXP = /^[/]|^\w+:[/][/]/,
    HASH_REGEXP_SRC = '[\\w\\d_-]+[=]*';

var PathRewriter = function () {
  _createClass(PathRewriter, null, [{
    key: 'rewriteAndEmit',

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
    value: function rewriteAndEmit(rwOpts) {
      var thisLoader = module.filename,
          loader = '';

      if ('string' == typeof rwOpts) {
        return thisLoader + (/^[?!]/.test(rwOpts) ? rwOpts : rwOpts && '!' + rwOpts);
      }

      if (rwOpts.loader != undefined) {
        loader = rwOpts.loader;
      }

      if (rwOpts.loaders != undefined) {
        if (rwOpts.loader != undefined) {
          throw new Error('cannot use both loader and loaders');
        }
        loader = rwOpts.loaders.join('!');
      }

      var query = extend({}, rwOpts, function (key) {
        return key != 'loader' && key != 'loaders';
      });

      if (query.pathRegExp) {
        var re = query.pathRegExp;query.pathRegExp = re instanceof RegExp ? {
          source: re.source,
          flags: (re.ignoreCase ? 'i' : '') + (re.multiline ? 'm' : '')
        } : {
          source: '' + re,
          flags: ''
        };
      }

      if (query.inlineRegExp) {
        var _re = query.inlineRegExp;query.inlineRegExp = _re instanceof RegExp ? {
          source: _re.source,
          flags: (_re.ignoreCase ? 'i' : '') + (_re.multiline ? 'm' : '')
        } : {
          source: '' + _re,
          flags: ''
        };
      }

      // we need to temporarily replace all exclamation marks because they have
      // special meaning in loader strings                     v
      //
      return thisLoader + '?' + JSON.stringify(query).replace(/!/g, ':BANG:') + (/^!/.test(loader) ? loader : loader && '!' + loader);
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

  }]);

  function PathRewriter(opts) {
    _classCallCheck(this, PathRewriter);

    this.opts = extend({
      silent: false,
      emitStats: true,
      includeHash: false,
      pathRegExp: undefined,
      pathReplacer: undefined,
      pathMatchIndex: undefined
    }, opts);
    this.pathRegExp = PathRewriter.makeRegExp(this.opts.pathRegExp) || PATH_REGEXP;
    this.pathMatchIndex = this.opts.pathMatchIndex == undefined ? PATH_MATCH_INDEX : this.opts.pathMatchIndex;
    this.pathReplacer = this.opts.pathReplacer || PATH_REPLACER;
    this.inlineRegExp = PathRewriter.makeRegExp(this.opts.inlineRegExp) || INLINE_REGEXP;
    this.rwPathsCache = {};
    this.modules = [];
    this.modulesByRequest = {};
    this.compilationRwPathsCache = undefined;
    this.compilationAssetsPaths = undefined;
  }

  _createClass(PathRewriter, [{
    key: 'addModule',
    value: function addModule(moduleData) {
      this.modules.push(moduleData);
      this.modulesByRequest[moduleData.request] = moduleData;
    }
  }, {
    key: 'apply',
    value: function apply(compiler) // plugin entry point, called by Webpack
    {
      var _this = this;

      compiler.plugin('compilation', function (compilation) {
        compilation.plugin('normal-module-loader', function (loaderContext, module) {
          if (loaderContext[__dirname]) throw new Error('cannot use more than one instance of PathRewriter in the plugins list');
          loaderContext[__dirname] = _this;
        });
      });
      compiler.plugin('after-compile', function (compilation, callback) {
        _this.onAfterCompile(compilation, callback);
      });
      compiler.plugin('emit', function (compiler, callback) {
        _this.onEmit(compiler, callback);
      });
    }
  }, {
    key: 'onAfterCompile',
    value: function onAfterCompile(compilation, callback) {
      var _this2 = this;

      compilation.modules.forEach(function (module) {
        var moduleData = _this2.modulesByRequest[module.request];
        moduleData && _this2.extractModuleAssetsPublicPaths(moduleData, module);
      });
      callback();
    }
  }, {
    key: 'extractModuleAssetsPublicPaths',
    value: function extractModuleAssetsPublicPaths(moduleData, module) {
      var assetDataByRequest = moduleData.assetDataByRequest,
          deps = module.dependencies;

      for (var i = 0; i < deps.length; ++i) {
        var dep = deps[i];
        if (!dep.request || !dep.module) continue;

        var assetData = assetDataByRequest[dep.request];
        if (assetData == undefined) continue;

        var assets = dep.module.assets && Object.keys(dep.module.assets) || [];
        if (assets.length != 1) {
          var paths = assets.map(function (a) {
            return '"' + a + '"';
          }).join(', ');
          assetData.error = new PathRewriterError('invalid number of assets for path "' + assetData.path + '", assets: [' + paths + ']', moduleData);
          continue;
        }

        assetData.rwPath = assets[0];
      }
    }
  }, {
    key: 'onEmit',
    value: function onEmit(compiler, callback) {
      var _this3 = this;

      var stats = compiler.getStats().toJson();

      this.compilationAssetsPaths = stats.assets.map(function (asset) {
        return asset.name;
      });
      this.compilationRwPathsCache = {};

      this.modules.forEach(function (moduleData) {
        _this3.rewriteModulePaths(moduleData, compiler);
      });

      this.modules = [];
      this.modulesByRequest = {};

      // WARN WTF
      //
      // We need to cache assets from previous compilations in watch mode
      // because, for some reason, some assets don't get included in the
      // assets list after recompilations.
      //
      extend(this.rwPathsCache, this.compilationRwPathsCache);

      if (this.opts.emitStats) {
        var statsJson = JSON.stringify(stats, null, '  '),
            statsPath = typeof this.opts.emitStats == 'string' ? this.opts.emitStats : 'stats.json';
        compiler.assets[statsPath] = {
          source: function source() {
            return statsJson;
          },
          size: function size() {
            return statsJson.length;
          }
        };
      }

      callback();
    }
  }, {
    key: 'rewriteModulePaths',
    value: function rewriteModulePaths(moduleData, compiler) {
      var _this4 = this;

      var content = moduleData.content.replace(moduleData.pathRegExp, function () {
        for (var _len = arguments.length, matches = Array(_len), _key = 0; _key < _len; _key++) {
          matches[_key] = arguments[_key];
        }

        var srcPath = trim(matches[moduleData.pathMatchIndex]);
        try {
          var rwPath = _this4.rewritePath(srcPath, moduleData);
          rwPath = _this4.prependPublicPath(moduleData.publicPath, rwPath);
          _this4.opts.silent || srcPath != rwPath && console.error('PathRewriter[ ' + moduleData.relPath + ' ]: "' + srcPath + '" -> "' + rwPath + '"');
          return moduleData.pathReplacer.replace(/\[(path|\d+)\]/g, function (_, t) {
            return t == 'path' ? rwPath : matches[+t];
          });
        } catch (e) {
          if (!(e instanceof PathRewriterError) && !_this4.opts.silent) {
            console.error(e.stack);
          }
          compiler.errors.push(e);
          return srcPath;
        }
      }).replace(moduleData.inlineRegExp, function (match, assetUrl) {
        var asset = compiler.assets[assetUrl];
        if (!asset) {
          compiler.errors.push(new Error('Cannot inline asset "' + assetUrl + '" in ' + moduleData.relPath + ': not found'));
          return match;
        } else if (!_this4.opts.silent) {
          console.error('PathRewriter[ ' + moduleData.relPath + ' ]: inlined "' + assetUrl + '"');
        }
        return asset.source();
      });
      compiler.assets[moduleData.url] = {
        source: function source() {
          return content;
        },
        size: function size() {
          return content.length;
        }
      };
    }
  }, {
    key: 'rewritePath',
    value: function rewritePath(srcPath, moduleData) {
      var key = moduleData.context + '|' + srcPath,
          rwPath = this.compilationRwPathsCache[key];

      if (rwPath) return rwPath;

      var assetData = moduleData.assetDataByPath[srcPath];
      if (assetData) {
        if (assetData.error) throw assetData.error;
        rwPath = assetData.rwPath;
      } else {
        rwPath = this.rewriteGeneratedAssetPath(srcPath, moduleData);
      }

      if (rwPath == undefined) {
        // in watch mode, sometimes some assets are not listed during
        // recompilations, so we need to use a long-term cache
        rwPath = this.rwPathsCache[key];
      }

      if (rwPath == undefined || rwPath.length == 0) {
        throw new PathRewriterError('could not resolve path "' + srcPath + '"', moduleData);
      }

      this.compilationRwPathsCache[key] = rwPath;
      return rwPath;
    }
  }, {
    key: 'rewriteGeneratedAssetPath',
    value: function rewriteGeneratedAssetPath(srcPath, moduleData) {
      if (ABS_PATH_REGEXP.test(srcPath)) return srcPath;

      var searchRE;

      if (/^\^.+\$$/.test(srcPath)) {
        searchRE = new RegExp(srcPath);
      } else {
        var parts = srcPath.split(/[*]+/);

        if (parts.join('').length == 0) {
          throw new PathRewriterError('invalid wildcard path "' + srcPath + '", must contain at least one non-wildcard symbol', moduleData);
        }

        searchRE = new RegExp('^' + parts.map(escapeRegExp).join(HASH_REGEXP_SRC) + '$');
      }

      for (var i = 0; i < this.compilationAssetsPaths.length; ++i) {
        var rwPath = this.compilationAssetsPaths[i];
        if (searchRE.test(rwPath)) {
          return rwPath;
        }
      }

      return undefined;
    }
  }, {
    key: 'prependPublicPath',
    value: function prependPublicPath(publicPath, path) {
      return ABS_PATH_REGEXP.test(path) ? path : publicPath + path;
    }
  }], [{
    key: 'loader',
    value: function loader(content) // loader entry point, called by Webpack; see PathRewriterEntry
    {
      this.cacheable && this.cacheable();

      var rewriter = this[__dirname];
      if (rewriter == undefined) {
        throw new Error('webpack-path-rewriter loader is used without the corresponding plugin;\n  ' + 'add `new PathRewriter()` to the list of plugins in the Webpack config');
      }

      var query = _loaderUtils2.default.parseQuery(this.query && this.query.replace(/:BANG:/g, '!')),
          topLevelContext = this.options.context,
          publicPath = query.publicPath || this.options.output.publicPath || '';

      if (publicPath.length && publicPath[publicPath.length - 1] != '/') {
        publicPath = publicPath + '/';
      }

      var url = _loaderUtils2.default.interpolateName(this, query.name || '[path][name].[ext]', {
        content: content,
        context: query.context || topLevelContext,
        regExp: query.nameRegExp
      });

      var moduleData = { url: url, content: content, publicPath: publicPath, topLevelContext: topLevelContext,
        request: this.request,
        context: this.context,
        relPath: _path2.default.relative(topLevelContext, this.resourcePath),
        pathRegExp: PathRewriter.makeRegExp(query.pathRegExp) || rewriter.pathRegExp,
        pathReplacer: query.pathReplacer || rewriter.pathReplacer,
        pathMatchIndex: +(query.pathMatchIndex == undefined ? rewriter.pathMatchIndex : query.pathMatchIndex),
        inlineRegExp: PathRewriter.makeRegExp(query.inlineRegExp) || rewriter.inlineRegExp
      };

      var exportStatement = 'module.exports = "' + publicPath + url + (rewriter.opts.includeHash ? '" // content hash: ' + _loaderUtils2.default.interpolateName(this, '[hash]', { content: content }) : '"');

      var callback = this.async();PathRewriter.extractAssets(this, moduleData, function (assetRequests) {
        rewriter.addModule(moduleData);

        callback(null, assetRequests.map(function (req) {
          return 'require(' + JSON.stringify(req) + ')';
        }).join('\n') + '\n' + exportStatement);
      });
    }
  }, {
    key: 'makeRegExp',
    value: function makeRegExp(desc) {
      if (desc == undefined) {
        return undefined;
      }
      if (desc instanceof RegExp) {
        return new RegExp(desc.source, 'g' + (desc.ignoreCase ? 'i' : '') + (desc.multiline ? 'm' : ''));
      }
      var src = desc.source || '' + desc,
          flags = desc.flags || 'g';
      return new RegExp(src, flags.indexOf('g') == -1 ? flags + 'g' : flags);
    }
  }, {
    key: 'extractAssets',
    value: function extractAssets(loaderCtx, moduleData, cb) {
      var paths = PathRewriter.findNonWildcardPaths(moduleData),
          numPaths = paths.length,
          numPathsDone = 0,
          assetsData = [];
      if (paths.length == 0) {
        return done(assetsData);
      }
      paths.forEach(function (path) {
        var request = _loaderUtils2.default.urlToRequest(path);
        // we need to discard all possibly generated assets, i.e. those
        // that are not present in the source tree, because we cannot
        // require them
        loaderCtx.resolve(moduleData.context, request, function (err, _) {
          if (err == null) {
            assetsData.push({ path: path, request: request, rwPath: undefined });
          }
          if (++numPathsDone == numPaths) {
            done(assetsData);
          }
        });
      });
      function done(assetsData) {
        var byPath = {},
            byRequest = {};
        assetsData.forEach(function (data) {
          byRequest[data.request] = data;
          byPath[data.path] = data;
        });
        moduleData.assetDataByPath = byPath;
        moduleData.assetDataByRequest = byRequest;
        cb(assetsData.map(function (data) {
          return data.request;
        }));
      }
    }
  }, {
    key: 'findNonWildcardPaths',
    value: function findNonWildcardPaths(_ref) {
      var content = _ref.content;
      var pathRegExp = _ref.pathRegExp;
      var pathMatchIndex = _ref.pathMatchIndex;

      var results = [],
          matches;
      while (matches = pathRegExp.exec(content)) {
        var path = trim(matches[pathMatchIndex]);
        if (path && path.indexOf('*') == -1 && results.indexOf(path) == -1 && _loaderUtils2.default.isUrlRequest(path)) {
          results.push(path);
        }
      }
      pathRegExp.lastIndex = 0;
      return results;
    }
  }]);

  return PathRewriter;
}();

function trim(s) {
  return s && s.replace(/^\s+|\s+$/g, '');
}

function escapeRegExp(s) {
  return s && s.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
}

function extend(dst, src, filter) {
  if (src) Object.keys(src).forEach(filter == undefined ? function (key) {
    dst[key] = src[key];
  } : function (key) {
    if (filter(key)) {
      dst[key] = src[key];
    }
  });
  return dst;
}

function PathRewriterError(msg, moduleData) {
  Error.call(this);
  Error.captureStackTrace(this, PathRewriterError);
  this.name = 'PathRewriterError';
  this.message = moduleData.relPath + ': ' + msg;
}
PathRewriterError.prototype = Object.create(Error.prototype);

function PathRewriterEntry(arg) {
  return this instanceof PathRewriterEntry ? new PathRewriter(arg) // called with new => plugin
  : PathRewriter.loader.call(this, arg); // called as a funtion => loader
}
PathRewriterEntry.rewriteAndEmit = PathRewriter.rewriteAndEmit;

module.exports = PathRewriterEntry;
exports.default = PathRewriterEntry;