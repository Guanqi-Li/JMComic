const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require(process.env.TS_COMPILER || 'typescript');
const root = path.resolve(__dirname, '../JMComic');
function loader(globals = {}, native = {}, overrides = {}) {
  const cache = new Map();
  const context = vm.createContext({ Date, Promise, Error, console, setTimeout, clearTimeout, ...globals });
  function load(name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    const base = path.resolve(root, name), file = ['.ts', '.tsx'].map(ext => base + ext).find(file => fs.existsSync(file));
    if (!file) throw new Error(`Missing module: ${name}`);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
    vm.runInContext('(function(require,module,exports){' + js + '})', context)(
      id => id === 'scripting' ? native : load(path.relative(root, path.resolve(path.dirname(file), id))), module, module.exports);
    return module.exports;
  }
  return load;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
function ui(name, exported, props, overrides = {}) {
  const slots = [], effects = [], presentations = [], timers = [];
  let cursor = 0, disposed = false, writesAfterClose = 0;
  const native = new Proxy({
    useObservable: value => {
      const index = cursor++;
      return slots[index] || (slots[index] = { value: typeof value === 'function' ? value() : value,
        setValue(next) { if (disposed) writesAfterClose++; this.value = next; } });
    },
    useRef: value => { const index = cursor++; return slots[index] || (slots[index] = { current: value }); },
    useEffect: (fn, deps) => {
      const index = cursor++, previous = slots[index];
      if (!previous || !deps || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup?.(); slots[index] = { deps }; effects.push(() => { slots[index].cleanup = fn(); });
      }
    },
    Navigation: { useDismiss: () => () => {}, present: async options => { presentations.push(options.element); } },
    Script: { supportsMinimization: () => false },
  }, { get: (obj, key) => key in obj ? obj[key] : String(key) });
  const load = loader({
    React: { Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) },
    Dialog: { alert: async () => {} },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {},
  }, native, overrides);
  const Component = load(name)[exported];
  const render = (next = {}) => { Object.assign(props, next); cursor = 0; return Component(props); };
  function walk(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...(node.children || []).flatMap(walk), ...walk(node.props?.header)];
  }
  return { render, nodes: () => walk(render()), effects: () => { for (const fn of effects.splice(0)) fn(); },
    close: () => { for (const slot of slots) slot?.cleanup?.(); disposed = true; },
    presentations, timers, get writesAfterClose() { return writesAfterClose; } };
}
module.exports = { loader, deferred, settle, ui };
