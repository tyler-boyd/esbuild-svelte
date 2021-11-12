var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __require = typeof require !== "undefined" ? require : (x) => {
  throw new Error('Dynamic require of "' + x + '" is not supported');
};
const { preprocess, compile } = require("svelte/compiler");
const { dirname, relative } = require("path");
const { promisify } = require("util");
const { readFile, statSync } = require("fs");
const convertMessage = ({ message, start, end, filename, frame }) => ({
  text: message,
  location: start && end && {
    file: filename,
    line: start.line,
    column: start.column,
    length: start.line === end.line ? end.column - start.column : 0,
    lineText: frame
  }
});
const SVELTE_FILTER = /\.svelte$/;
const FAKE_CSS_FILTER = /\.esbuild-svelte-fake-css$/;
function sveltePlugin(options) {
  var _a;
  const svelteFilter = (_a = options == null ? void 0 : options.include) != null ? _a : SVELTE_FILTER;
  return {
    name: "esbuild-svelte",
    setup(build) {
      if (!options) {
        options = {};
      }
      if (options.cache == void 0 && (build.initialOptions.incremental || build.initialOptions.watch)) {
        options.cache = true;
      }
      if (options.fromEntryFile == void 0) {
        options.fromEntryFile = false;
      }
      const cssCode = new Map();
      const fileCache = new Map();
      build.onLoad({ filter: svelteFilter }, async (args) => {
        var _a2;
        if ((options == null ? void 0 : options.cache) === true && fileCache.has(args.path)) {
          const cachedFile = fileCache.get(args.path) || {
            dependencies: new Map(),
            data: null
          };
          let cacheValid = true;
          try {
            cachedFile.dependencies.forEach((time, path) => {
              if (statSync(path).mtime > time) {
                cacheValid = false;
              }
            });
          } catch {
            cacheValid = false;
          }
          if (cacheValid) {
            return cachedFile.data;
          } else {
            fileCache.delete(args.path);
          }
        }
        let source = await promisify(readFile)(args.path, "utf8");
        let filename = relative(process.cwd(), args.path);
        const dependencyModifcationTimes = new Map();
        dependencyModifcationTimes.set(args.path, statSync(args.path).mtime);
        try {
          if (options == null ? void 0 : options.preprocess) {
            let preprocessResult = await preprocess(source, options.preprocess, {
              filename
            });
            source = preprocessResult.code;
            if ((options == null ? void 0 : options.cache) === true) {
              (_a2 = preprocessResult.dependencies) == null ? void 0 : _a2.forEach((entry) => {
                dependencyModifcationTimes.set(entry, statSync(entry).mtime);
              });
            }
          }
          let compilerOptions = __spreadValues({ css: false }, options == null ? void 0 : options.compilerOptions);
          let { js, css, warnings } = compile(source, __spreadProps(__spreadValues({}, compilerOptions), { filename }));
          let contents = js.code + `
//# sourceMappingURL=` + js.map.toUrl();
          if (!compilerOptions.css && css.code) {
            let cssPath = args.path.replace(".svelte", ".esbuild-svelte-fake-css").replace(/\\/g, "/");
            cssCode.set(cssPath, css.code + `/*# sourceMappingURL=${css.map.toUrl()} */`);
            contents = contents + `
import "${cssPath}";`;
          }
          const result = {
            contents,
            warnings: warnings.map(convertMessage)
          };
          if ((options == null ? void 0 : options.cache) === true) {
            fileCache.set(args.path, {
              data: result,
              dependencies: dependencyModifcationTimes
            });
          }
          if (build.initialOptions.watch) {
            result.watchFiles = Array.from(dependencyModifcationTimes.keys());
          }
          return result;
        } catch (e) {
          return { errors: [convertMessage(e)] };
        }
      });
      build.onResolve({ filter: FAKE_CSS_FILTER }, ({ path }) => {
        return { path, namespace: "fakecss" };
      });
      build.onLoad({ filter: FAKE_CSS_FILTER, namespace: "fakecss" }, ({ path }) => {
        const css = cssCode.get(path);
        return css ? { contents: css, loader: "css", resolveDir: dirname(path) } : null;
      });
    }
  };
}
module.exports = sveltePlugin;
