const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require(process.env.TS_COMPILER || 'typescript');
const root = path.resolve(__dirname, '../JMComic');
const cache = new Map(), saved = new Map();
let requests = [], queue = [], browserOpened = 0, imageRequests = 0;
const native = { fetch: async (url, options) => {
  imageRequests++; requests.push({ url, options }); const response = queue.shift();
  if (!response) throw new Error('Unexpected test request');
  return { status: response.status || 200, cookies: response.cookies || [], text: async () => response.text, ok: true };
}};
const context = { Date, Promise, setTimeout, console,
  Keychain: { get: key => saved.get(key) || null, set: (key, value) => { saved.set(key, value); return true } },
  FileManager: { existsSync: filename => filename.endsWith('.png') },
  WebViewController: class {
    async setCookie() { return true } async loadURL() { return true } async present() { browserOpened++ }
    async getCookies() { return [{ name: 'cf_clearance', value: 'mock-verified', domain: '.18comic.vip', path: '/', isSessionOnly: true }] }
    async evaluateJavaScript() { return 'MockBrowser/1.0' } dispose() {}
  }
};
vm.createContext(context);
function load(name) {
  const base = path.resolve(root, name);
  const file = ['.ts', '.tsx'].map(extension => base + extension).find(file => fs.existsSync(file));
  assert(file, 'Missing module ' + name);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  vm.runInContext('(function(require,module,exports){' + js + '})', context)(id => id === 'scripting' ? native : load(path.relative(root, path.resolve(path.dirname(file), id))), module, module.exports);
  return module.exports;
}
const loggedIn = '<a href="/logout">Logout</a>';
const card = (kind, id, title) => `<div id="${kind}_album_${id}" class="list-col"><a href="/album/${id}/"><img src="/media/albums/${id}.jpg"><div class="video-title">${title}</div></a></div>`;
(async () => {
  for (const file of fs.readdirSync(root, { recursive: true }).filter(file => /\.tsx?$/.test(file))) {
    const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } });
    assert.equal(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
  }
  const parser = load('jm-account-parser');
  const source = loggedIn + card('favorites', 2, 'Newest') + card('favorites', 1, 'Older') + '<a href="/album/99">Navigation</a><a href="/user/tester/favorite/albums?page=2&amp;o=mr">Next</a>';
  const page = parser.parseAccountPage(source, 'albums'); assert.equal(page.docs.length, 2); assert.equal(page.docs[0].title, 'Newest'); assert.equal(page.nextPath, '/user/tester/favorite/albums?page=2&o=mr');
  const home = parser.parseJMWebSearch('<a href="/album/42/title"><img src="/media/albums/blank.jpg" data-src="/media/albums/42.jpg" title="Recommended"></a>', 1);
  assert.equal(home.docs[0].title, 'Recommended'); assert(home.docs[0].thumb.path.endsWith('/42.jpg'));
  assert(!parser.isJMChallenge(loggedIn + '<script src="/cdn-cgi/challenge-platform/test.js"></script>'));
  assert(parser.isJMChallenge('<title>Just a moment...</title><script>window._cf_chl_opt={}</script>'));
  console.log('PASS syntax, account cards, latest-first order preservation, homepage lazy images, challenge detection');

  saved.set('jm_personal_account_v1', JSON.stringify({ username: 'tester', password: 'mock-password', cookies: [] }));
  const account = load('jm-account');
  queue = [{ status: 302, text: '' }, { text: '{"status":1}', cookies: [{ name: 'AVS', value: 'mock-session', domain: '18comic.vip', path: '/' }] }, { text: loggedIn }, { text: source }];
  await account.fetchJMAccountPage('albums'); assert(requests[0].url.endsWith('?o=mr')); assert(requests.at(-1).options.headers.Cookie.includes('AVS=mock-session'));
  queue = [{ text: source }]; await account.fetchJMAccountPage('albums', '/user/tester/favorite/albums?page=2', 2); assert(requests.at(-1).url.endsWith('page=2&o=mr'));
  assert.equal(account.jmCookieHeader('https://other.test/'), '');
  queue = [{ status: 403, text: '<title>Just a moment...</title>' }, { text: loggedIn }]; await account.fetchJMAccountPage('watchlist'); assert.equal(browserOpened, 1); assert(requests.at(-1).options.headers.Cookie.includes('cf_clearance=mock-verified'));
  console.log('PASS expired session auto-login, latest order on subsequent pages, cookie scoping, manual verification replay');

  const { createJMComicAdapter } = load('jmcomic'), { seedBuiltinSources } = load('source-definitions');
  let albums = 0, downloads = 0;
  const adapter = createJMComicAdapter(seedBuiltinSources()[0], {
    ensureContext: async () => ({ domain: 'mock', cdnBase: 'https://images.test' }),
    apiGet: async (_domain, endpoint) => {
      if (endpoint.startsWith('album/')) { albums++; await new Promise(resolve => setTimeout(resolve, 2)); return { name: 'Mock', tags: ['Mock'], series: [{ id: 42, name: 'Chapter', sort: 1 }] }; }
      if (endpoint.startsWith('chapter/')) return { id: 42, images: Array.from({ length: 100 }, (_, i) => `${i}.jpg`) };
      return { content: [] };
    }, albumPath: id => 'album/' + id, chapterPath: id => 'chapter/' + id, searchPath: () => 'search', filterPath: () => 'filter', resolveAbsoluteUrl: url => url,
    coverUrl: (base, id) => base + '/' + id, buildAbsoluteOnlineThumb: url => ({ fileServer: '', path: url }), fetchPageToLocalFile: async () => { downloads++; return '/decoded.png'; }
  });
  const auth = { host: 'go2778', email: '', password: '', token: '' };
  await Promise.all([adapter.getMangaDetails(auth, '42'), adapter.getChapterList(auth, '42'), adapter.getRecommendations(auth, '42')]); assert.equal(albums, 1);
  const pages = await adapter.getPageList(auth, '42', { id: '42', title: 'Chapter', order: 1, updatedAt: '' }); assert.equal(pages.length, 100); assert.equal(downloads, 0);
  await Promise.all([pages[0].loadLocalFile(), pages[0].loadLocalFile()]); assert.equal(downloads, 1);
  const { withPageLoadSlot } = load('page-load-queue'); let active = 0, maximum = 0;
  await Promise.all(Array.from({ length: 12 }, (_, i) => withPageLoadSlot(async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; if (i === 1) throw new Error('Mock'); }).catch(() => {}))); assert.equal(maximum, 3);
  const before = imageRequests; const cached = await load('jm-image').jmFetchPageToLocalFile('https://images.test/42.jpg', '42', '1.jpg', '1.jpg', 42, { getOnlineImageCachePath: () => '/cache/1.jpg' }); assert.equal(cached, '/cache/1.png'); assert.equal(imageRequests, before);
  console.log('PASS shared album requests, immediate chapter metadata, lazy/deduplicated downloads, bounded queue, decoded cache reuse');
})().catch(error => { console.error(error); process.exitCode = 1; });
