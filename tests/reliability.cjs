const assert = require('node:assert/strict');
const { loader, deferred, settle } = require('./support.cjs');
const response = (text, cookies = [], status = 200) => ({ status, ok: status < 400, cookies, text: async () => text });
(async () => {
  const values = new Map();
  const load = loader({ Storage: { get: key => values.get(key), set: (key, value) => values.set(key, value) } });
  const storage = load('library-storage');
  values.set('comic_bad', JSON.stringify({ lastPage: 10000.5, totalPages: 10.9, lastReadAt: -1 }));
  let progress = storage.loadProgress('bad'); assert.equal(progress.lastPage, 9); assert.equal(progress.totalPages, 10); assert.equal(progress.lastReadAt, 0);
  values.set('comic_bad', '{"lastPage":1e999,"totalPages":-4,"lastReadAt":1e999}');
  progress = storage.loadProgress('bad'); assert.equal(progress.lastPage, 0); assert.equal(progress.totalPages, 0); assert.equal(progress.lastReadAt, 0);
  storage.saveProgressData('fixed', -10, 10, 123); assert.equal(storage.loadProgress('fixed').lastPage, 0);
  values.set('comic_online_reading_history', JSON.stringify([{ comicId: '1', chapterOrder: 1 }, { comicId: '2', chapterOrder: -1 }]));
  const history = load('online-storage').loadOnlineReadingHistory(); assert.equal(history.length, 1); assert.equal(history[0].comicCover.path, '');
  console.log('PASS malformed and out-of-range progress is normalized; broken history entries remain safe');

  const queue = loader()('page-load-queue');
  let exists = true, calls = 0, forced = [];
  const { ReaderPreloader } = loader({}, {}, { 'page-load-queue': queue })('features/reader/reader-preloader');
  const cache = new ReaderPreloader(() => exists);
  const page = { id: '1', index: 0, loadLocalFile: async reload => { calls++; forced.push(reload); return '/page.png'; } };
  await cache.load(page); assert.equal(cache.cachedPath(page), '/page.png');
  exists = false; await cache.load(page); assert.equal(calls, 2);
  exists = true; cache.invalidate(page); await cache.load(page); assert.equal(forced.at(-1), true);
  assert.equal(cache.cachedPath(page), '/page.png'); cache.stop();
  // Promote a cancelled queued request during its promise-resolution turn.
  const gates = [], blockers = [0, 1, 2].map(() => queue.withPageLoadSlot(() => new Promise(resolve => gates.push(resolve))));
  const promoted = new ReaderPreloader(() => true); let valid = false, downloads = 0;
  const waiting = { id: 'waiting', index: 0, loadLocalFile: async () => { downloads++; return '/waiting.png'; } };
  const background = promoted.load(waiting, false, () => valid);
  gates[0](); await Promise.resolve(); await Promise.resolve();
  const foreground = promoted.load(waiting);
  gates[1](); gates[2]();
  assert.equal(await foreground, '/waiting.png'); await Promise.all([...blockers, background]); assert.equal(downloads, 1); promoted.stop();
  console.log('PASS evicted and corrupt image caches reload; foreground requests survive prefetch cancellation');

  let writable = true, opened = 0, fetcher;
  const saved = new Map([['jm_personal_account_v1', JSON.stringify({ username: 'tester', password: 'mock', cookies: [null, { name: 'bad', value: 'x', domain: '.vip' }] })]]);
  const accountLoad = loader({
    Keychain: { get: key => saved.get(key), set: (key, value) => { if (!writable) return false; saved.set(key, value); return true; } },
    WebViewController: class { constructor() { opened++; } },
  }, { fetch: (...args) => fetcher(...args) });
  const account = accountLoad('jm-account'); assert.equal(account.loadJMAccount().cookies.length, 0);
  writable = false; assert.throws(() => account.saveJMCredentials('replacement', 'mock2'), /钥匙串/); assert.equal(account.loadJMAccount().username, 'tester'); writable = true;
  const pending = deferred(); fetcher = () => pending.promise;
  const old = account.fetchJMAccountPage('albums'), rejected = assert.rejects(old, /账号已切换/);
  account.saveJMCredentials('replacement', 'mock2');
  pending.resolve(response('<a href="/logout">Logout</a>', [{ name: 'AVS', value: 'old-account', domain: '18comic.vip', path: '/' }])); await rejected;
  assert.equal(account.loadJMAccount().cookies.length, 0);
  fetcher = async () => response('<title>Just a moment...</title>', [], 403);
  await assert.rejects(account.recordJMAccountReading('42'), /验证/); assert.equal(opened, 0);
  const network = [response('', [], 302), response('<title>Just a moment...</title>', [], 403)];
  fetcher = async () => network.shift(); await assert.rejects(account.recordJMAccountReading('42'), /验证/); assert.equal(opened, 0);
  fetcher = async () => response('<a href="/logout">Logout</a>', [null, { name: 'oops', value: 'x', expiresDate: 'invalid' }, { name: 'wrong', value: 'x', domain: '.vip' }, { name: 'AVS', value: 'good', domain: '.18comic.vip', path: '/' }]);
  await account.fetchJMAccountPage('albums'); assert.equal(account.jmCookieHeader('https://18comic.vip/'), 'AVS=good'); assert.equal(account.jmCookieHeader('https://other.vip/'), '');
  console.log('PASS failed credential save rolls back; old account responses cannot overwrite new sessions; background history never opens verification; malformed cookies are ignored');

  const { ChapterStream } = loader()('features/reader/chapter-stream');
  const chapters = [1, 2, 3].map(order => ({ id: String(order), order, title: String(order), updatedAt: '' }));
  const stream = new ChapterStream([chapters[2], chapters[0], chapters[0]], chapters[1], [{ id: 'page', index: 0 }], async () => [{ id: 'page', index: 0 }]);
  assert.equal(stream.chapters.length, 3); assert.equal(stream.adjacent(chapters[1], 1).id, '3'); assert.equal(stream.adjacent({ id: 'missing' }, 1), undefined);
  console.log('PASS missing selected chapter is sorted into the directory and duplicate chapter IDs cannot loop');
})().catch(error => { console.error(error); process.exitCode = 1; });
