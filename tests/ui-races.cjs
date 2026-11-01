const assert = require('node:assert/strict');
const { ui, deferred, settle } = require('./support.cjs');
const chapter = { id: '1', order: 1, title: 'One', updatedAt: '' };
const comic = id => ({ id, title: `Comic ${id}`, author: '', thumb: { fileServer: '', path: '' }, isFavourite: false });
const nodesWith = (view, type, title) => view.nodes().filter(node => node.type === type && (title == null || node.props.title === title));
const accountStub = { loadJMAccount: () => ({ username: '', password: '', cookies: [] }) };
const themeStub = { loadAppearanceMode: () => 'auto', setActiveThemeScheme: () => {}, appearanceModeLabel: () => '自动', readSystemColorScheme: () => 'light' };
function detail(adapter) {
  const props = { auth: { host: 'go2778' }, adapter, comicId: '42', dialog: { alert: async () => {} },
    normalizeOnlineThumbUrl: () => '', getContinueChapter: () => null, getOnlineComicBlockedKeywordHits: () => [],
    getOnlineChapterProgress: () => ({ lastPage: 0, totalPages: 0, lastReadAt: 0 }), getOnlineChapterProgressLabel: () => '',
    buildOnlineReaderProgressKey: () => 'progress', renderReaderView: value => value, presentReaderFullScreen: async () => {},
  };
  return { props, view: ui('online-comic-detail-view', 'OnlineComicDetailView', props) };
}
const adapter = extra => ({ descriptor: () => ({ id: 'zh.jmcomic' }), getMangaDetails: async (_auth, id) => comic(id),
  getChapterList: async () => [chapter], getPageList: async () => [{ id: 'page', localFilePath: '/page.png' }], ...extra });
(async () => {
  const old = deferred();
  const stale = detail(adapter({ getMangaDetails: (_auth, id) => id === '42' ? old.promise : Promise.resolve(comic(id)) }));
  stale.view.render(); stale.view.effects();
  stale.view.render({ comicId: '43' }); stale.view.effects(); await settle();
  assert.equal(stale.view.render().props.comic.id, '43'); old.reject(new Error('old failure')); await settle();
  assert.equal(stale.view.render().props.comic.id, '43');
  const favourite = deferred();
  const fav = detail(adapter({ getFavouriteState: () => favourite.promise, toggleFavourite: async () => ({ action: 'favourite' }) }));
  fav.view.render(); fav.view.effects(); await settle();
  fav.view.render().props.onToggleFavourite(); await settle(); assert.equal(fav.view.render().props.comic.isFavourite, true);
  favourite.resolve(false); await settle(); assert.equal(fav.view.render().props.comic.isFavourite, true);
  const pages = deferred(); let presented = 0;
  const closed = detail(adapter({ getPageList: () => pages.promise }));
  closed.props.presentReaderFullScreen = async () => { presented++; };
  closed.view.render(); closed.view.effects(); await settle();
  const content = closed.view.render(); content.props.onOpenChapter(chapter); content.props.onClose(); closed.view.close();
  pages.resolve([{ id: 'page', localFilePath: '/page.png' }]); await settle();
  assert.equal(presented, 0); assert.equal(closed.view.writesAfterClose, 0);
  console.log('PASS stale detail failures cannot replace new content; old favourite status cannot undo a mutation; closed details cannot present a late reader');

  const oldSearch = deferred(), lateSearch = deferred(); let failures = 0; const searches = [];
  const app = ui('jm-personal-app', 'JMPersonalApp', { adapter: { getMangaList: async (_auth, params) => {
    searches.push(params);
    if (params.keyword === 'old') return oldSearch.promise;
    if (params.keyword === 'late') return lateSearch.promise;
    if (params.page === 2 && failures++ === 0) throw new Error('page two failed');
    return { docs: [comic(`${params.keyword}-${params.page}`)], page: params.page, pages: 3, total: 3 };
  } }, onOpen: async () => {} }, { 'jm-account': accountStub, theme: themeStub });
  app.render(); app.effects();
  const search = value => { const field = nodesWith(app, 'TextField', '漫画名、作者或 ID')[0]; field.props.onChanged(value); field.props.onSubmit(); };
  search('old'); search('new'); await settle(); oldSearch.reject(new Error('stale search')); await settle();
  assert(app.nodes().some(node => node.type?.name === 'JMComicRows' && node.props.comics.some(comic => comic.id === 'new-1')));
  assert(!nodesWith(app, 'Button', '重试').length);
  nodesWith(app, 'Button', '下一页')[0].props.action();
  nodesWith(app, 'TextField', '漫画名、作者或 ID')[0].props.onSubmit(); // Duplicate submit cannot replace the failed page number.
  await settle();
  nodesWith(app, 'Button', '重试')[0].props.action(); await settle(); assert.equal(searches.at(-1).page, 2);
  search('late'); app.close(); lateSearch.resolve({ docs: [comic('late')], page: 1, pages: 1 }); await settle(); assert.equal(app.writesAfterClose, 0);
  console.log('PASS stale searches are ignored, failed search pagination retries the failed page, closed views receive no late state writes');

  const listCalls = []; let listAttempts = 0;
  const list = ui('jm-personal-app', 'JMAccountListPage', { kind: 'albums', initial: { docs: [], page: 1, nextPath: '/user/tester/favorite/albums?page=2' }, onOpen: () => {} }, {
    'jm-account': { ...accountStub, fetchJMAccountPage: async (_kind, path, page) => {
      listCalls.push({ path, page }); if (listAttempts++ === 0) throw new Error('failed'); return { docs: [comic('2')], page, nextPath: undefined };
    } }, theme: themeStub,
  });
  list.render(); list.effects(); nodesWith(list, 'Button', '下一页')[0].props.action(); await settle();
  nodesWith(list, 'Button', '重试')[0].props.action(); await settle(); assert.equal(listCalls.at(-1).page, 2); assert(listCalls.at(-1).path.endsWith('page=2'));
  assert.equal(nodesWith(list, 'Button', '下一页')[0].props.disabled, true);
  console.log('PASS account pagination retries the failed page and clears obsolete next-page paths');

  const firstShelf = deferred(), modal = deferred(); let albums = 0, watchlists = 0, opened = 0, update;
  const shelf = ui('jm-personal-app', 'JMPersonalApp', { adapter: {}, onOpen: async (_comic, onUpdate) => { opened++; update = onUpdate; return modal.promise; } }, {
    'jm-account': { loadJMAccount: () => ({ username: 'tester', password: 'mock', cookies: [] }), fetchJMAccountPage: async kind => {
      if (kind === 'albums') { albums++; return albums === 1 ? firstShelf.promise : { docs: [], page: 1 }; }
      watchlists++; return { docs: [], page: 1 };
    } }, theme: themeStub,
  });
  shelf.render(); shelf.effects();
  const rows = shelf.nodes().find(node => node.type?.name === 'JMComicRows'); rows.props.onOpen(comic('1')); rows.props.onOpen(comic('1'));
  assert.equal(opened, 1); update(); update(); firstShelf.resolve({ docs: [], page: 1 }); await settle();
  assert.equal(albums, 2); assert.equal(watchlists, 2);
  shelf.close(); modal.resolve(); await settle(); assert.equal(shelf.writesAfterClose, 0);
  console.log('PASS rapid taps open one detail and refreshes requested during an active shelf load are coalesced instead of lost');
})().catch(error => { console.error(error); process.exitCode = 1; });
