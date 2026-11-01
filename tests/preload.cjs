const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require(process.env.TS_COMPILER || 'typescript');
const root = path.resolve(__dirname, '../JMComic'), modules = new Map();
function load(name) {
  const file = path.resolve(root, name + '.ts');
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext('(function(require,module,exports){' + js + '})')(
    id => load(path.relative(root, path.resolve(path.dirname(file), id))), module, module.exports);
  return module.exports;
}
const { withPageLoadSlot } = load('page-load-queue');
const { ChapterStream } = load('features/reader/chapter-stream');
const { ReaderPreloader } = load('features/reader/reader-preloader');
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const chapters = [1, 2, 3].map(order => ({ id: String(order), order, title: `Chapter ${order}`, updatedAt: '' }));
const page = (id, index, run) => ({ id: `${id}_${index}`, index, loadLocalFile: run || (async () => `/${id}_${index}.png`) });
(async () => {
  const downloads = [], metadata = [];
  const pages = id => Array.from({ length: 10 }, (_, index) => page(id, index, async () => {
    downloads.push(`${id}_${index}`); return `/${id}_${index}.png`;
  }));
  const stream = new ChapterStream(chapters, chapters[0], pages('1'), async chapter => { metadata.push(chapter.id); return pages(chapter.id); });
  const reader = new ReaderPreloader();
  reader.update(stream, 0); await settle();
  assert.deepEqual(downloads, ['1_1', '1_2', '1_3', '1_4', '1_5']);
  assert.deepEqual(metadata, []);
  reader.update(stream, 5); await settle();
  assert.deepEqual(downloads.slice(5).sort(), ['1_6', '1_7', '1_8', '1_9', '2_0', '2_1', '2_2']);
  assert.deepEqual(metadata, ['2']); assert.equal(stream.segments.length, 1); assert.equal(stream.pages.length, 10);
  await stream.appendNext(); assert.deepEqual(metadata, ['2']);
  const before = downloads.length;
  assert.equal(await reader.load(stream.pages[10]), '/2_0.png');
  assert.equal(downloads.length, before);
  reader.stop();
  console.log('PASS next five pages, near-end next chapter first three, no early append, shared metadata and decoded image reuse');

  // The shared queue never exceeds three jobs, and a newly visible page wins the next slot.
  const releases = [], started = []; let active = 0, maximum = 0;
  const job = label => async () => {
    started.push(label); active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => releases.push(resolve)); active--; return label;
  };
  const jobs = [0, 1, 2].map(i => withPageLoadSlot(job(`active${i}`), () => 0));
  jobs.push(withPageLoadSlot(job('background'), () => 0));
  jobs.push(withPageLoadSlot(job('visible')));
  releases.shift()(); await settle(); assert.equal(started[3], 'visible');
  while (releases.length) { releases.shift()(); await settle(); }
  await Promise.all(jobs); assert.equal(maximum, 3);
  console.log('PASS global three-image limit and visible-page priority');

  // A foreground request promotes an already queued prefetch instead of downloading twice.
  const gates = [], blockers = [0, 1, 2].map(() => withPageLoadSlot(() => new Promise(resolve => gates.push(resolve))));
  const shared = new ReaderPreloader(), order = [];
  const background = page('bg', 0, async () => { order.push('bg'); return '/bg.png'; });
  const promoted = page('visible', 0, async () => { order.push('visible'); return '/visible.png'; });
  const bgTask = shared.load(background, false), prefetch = shared.load(promoted, false);
  const foreground = shared.load(promoted);
  assert.equal(prefetch, foreground);
  gates.shift()(); await settle(); assert.deepEqual(order, ['visible', 'bg']);
  for (const release of gates) release(); await Promise.all([...blockers, bgTask, foreground]); shared.stop();
  console.log('PASS visible requests share and promote queued prefetches');

  // Moving elsewhere invalidates pending work; closing also stops pending work.
  for (const stop of [false, true]) {
    const gates = [], blockers = [0, 1, 2].map(() => withPageLoadSlot(() => new Promise(resolve => gates.push(resolve))));
    const fetched = [], cache = new ReaderPreloader();
    const local = new ChapterStream([chapters[0]], chapters[0], Array.from({ length: 20 }, (_, index) => page('1', index, async () => { fetched.push(index); return '/page.png'; })), async () => []);
    cache.update(local, 0);
    if (stop) cache.stop(); else cache.update(local, 10);
    for (const release of gates) release(); await Promise.all(blockers); await settle();
    assert.deepEqual(fetched, stop ? [] : [11, 12, 13, 14, 15]); cache.stop();
  }
  console.log('PASS obsolete queued prefetches stop after a jump or reader close');

  const retry = new ReaderPreloader(); let attempts = 0;
  const flaky = page('retry', 0, async () => { if (++attempts === 1) throw new Error('network'); return '/retry.png'; });
  await assert.rejects(retry.load(flaky, false), /network/);
  assert.equal(await retry.load(flaky), '/retry.png'); assert.equal(attempts, 2); retry.stop();
  let chapterAttempts = 0;
  const retryStream = new ChapterStream(chapters, chapters[0], [page('1', 0)], async () => ++chapterAttempts === 1 ? [] : [page('2', 0)]);
  await assert.rejects(retryStream.prefetchNext(chapters[0]), /章节图片为空/);
  assert.equal(await retryStream.appendNext(), true); assert.equal(chapterAttempts, 2);
  let release;
  const stale = new ChapterStream(chapters, chapters[0], [page('1', 0)], chapter => chapter.id === '2' ? new Promise(resolve => { release = resolve; }) : Promise.resolve([page('3', 0)]));
  const pending = stale.prefetchNext(chapters[0]); await stale.select(chapters[2]); release([page('2', 0)]);
  assert.equal((await pending).length, 0); assert.equal(stale.segments[0].chapter.id, '3');
  console.log('PASS image and empty chapter retries; stale chapter prefetch cannot replace selected chapter');
})().catch(error => { console.error(error); process.exitCode = 1; });
