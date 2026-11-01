import {
  Button,
  Navigation,
  NavigationStack,
  ProgressView,
  Script,
  Spacer,
  Text,
  VStack,
  useEffect,
  useObservable,
  useRef,
} from "scripting"
import { mapWithConcurrency } from "./async-utils"
import { preparePicaReaderPages } from "./pica-reader-pages"
import { V3ContentState } from "./design-v3/components"
import { V3ComicDetailContent } from "./design-v3/comic-detail-content"
import type { OnlineBlockedKeywordScope } from "./comic-ui-utils"
import type {
  ComicSourceAdapter,
  OnlineAuth,
  OnlineChapter,
  OnlineComic,
  OnlineComicDetails,
  OnlineProgressIdentity,
  PageItem,
} from "./types"

export function OnlineComicDetailView(props: {
  auth: OnlineAuth
  adapter: ComicSourceAdapter
  comicId: string
  onReadingUpdate?: () => void
  onCollectionUpdate?: () => void
  blockedKeywords?: string[]
  onBlockKeyword?: (keyword: string, scope?: OnlineBlockedKeywordScope) => void
  onManageBlockedKeywords?: () => void
  onCloseSource?: () => void
  dialog: {
    alert: (params: { title: string; message: string }) => Promise<void>
  }
  normalizeOnlineThumbUrl: (thumb: any, host?: any) => string
  cacheOnlineImage: (url: string, namespace: string, fileName: string) => Promise<string>
  buildOnlineReaderProgressKey: (identity: OnlineProgressIdentity) => string
  getOnlineChapterProgress: (identity: OnlineProgressIdentity) => { lastReadAt: number; lastPage: number; totalPages: number }
  getOnlineChapterProgressLabel: (identity: OnlineProgressIdentity, chapter: OnlineChapter) => string
  pushOnlineReadingHistory: (record: any) => void
  getContinueChapter: (sourceId: string, comicId: string, chapters: OnlineChapter[]) => OnlineChapter | null
  getOnlineComicBlockedKeywordHits: (comic: OnlineComicDetails, blockedKeywords: string[]) => string[]
  filterComic: (comic: OnlineComic, blockedKeywords: string[]) => boolean
  formatRelativeTime: (timestamp: number) => string
  presentReaderFullScreen: (element: any) => Promise<void>
  renderReaderView: (params: {
    fileName: string
    title: string
    progressStorageKey: string
    onlineProgress: any
    onProgressUpdate?: () => void
    initialPages: PageItem[]
    chapters: OnlineChapter[]
    selectedChapter: OnlineChapter
    loadChapterPages: (chapter: OnlineChapter) => Promise<PageItem[]>
  }) => any
  renderSearchResultsView: (params: {
    auth: OnlineAuth
    adapter: ComicSourceAdapter
    keyword: string
    title: string
    onReadingUpdate?: () => void
    onCollectionUpdate?: () => void
    blockedKeywords?: string[]
    onBlockKeyword?: (keyword: string, scope?: OnlineBlockedKeywordScope) => void
    onManageBlockedKeywords?: () => void
    onCloseSource?: () => void
  }) => any
  renderCollectionView: (params: {
    auth: OnlineAuth
    adapter: ComicSourceAdapter
    title: string
    description: string
    eyebrow: string
    statusText: string
    comics: OnlineComic[]
    total: number
    pageSize: number
    onReadingUpdate?: () => void
    onCollectionUpdate?: () => void
    blockedKeywords?: string[]
    onBlockKeyword?: (keyword: string, scope?: OnlineBlockedKeywordScope) => void
    onManageBlockedKeywords?: () => void
    onCloseSource?: () => void
  }) => any
  renderRecommendationList: (comics: OnlineComic[]) => any
}) {
  const dismiss = Navigation.useDismiss()
  const loading = useObservable(true)
  const errorText = useObservable("")
  const detail = useObservable<OnlineComicDetails | null>(null)
  const chapters = useObservable<OnlineChapter[]>([])
  const recommendations = useObservable<OnlineComic[]>([])
  const chapterLoading = useObservable("")
  const chapterAscending = useObservable(false)
  const actionBusy = useObservable<"" | "fav" | "like">("")
  const onlineAdapter = props.adapter
  const loadGeneration = useRef(0)
  const active = useRef(true)
  const actionVersion = useRef(0)
  const closeDetail = (): void => {
    if (!active.current) return
    active.current = false; loadGeneration.current += 1
    const close = props.onCloseSource ?? dismiss
    close()
  }

  const openTagSearch = async (keyword: string): Promise<void> => {
    const value = keyword.trim().replace(/^#/, "")
    if (!value) return
    await Navigation.present({
      element: <NavigationStack>
        {props.renderSearchResultsView({
          auth: props.auth,
          adapter: onlineAdapter,
          keyword: value,
          title: `标签 · #${value}`,
          onReadingUpdate: props.onReadingUpdate,
          onCollectionUpdate: props.onCollectionUpdate,
          blockedKeywords: props.blockedKeywords,
          onBlockKeyword: props.onBlockKeyword,
          onManageBlockedKeywords: props.onManageBlockedKeywords,
          onCloseSource: props.onCloseSource,
        })}
      </NavigationStack>,
    })
  }

  const load = async (): Promise<void> => {
    if (!active.current) return
    const generation = ++loadGeneration.current
    const version = actionVersion.current
    chapterLoading.setValue(""); actionBusy.setValue("")
    loading.setValue(true)
    errorText.setValue("")
    try {
      const [comic, chapterList] = await Promise.all([
        onlineAdapter.getMangaDetails(props.auth, props.comicId),
        onlineAdapter.getChapterList(props.auth, props.comicId),
      ])
      if (generation !== loadGeneration.current) return
      detail.setValue(comic)
      chapters.setValue(chapterList)
      recommendations.setValue([])
      onlineAdapter.getRecommendations?.(props.auth, props.comicId)
        .then(items => { if (generation === loadGeneration.current) recommendations.setValue(items) })
        .catch(() => {})
      onlineAdapter.getFavouriteState?.(props.comicId)
        .then(isFavourite => {
          if (generation === loadGeneration.current && version === actionVersion.current && detail.value && !actionBusy.value) detail.setValue({ ...detail.value, isFavourite })
        }).catch(() => {})
    } catch (error) {
      if (generation === loadGeneration.current) errorText.setValue(error instanceof Error ? error.message : "加载失败")
    } finally {
      if (generation === loadGeneration.current) loading.setValue(false)
    }
  }

  useEffect(() => { active.current = true; load().catch(() => {}); return () => { active.current = false; loadGeneration.current += 1 } }, [props.comicId])

  const runComicAction = async (kind: "fav" | "like"): Promise<void> => {
    if (!active.current || !detail.value || actionBusy.value) return
    const generation = loadGeneration.current
    actionVersion.current += 1
    const actionTask = kind === "fav" ? onlineAdapter.toggleFavourite : onlineAdapter.toggleLike
    if (!actionTask) {
      await props.dialog.alert({
        title: kind === "fav" ? "当前来源不支持收藏" : "当前来源不支持喜欢",
        message: "这个漫画源暂未提供对应的互动接口。",
      })
      return
    }
    actionBusy.setValue(kind)
    try {
      const comic = detail.value
      const result = await actionTask(props.auth, props.comicId)
      if (generation !== loadGeneration.current) return
      const action = String(result.action ?? "")
      const nextFavourite = kind === "fav"
        ? (action.includes("un_favourite") ? false : action.includes("favourite") ? true : !comic.isFavourite)
        : comic.isFavourite
      const nextLiked = kind === "like"
        ? (action.includes("un_like") ? false : action.includes("like") ? true : !comic.isLiked)
        : comic.isLiked
      detail.setValue({
        ...comic,
        isFavourite: nextFavourite,
        isLiked: nextLiked,
        totalLikes: comic.totalLikes + (kind === "like" ? (nextLiked ? 1 : -1) : 0),
        likesCount: comic.likesCount + (kind === "like" ? (nextLiked ? 1 : -1) : 0),
      })
      props.onCollectionUpdate?.()
    } catch (error) {
      if (generation !== loadGeneration.current) return
      await props.dialog.alert({
        title: kind === "fav" ? "收藏操作失败" : "喜欢操作失败",
        message: error instanceof Error ? error.message : "请稍后再试",
      })
    } finally {
      if (generation === loadGeneration.current) actionBusy.setValue("")
    }
  }

  const openDiscoveryResults = async (title: string, items: OnlineComic[], description: string): Promise<void> => {
    await Navigation.present({
      element: <NavigationStack>
        {props.renderCollectionView({
          auth: props.auth,
          adapter: onlineAdapter,
          title,
          description,
          eyebrow: "推荐",
          statusText: items.length > 0 ? `当前集合共 ${items.length} 本` : "等待集合内容",
          comics: items,
          total: items.length,
          pageSize: 12,
          onReadingUpdate: props.onReadingUpdate,
          onCollectionUpdate: props.onCollectionUpdate,
          blockedKeywords: props.blockedKeywords,
          onBlockKeyword: props.onBlockKeyword,
          onManageBlockedKeywords: props.onManageBlockedKeywords,
          onCloseSource: props.onCloseSource,
        })}
      </NavigationStack>,
    })
  }

  const openChapter = async (chapter: OnlineChapter): Promise<void> => {
    // A single reader presentation owns every chapter until it returns here.
    if (!active.current || chapterLoading.value || actionBusy.value) return
    const generation = loadGeneration.current
    chapterLoading.setValue(chapter.id)
    try {
      const images = await onlineAdapter.getPageList(props.auth, props.comicId, chapter)
      const title = detail.value?.title ?? "在线漫画"
      const isPicaSource = onlineAdapter.descriptor().id === "builtin.pica"
      const initialPages = isPicaSource
        ? preparePicaReaderPages(images, props.auth.host, props.normalizeOnlineThumbUrl)
        : await mapWithConcurrency(images, 3, async (item, index) => {
          if (item.loadLocalFile) return { id: String(item.id ?? index), index, loadLocalFile: item.loadLocalFile }
          const imageUrl = props.normalizeOnlineThumbUrl(item.media, props.auth.host)
          if (item.localFilePath) {
            return { id: String(item.id ?? index), index, path: item.localFilePath }
          }
          const fileExtension = (() => {
            const cleanUrl = imageUrl.split(/[?#]/)[0] ?? ""
            const matched = cleanUrl.match(/\.([a-zA-Z0-9]{2,5})$/)
            return matched ? matched[1] : "jpg"
          })()
          const cachedPath = await props.cacheOnlineImage(imageUrl, chapter.id, `${index + 1}_${String(item.id ?? index)}.${fileExtension}`).catch(() => "")
          if (cachedPath) {
            return { id: String(item.id ?? index), index, path: cachedPath }
          }
          return { id: String(item.id ?? index), index, imageUrl }
        })
      if (generation !== loadGeneration.current) return
      if (initialPages.length === 0) throw new Error("章节图片为空")
      const progressIdentity: OnlineProgressIdentity = {
        sourceId: onlineAdapter.descriptor().id,
        comicId: props.comicId,
        chapterId: chapter.id,
        chapterOrder: chapter.order,
      }
      await props.presentReaderFullScreen(props.renderReaderView({
        fileName: `${title} - ${chapter.title}`,
        title: `${title} · ${chapter.title}`,
        progressStorageKey: props.buildOnlineReaderProgressKey(progressIdentity),
        onlineProgress: {
          sourceId: progressIdentity.sourceId,
          chapterId: chapter.id,
          comicId: props.comicId,
          comicTitle: title,
          comicAuthor: detail.value?.author ?? "",
          comicCover: detail.value?.thumb ?? { fileServer: "", path: "" },
          chapterTitle: chapter.title,
          chapterOrder: chapter.order,
          host: props.auth.host,
        },
        onProgressUpdate: props.onReadingUpdate,
        initialPages,
        chapters: chapters.value,
        selectedChapter: chapter,
        loadChapterPages: async next => {
          const images = await onlineAdapter.getPageList(props.auth, props.comicId, next)
          return images.map((item, index) => ({ id: String(item.id ?? index), index,
            loadLocalFile: item.loadLocalFile, path: item.localFilePath,
            imageUrl: item.loadLocalFile || item.localFilePath ? undefined : props.normalizeOnlineThumbUrl(item.media, props.auth.host),
          }))
        },
      }))
      if (generation !== loadGeneration.current) return
      chapters.setValue([...chapters.value])
      props.onReadingUpdate?.()
    } catch (error) {
      if (generation !== loadGeneration.current) return
      await props.dialog.alert({
        title: "章节加载失败",
        message: error instanceof Error ? error.message : "无法获取章节图片",
      })
    } finally {
      if (generation === loadGeneration.current) chapterLoading.setValue("")
    }
  }

  const detailLifecycleToolbar = {
    primaryAction: Script.supportsMinimization()
      ? <Button title="最小化" systemImage="arrow.down.right.and.arrow.up.left" action={() => { Script.minimize().catch(() => { /**/ }) }} />
      : undefined,
    cancellationAction: <Button title="关闭来源" systemImage="xmark" action={closeDetail} />,
  }

  if (loading.value) {
    return (
      <VStack spacing={12} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} navigationTitle="漫画详情" navigationBarTitleDisplayMode="inline" toolbar={detailLifecycleToolbar}>
        <Spacer />
        <ProgressView progressViewStyle="circular" />
        <Text font="subheadline" foregroundStyle="secondaryLabel">正在加载漫画详情</Text>
        <Spacer />
      </VStack>
    )
  }

  if (errorText.value) {
    return (
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} navigationTitle="加载失败" navigationBarTitleDisplayMode="inline" toolbar={detailLifecycleToolbar}>
        <V3ContentState
          title="无法加载漫画详情"
          message={errorText.value || "请检查网络连接后重试。"}
          systemImage="wifi.exclamationmark"
          actionTitle="重新加载"
          action={() => { load().catch(() => { /**/ }) }}
        />
      </VStack>
    )
  }

  const comic = detail.value
  if (!comic) return <VStack />

  const coverFrame = { width: 122, height: 174 }
  const latestChapter = chapters.value.reduce<OnlineChapter | null>((latest, chapter) => !latest || chapter.order > latest.order ? chapter : latest, null)
  const firstChapter = chapters.value.reduce<OnlineChapter | null>(
    (first, chapter) => !first || chapter.order < first.order ? chapter : first,
    null,
  )
  const sourceId = onlineAdapter.descriptor().id
  const continueChapter = props.getContinueChapter(sourceId, props.comicId, chapters.value)
  const primaryChapter = continueChapter ?? firstChapter
  const displayedChapters = chapterAscending.value ? [...chapters.value].reverse() : chapters.value
  const continueIdentity = continueChapter ? { sourceId, comicId: props.comicId, chapterId: continueChapter.id, chapterOrder: continueChapter.order } : null
  const continueProgress = continueIdentity ? props.getOnlineChapterProgress(continueIdentity) : null
  const continueSubtitle = continueChapter && continueIdentity
    ? `${props.getOnlineChapterProgressLabel(continueIdentity, continueChapter)} · ${continueProgress?.lastReadAt ? props.formatRelativeTime(continueProgress.lastReadAt) : "最近阅读"}`
    : "从第一话开始建立你的在线续读轨迹"
  const primaryActionTitle = continueChapter
    ? `继续阅读 · 第 ${continueChapter.order} 话`
    : primaryChapter
      ? `开始阅读 · 第 ${primaryChapter.order} 话`
      : "暂无可阅读章节"
  const showLatestAction = Boolean(continueChapter && latestChapter && latestChapter.id !== continueChapter.id)
  const secondaryActionTitle = latestChapter ? `阅读最新 · 第 ${latestChapter.order} 话` : "暂无章节"
  const blockedKeywordHits = props.getOnlineComicBlockedKeywordHits(comic, props.blockedKeywords ?? [])
  const blockedStatusText = blockedKeywordHits.length > 0
    ? `命中 ${blockedKeywordHits.length} 个屏蔽词：${blockedKeywordHits.slice(0, 3).join("、")}${blockedKeywordHits.length > 3 ? " 等" : ""}`
    : "未命中屏蔽词"

  return (
    <V3ComicDetailContent
      comic={comic}
      chapters={chapters.value}
      recommendations={recommendations.value.filter(item => !props.filterComic(item, props.blockedKeywords ?? []))}
      coverURL={props.normalizeOnlineThumbUrl(comic.thumb, props.auth.host)}
      continueChapter={continueChapter ?? undefined}
      latestChapter={latestChapter ?? undefined}
      primaryChapter={primaryChapter ?? undefined}
      continueSubtitle={continueSubtitle}
      primaryActionTitle={primaryActionTitle}
      showLatestAction={showLatestAction}
      blockedKeywordHits={blockedKeywordHits}
      chapterAscending={chapterAscending.value}
      chapterLoading={chapterLoading.value}
      actionBusy={actionBusy.value}
      supportsMinimization={Script.supportsMinimization()}
      getChapterProgressLabel={(chapter) => props.getOnlineChapterProgressLabel({ sourceId, comicId: props.comicId, chapterId: chapter.id, chapterOrder: chapter.order }, chapter)}
      onOpenChapter={(chapter) => { openChapter(chapter).catch(() => { /**/ }) }}
      onToggleChapterOrder={() => chapterAscending.setValue(!chapterAscending.value)}
      onToggleFavourite={onlineAdapter.toggleFavourite ? () => { runComicAction("fav").catch(() => { /**/ }) } : undefined}
      onToggleLike={onlineAdapter.toggleLike ? () => { runComicAction("like").catch(() => { /**/ }) } : undefined}
      onOpenTag={(tag) => { openTagSearch(tag).catch(() => { /**/ }) }}
      onOpenRecommendations={() => { openDiscoveryResults(`相关推荐 · ${comic.title}`, recommendations.value, "基于当前作品的在线推荐结果").catch(() => { /**/ }) }}
      renderRecommendations={(items) => props.renderRecommendationList(items)}
      onMinimize={() => { Script.minimize().catch(() => { /**/ }) }}
      onClose={closeDetail}
      onReload={() => { load().catch(() => { /**/ }) }}
    />
  )
}
