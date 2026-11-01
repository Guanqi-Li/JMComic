const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { loader } = require('./support.cjs');
class Data {
  constructor(value) { this.buffer = Buffer.from(value); }
  static fromRawString(value, encoding) { return new Data(Buffer.from(value, encoding === 'ascii' ? 'ascii' : 'utf8')); }
  static fromBase64String(value) { return new Data(Buffer.from(value, 'base64')); }
  static fromUint8Array(value) { return new Data(value); }
  static fromArrayBuffer(value) { return new Data(Buffer.from(value)); }
  toUint8Array() { return new Uint8Array(this.buffer); }
  toDecodedString() { return this.buffer.toString('utf8'); }
  toHexString() { return this.buffer.toString('hex'); }
}
const encrypt = (text, secret) => {
  const key = Buffer.from(crypto.createHash('md5').update(secret).digest('hex'), 'ascii');
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
};
(async () => {
  let fetcher, writes = 0;
  const globals = { Data, Crypto: { md5: data => new Data(crypto.createHash('md5').update(data.buffer).digest()) },
    FileManager: { existsSync: () => true, writeAsDataSync: () => { writes++; } },
    UIImage: { fromData: () => null }, React: { createElement: () => ({}) } };
  const load = loader(globals, { fetch: (...args) => fetcher(...args) });
  const constants = load('source-definitions'), api = load('jm-request'), timestamp = 1700000000;
  for (const payload of [{ a: 1 }, { title: '中文 📖', rows: [1, 2, 3], nested: { text: '[braces] {text}' } }, Array.from({ length: 100 }, (_, i) => i)]) {
    fetcher = async () => ({ ok: true, json: async () => ({ data: encrypt(JSON.stringify(payload), `${timestamp}${constants.JM_DATA_SECRET}`) }) });
    const result = await api.jmApiGet('api.test', '/test', undefined, timestamp); assert.equal(JSON.stringify(result), JSON.stringify(payload));
  }
  fetcher = async () => ({ ok: true, json: async () => ({ data: encrypt('1234567890123456', `${timestamp}${constants.JM_DATA_SECRET}`).slice(0, 4) }) });
  await assert.rejects(api.jmApiGet('api.test', '/test', undefined, timestamp), /长度|填充/);
  console.log('PASS AES-256-ECB and PKCS#7 match Node crypto across Unicode, arrays and multiple blocks; malformed ciphertext is rejected');

  let refreshes = 0, settings = 0, failing = false;
  fetcher = async (url, options) => {
    if (constants.JM_DOMAIN_REFRESH_URLS.includes(url)) {
      refreshes++;
      return { ok: true, text: async () => encrypt(JSON.stringify({ Server: [null, 'bad/path', 'https://api.test/'] }), constants.JM_DOMAIN_REFRESH_SECRET) };
    }
    if (failing) return { ok: false, status: 503 };
    settings++;
    assert(url.startsWith('https://api.test/setting?'));
    const ts = Number(options.headers.tokenparam.split(',')[0]);
    return { ok: true, json: async () => ({ data: encrypt(JSON.stringify({ img_host: settings === 1 ? 'httpbad' : 'https://images.test' }), `${ts}${constants.JM_DATA_SECRET}`) }) };
  };
  const [one, two] = await Promise.all([api.ensureJMApiContext(), api.ensureJMApiContext()]);
  assert.equal(one.domain, 'api.test'); assert.equal(two.cdnBase, 'https://images.test'); assert.equal(refreshes, 1); assert.equal(settings, 2);
  failing = true; await assert.rejects(api.jmApiGet('api.test', '/chapter'), /503/); failing = false;
  await api.ensureJMApiContext(); assert.equal(refreshes, 2);
  console.log('PASS context discovery is shared, malformed domains/CDNs are rejected and failed API requests invalidate stale context for retry');

  const image = load('jm-image'), deps = { getOnlineImageCachePath: () => '/cache/1.jpg' };
  fetcher = async () => ({ ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer });
  assert.equal(await image.jmFetchPageToLocalFile('https://images.test/a.jpg', '1', '1.jpg', '1.jpg', 42, deps), '/cache/1.png');
  await assert.rejects(image.jmFetchPageToLocalFile('https://images.test/a.jpg', '1', '1.jpg', '1.jpg', 42, deps, true), /解码/);
  await assert.rejects(image.jmFetchPageToLocalFile('https://images.test/a.jpg', '1', '1.jpg', '1.jpg', 400000, deps, true), /解码/);
  assert.equal(writes, 0);
  console.log('PASS explicit image retry bypasses disk cache; invalid image responses are never saved as successful decoded pages');

  const { createJMComicAdapter } = load('jmcomic');
  let requests = 0, reloadFlag;
  const adapter = createJMComicAdapter(constants.seedBuiltinSources()[0], {
    ensureContext: async () => ({ domain: 'api.test', cdnBase: 'https://images.test' }),
    apiGet: async (_domain, path) => path.startsWith('search:') ? {
      total: 165, content: Array.from({ length: path.endsWith(':3') ? 5 : 80 }, (_, i) => ({ id: i + 1, name: 'Mock' })),
    } : { id: '42', images: ['1.jpg'] },
    searchPath: (_q, _order, _category, page) => `search:${page}`, filterPath: () => '', chapterPath: () => 'chapter',
    buildAbsoluteOnlineThumb: path => ({ path: path || '', fileServer: '' }), resolveAbsoluteUrl: path => path, coverUrl: () => '',
    fetchPageToLocalFile: async (...args) => { requests++; reloadFlag = args.at(-1); return '/page.png'; },
  });
  const first = await adapter.getMangaList({}, { keyword: 'mock', page: 1 });
  const last = await adapter.getMangaList({}, { keyword: 'mock', page: 3 }); assert.equal(first.pages, 3); assert.equal(last.pages, 3);
  const pages = await adapter.getPageList({}, '42', { id: '42' });
  await Promise.all([pages[0].loadLocalFile(), pages[0].loadLocalFile()]); assert.equal(requests, 1);
  await pages[0].loadLocalFile(true); assert.equal(requests, 2); assert.equal(reloadFlag, true);
  console.log('PASS partial last search page cannot inflate page count; image loader shares in-flight work and allows forced retry afterward');
})().catch(error => { console.error(error); process.exitCode = 1; });
