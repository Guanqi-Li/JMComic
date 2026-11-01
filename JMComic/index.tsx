import { Button, List, Navigation, NavigationStack, Path, ProgressView, Section, Text, useEffect, useObservable, fetch } from "scripting"
import { JMPersonalApp, JMComicRows } from "./jm-personal-app"
import { fetchJMHomeRecommendations, loadJMAccount, readJMWebAlbum, searchJMWebsite, toggleJMAccountFavourite } from "./jm-account"
import { createJMComicAdapter } from "./jmcomic"
import { seedBuiltinSources, JM_ORDER_MAP } from "./source-definitions"
import { ensureJMApiContext, jmApiGet, jmAlbumPath, jmChapterPath, jmSearchPath, jmFilterPath, jmResolveAbsoluteUrl, jmCoverUrl } from "./jm-request"
import { jmFetchPageToLocalFile } from "./jm-image"
import { ComicReaderView } from "./features/reader/comic-reader-view"
import { OnlineComicDetailView } from "./online-comic-detail-view"
import { buildOnlineReaderProgressKey, getOnlineChapterProgress, getOnlineChapterProgressLabel, pushOnlineReadingHistory } from "./online-storage"
import { getOnlineContinueChapter } from "./online-progress"
import { normalizeOnlineThumbUrl } from "./pica-request"
import { formatRelativeTime } from "./comic-ui-utils"
import type { ComicSourceAdapter, OnlineComic } from "./types"

const auth = { email: "", password: "", token: "", host: "go2778" as const }
const getOnlineImageCachePath = (namespace: string, name: string): string => {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "_")
  const directory = Path.join(FileManager.temporaryDirectory, "jm-reader-cache", safe(namespace))
  if (!FileManager.existsSync(directory)) FileManager.createDirectorySync(directory, true)
  return Path.join(directory, safe(name))
}
const cacheOnlineImage = async (url: string, namespace: string, name: string): Promise<string> => {
  const response = await fetch(url, { timeout: 30 })
  if (!response.ok) throw new Error(`图片加载失败 (${response.status})`)
  const data = Data.fromArrayBuffer(await response.arrayBuffer())
  if (!data) throw new Error("图片数据为空")
  const path = getOnlineImageCachePath(namespace, name)
  FileManager.writeAsDataSync(path, data)
  return path
}
const baseAdapter = createJMComicAdapter(seedBuiltinSources()[0], {
  ensureContext: ensureJMApiContext, apiGet: jmApiGet, albumPath: jmAlbumPath, chapterPath: jmChapterPath,
  searchPath: jmSearchPath, filterPath: jmFilterPath, resolveAbsoluteUrl: jmResolveAbsoluteUrl, coverUrl: jmCoverUrl,
  buildAbsoluteOnlineThumb: (url, originalName) => ({ fileServer: "", path: url || "", originalName }),
  fetchPageToLocalFile: (url, namespace, cacheName, sourceName, episodeId) => jmFetchPageToLocalFile(url, namespace, cacheName, sourceName, episodeId, { getOnlineImageCachePath }),
})

const adapter: ComicSourceAdapter = {
  ...baseAdapter,
  getHomeRecommendations: fetchJMHomeRecommendations,
  getMangaList: async (a, params) => {
    try { return await baseAdapter.getMangaList(a, params) }
    catch (error) {
      if (!params.keyword) throw error
      return searchJMWebsite(params.keyword, params.page ?? 1, JM_ORDER_MAP[params.sort ?? "dd"])
    }
  },
  getMangaDetails: (a, id) => baseAdapter.getMangaDetails(a, id),
  getFavouriteState: async id => loadJMAccount().username ? (await readJMWebAlbum(id)).favourite : false,
  getPageList: (a, id, chapter) => baseAdapter.getPageList(a, id, chapter),
  toggleFavourite: (_a, id) => toggleJMAccountFavourite(id),
}

async function openComic(comic: OnlineComic, onUpdate: () => void): Promise<void> {
  await Navigation.present({ element: <NavigationStack><JMDetail comicId={comic.id} onUpdate={onUpdate} /></NavigationStack> })
}

function RelatedSearch(props: { keyword: string; onUpdate: () => void }) {
  const comics = useObservable<OnlineComic[]>([]), busy = useObservable(true), error = useObservable("")
  useEffect(() => {
    let active = true
    adapter.getMangaList(auth, { keyword: props.keyword, page: 1, sort: "dd" })
      .then(result => { if (active) comics.setValue(result.docs) })
      .catch(e => { if (active) error.setValue(e instanceof Error ? e.message : "加载失败") })
      .finally(() => { if (active) busy.setValue(false) })
    return () => { active = false }
  }, [props.keyword])
  const dismiss = Navigation.useDismiss()
  return <List navigationTitle={props.keyword} listStyle="insetGroup" toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} /> }}>
    <Section>{busy.value ? <ProgressView /> : null}{error.value ? <Text foregroundStyle="red">{error.value}</Text> : null}
      <JMComicRows comics={comics.value} onOpen={comic => { openComic(comic, props.onUpdate).catch(() => {}) }} />
    </Section>
  </List>
}

function JMDetail(props: { comicId: string; onUpdate: () => void }) {
  return <OnlineComicDetailView auth={auth} adapter={adapter} comicId={props.comicId}
    onCollectionUpdate={props.onUpdate} dialog={Dialog}
    normalizeOnlineThumbUrl={normalizeOnlineThumbUrl} cacheOnlineImage={cacheOnlineImage}
    buildOnlineReaderProgressKey={buildOnlineReaderProgressKey} getOnlineChapterProgress={getOnlineChapterProgress}
    getOnlineChapterProgressLabel={getOnlineChapterProgressLabel} pushOnlineReadingHistory={pushOnlineReadingHistory}
    getContinueChapter={(sourceId, comicId, chapters) => getOnlineContinueChapter(sourceId, comicId, chapters, { getOnlineChapterProgress })}
    getOnlineComicBlockedKeywordHits={() => []} filterComic={() => false} formatRelativeTime={formatRelativeTime}
    presentReaderFullScreen={async element => { await Navigation.present({ element, modalPresentationStyle: "fullScreen" }) }}
    renderReaderView={readerProps => <ComicReaderView {...readerProps} />}
    renderSearchResultsView={searchProps => <RelatedSearch keyword={searchProps.keyword} onUpdate={props.onUpdate} />}
    renderRecommendationList={comics => <JMComicRows comics={comics} onOpen={comic => { openComic(comic, props.onUpdate).catch(() => {}) }} />}
    renderCollectionView={collection => <JMRelatedCollection comics={collection.comics} title={collection.title} onUpdate={props.onUpdate} />}
  />
}

function JMRelatedCollection(props: { comics: OnlineComic[]; title: string; onUpdate: () => void }) {
  const dismiss = Navigation.useDismiss()
  return <List navigationTitle={props.title} listStyle="insetGroup" toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} /> }}>
    <Section><JMComicRows comics={props.comics} onOpen={comic => { openComic(comic, props.onUpdate).catch(() => {}) }} /></Section>
  </List>
}

Navigation.present({ element: <JMPersonalApp adapter={adapter} onOpen={openComic} />, modalPresentationStyle: "overFullScreen" }).catch(error => {
  Dialog.alert({ title: "无法启动", message: error instanceof Error ? error.message : String(error) }).catch(() => {})
})
