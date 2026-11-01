const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require(process.env.TS_COMPILER || 'typescript');
const root = path.resolve(__dirname, '../JMComic');
function evaluate(file, requireMock, context = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext('(function(require,module,exports){' + js + '})', context)(requireMock, module, module.exports);
  return module.exports;
}
const { getOnlineContinueChapter } = evaluate('online-progress.ts', () => ({}));
const chapters = [3, 2, 1].map(order => ({ id: String(order), order, title: `Chapter ${order}`, updatedAt: '' }));
const unread = { lastPage: 0, totalPages: 0, lastReadAt: 0 };
async function detailCase(list, progress = {}) {
  const slots = [], effects = [], opened = [];
  let cursor = 0;
  const native = new Proxy({
    useObservable: value => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value, setValue(next) { this.value = next; } };
      return slots[i];
    },
    useRef: value => { const i = cursor++; return slots[i] || (slots[i] = { current: value }); },
    useEffect: fn => { const i = cursor++; if (!slots[i]) { slots[i] = true; effects.push(fn); } },
    Navigation: { useDismiss: () => () => {} },
    Script: { supportsMinimization: () => false },
  }, { get: (obj, key) => key in obj ? obj[key] : String(key) });
  const content = () => {};
  const { OnlineComicDetailView } = evaluate('online-comic-detail-view.tsx', id => {
    if (id === 'scripting') return native;
    if (id === './async-utils') return { mapWithConcurrency: (items, _limit, fn) => Promise.all(items.map(fn)) };
    if (id === './design-v3/comic-detail-content') return { V3ComicDetailContent: content };
    return {};
  }, { React: { createElement: (type, props, ...children) => ({ type, props, children }) } });
  const getProgress = identity => {
    assert.equal(identity.sourceId, 'zh.jmcomic'); assert.equal(identity.comicId, '42');
    return progress[identity.chapterId] || unread;
  };
  const props = {
    auth: { host: 'go2778' }, comicId: '42',
    adapter: {
      descriptor: () => ({ id: 'zh.jmcomic' }),
      getMangaDetails: async () => ({ title: 'Mock', thumb: {} }),
      getChapterList: async () => list,
      getPageList: async () => [{ id: 'page', localFilePath: '/page.jpg' }],
    },
    getContinueChapter: (sourceId, comicId, items) => getOnlineContinueChapter(sourceId, comicId, items, { getOnlineChapterProgress: getProgress }),
    getOnlineChapterProgress: getProgress,
    getOnlineChapterProgressLabel: identity => `${getProgress(identity).lastPage + 1}/${getProgress(identity).totalPages} 页`,
    normalizeOnlineThumbUrl: () => '', getOnlineComicBlockedKeywordHits: () => [],
    buildOnlineReaderProgressKey: identity => identity.chapterId,
    formatRelativeTime: () => '最近阅读',
    renderReaderView: params => { opened.push(params); return null; },
    presentReaderFullScreen: async () => {},
    dialog: { alert: async error => { throw new Error(JSON.stringify(error)); } },
  };
  const render = () => { cursor = 0; return OnlineComicDetailView(props); };
  render();
  for (const effect of effects) effect();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const result = render();
  assert.equal(result.type, content);
  if (result.props.primaryChapter) {
    result.props.onOpenChapter(result.props.primaryChapter);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(opened[0].selectedChapter.id, result.props.primaryChapter.id);
    assert.equal(opened[0].progressStorageKey, result.props.primaryChapter.id);
  }
  return result.props;
}
(async () => {
  for (const list of [chapters, [...chapters].reverse(), [chapters[1], chapters[0], chapters[2]]]) {
    const original = list.map(item => item.id).join(',');
    const view = await detailCase(list);
    assert.equal(view.primaryChapter.id, '1');
    assert.equal(view.primaryActionTitle, '开始阅读 · 第 1 话');
    assert.equal(list.map(item => item.id).join(','), original);
  }
  const view = await detailCase(chapters, {
    '3': { lastPage: 8, totalPages: 10, lastReadAt: 100 },
    '2': { lastPage: 4, totalPages: 10, lastReadAt: 200 },
  });
  assert.equal(view.primaryChapter.id, '2');
  assert.equal(view.primaryActionTitle, '继续阅读 · 第 2 话');
  assert(view.continueSubtitle.includes('5/10 页'));
  assert.equal((await detailCase([chapters[2]])).primaryChapter.id, '1');
  assert.equal((await detailCase([])).primaryChapter, undefined);
  console.log('PASS unread starts at first chapter regardless of list order; latest-read chapter wins; page progress, single and empty lists');
})().catch(error => { console.error(error); process.exitCode = 1; });
