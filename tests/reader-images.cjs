const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require(process.env.TS_COMPILER || 'typescript');
const file = path.resolve(__dirname, '../JMComic/features/reader/deferred-page-image.tsx');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
function fixture({ cachedPath, loadPage, exists = () => true }) {
  const slots = [], effects = [], timers = [], cleanups = [];
  let cursor = 0, notifications = 0, measurements = 0;
  const native = new Proxy({
    useObservable: value => { const i = cursor++; return slots[i] || (slots[i] = { value, setValue(value) { this.value = value; } }); },
    useRef: value => { const i = cursor++; return slots[i] || (slots[i] = { current: value }); },
    useEffect: fn => { const i = cursor++; if (!slots[i]) { slots[i] = true; effects.push(fn); } },
  }, { get: (obj, key) => key in obj ? obj[key] : String(key) });
  const context = {
    FileManager: { existsSync: exists },
    UIImage: { fromFile: () => { measurements++; return { width: 1000, height: 2000 }; } },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => { timers[id - 1] = null; },
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) },
  };
  const module = { exports: {} };
  vm.runInNewContext('(function(require,module,exports){' + js + '})', context)(
    id => id === 'scripting' ? native : { withPageLoadSlot: fn => fn() }, module, module.exports);
  const props = { item: { id: 'page', index: 0 }, frame: { maxWidth: 'infinity' },
    viewport: { width: 390, height: 844 }, cachedPath, loadPage, onLoaded: () => { notifications++; } };
  const render = () => { cursor = 0; return module.exports.DeferredPageImage(props); };
  render(); for (const effect of effects.splice(0)) cleanups.push(effect());
  return { render, props, flush: () => { for (const timer of timers.splice(0)) if (timer) timer(); },
    close: () => { for (const cleanup of cleanups) cleanup(); },
    get notifications() { return notifications; }, get measurements() { return measurements; } };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
(async () => {
  let downloads = 0;
  const cached = fixture({ cachedPath: '/cached.png', loadPage: async () => { downloads++; return '/cached.png'; } });
  let view = cached.render();
  assert.equal(view.props.frame.height, 780); assert.equal(view.children[0].type, 'Image');
  assert.equal(view.children[0].props.frame.height, 780);
  view.props.onAppear(); view.props.onAppear(); cached.flush();
  assert.equal(downloads, 0); assert.equal(cached.notifications, 1);
  assert.equal(cached.render().props.frame.height, 780); assert.equal(cached.measurements, 1);
  cached.props.viewport = { width: 844, height: 390 };
  assert.equal(cached.render().props.frame.height, 1688); assert.equal(cached.measurements, 1);
  console.log('PASS prefetched image has its real height on first render, cached layout survives rerenders and rotation, no repeat loading');

  let release;
  const slow = fixture({ loadPage: () => new Promise(resolve => { release = resolve; }) });
  view = slow.render(); assert.equal(view.props.frame.height, 844);
  view.props.onAppear(); assert.equal(slow.render().props.frame.height, 844);
  release('/slow.png'); await settle();
  view = slow.render(); assert.equal(view.props.frame.height, 780); assert.equal(view.children[0].type, 'Image');
  slow.flush(); assert.equal(slow.notifications, 1);
  console.log('PASS slow image reserves a full viewport instead of a tiny placeholder and resolves to exact aspect ratio');

  let attempts = 0;
  const retry = fixture({ loadPage: async () => { if (++attempts === 1) throw new Error('network'); return '/retry.png'; } });
  retry.render().props.onAppear(); await settle();
  view = retry.render(); assert.equal(view.props.frame.height, 844);
  const button = view.children[0].children.find(node => node.type === 'Button'); assert(button);
  button.props.action(); await settle(); retry.flush();
  assert.equal(retry.render().props.frame.height, 780); assert.equal(retry.notifications, 1);
  const closed = fixture({ loadPage: () => new Promise(resolve => { release = resolve; }) });
  closed.render().props.onAppear(); closed.close(); release('/late.png'); await settle(); closed.flush();
  assert.equal(closed.notifications, 0);
  let invalidated = 0;
  const broken = fixture({ cachedPath: '/broken.png', loadPage: async () => '/repaired.png' });
  broken.props.onInvalidate = () => { invalidated++; };
  broken.render().props.onAppear(); broken.render().children[0].props.onError(); broken.flush();
  assert.equal(invalidated, 1); assert.equal(broken.notifications, 0);
  const evicted = fixture({ cachedPath: '/evicted.png', exists: path => path !== '/evicted.png', loadPage: async () => '/restored.png' });
  evicted.render().props.onAppear(); await settle(); evicted.flush();
  assert.equal(evicted.render().children[0].props.filePath, '/restored.png'); assert.equal(evicted.notifications, 1);
  console.log('PASS failed image retries, bad cache invalidation, cancelled ready callbacks and unmounted images cannot report false progress');
})().catch(error => { console.error(error); process.exitCode = 1; });
