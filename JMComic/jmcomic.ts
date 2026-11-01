import { mapWithConcurrency } from "./async-utils"
import type { JMApiContext } from "./jm-request"
import { JM_CATEGORY_OPTIONS, JM_ORDER_MAP, JM_RANK_ORDER_MAP, JM_TAG_KEYWORDS } from "./source-definitions"
import type {
  ComicSourceAdapter,
  OnlineCategory,
  OnlineChapter,
  OnlineComic,
  OnlineComicDetails,
  OnlineThumb,
  SourceDescriptor,
} from "./types"

type JMComicItem = {
  id?: string | number
  album_id?: string | number
  comic_id?: string | number
  name?: string
  author?: string
  image?: string
  description?: string
  category?: { title?: string }
  category_sub?: { title?: string }
  url?: string
  link?: string
}

type JMSearchResp = {
  total?: string | number
  list?: JMComicItem[]
  content?: JMComicItem[]
}

type JMSeriesItem = {
  id?: string | number
  name?: string
  sort?: string | number
}

type JMAlbumResp = {
  name?: string
  description?: string
  addtime?: string
  author?: string[]
  works?: string[]
  tags?: string[]
  series?: JMSeriesItem[]
}

type JMChapterResp = {
  id?: string | number
  series_id?: string | number
  images?: string[]
}

type JMDeps = {
  ensureContext: () => Promise<JMApiContext>
  apiGet: <T>(domain: string, path: string, bearerToken?: string, ts?: number) => Promise<T>
  albumPath: (id: string) => string
  chapterPath: (id: string) => string
  searchPath: (query: string, order: string, category: string, page: number) => string
  filterPath: (order: string, category: string, page: number) => string
  resolveAbsoluteUrl: (url?: string) => string | undefined
  coverUrl: (cdnBase: string, id: string) => string
  buildAbsoluteOnlineThumb: (url?: string, originalName?: string) => OnlineThumb
  fetchPageToLocalFile: (url: string, namespace: string, cacheFileName: string, sourceFileName: string, epId: number) => Promise<string>
}

const jmSearchResultItems = (payload: JMSearchResp): JMComicItem[] => (
  Array.isArray(payload?.content) ? payload.content : Array.isArray(payload?.list) ? payload.list : []
)

const jmParseNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

const jmParseIdFromUrl = (value: string, marker: string): string | null => {
  const index = value.indexOf(marker)
  if (index < 0) return null
  const tail = value.slice(index + marker.length)
  const id = tail.split(/[/?#]/)[0] ?? ""
  return /^\d+$/.test(id) ? id : null
}

const jmResolveDirectMangaKey = async (query: string, ctx: JMApiContext, deps: JMDeps): Promise<string | null> => {
  const trimmed = query.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return trimmed
  const albumId = jmParseIdFromUrl(trimmed, "/album/")
  if (albumId) return albumId
  const chapterId = jmParseIdFromUrl(trimmed, "/photo/")
  if (!chapterId) return null
  const chapter = await deps.apiGet<JMChapterResp>(ctx.domain, deps.chapterPath(chapterId))
  const seriesId = String(chapter?.series_id ?? "").trim()
  return seriesId && seriesId !== "0" ? seriesId : chapterId
}

const jmDetectFinished = (tags: string[]): boolean => tags.some((tag) => tag === "完结" || tag === "已完结")
const jmDisplayAuthor = (authors: string[]): string => authors.filter(Boolean).join(" / ") || "禁漫天堂"

const jmExtractComicId = (item: JMComicItem): string => {
  const directCandidates = [item?.id, item?.album_id, item?.comic_id]
  for (const candidate of directCandidates) {
    const value = String(candidate ?? "").trim()
    if (/^\d+$/.test(value)) return value
  }
  const urlCandidates = [item?.url, item?.link, item?.image]
  for (const candidate of urlCandidates) {
    const value = String(candidate ?? "").trim()
    if (!value) continue
    const albumId = jmParseIdFromUrl(value, "/album/")
    if (albumId) return albumId
    const photoId = jmParseIdFromUrl(value, "/photo/")
    if (photoId) return photoId
    const mediaAlbumMatch = value.match(/\/media\/albums\/(\d+)(?:_[^./]+)?\.[a-z0-9]+(?:$|[?#])/i)
    if (mediaAlbumMatch?.[1]) return mediaAlbumMatch[1]
  }
  return String(item?.id ?? item?.album_id ?? item?.comic_id ?? "").trim()
}

const jmParseComicItem = (item: JMComicItem, cdnBase: string, deps: JMDeps): OnlineComic => {
  const id = jmExtractComicId(item)
  const categoryTitle = String(item?.category?.title ?? "").trim()
  const subCategoryTitle = String(item?.category_sub?.title ?? "").trim()
  const tags = [categoryTitle, subCategoryTitle].filter(Boolean)
  return {
    id,
    title: String(item?.name ?? "未命名漫画"),
    author: String(item?.author ?? "禁漫天堂"),
    categories: tags,
    tags,
    pagesCount: 0,
    epsCount: 0,
    finished: false,
    likesCount: 0,
    totalViews: 0,
    thumb: deps.buildAbsoluteOnlineThumb(deps.resolveAbsoluteUrl(item?.image) ?? deps.coverUrl(cdnBase, id), String(item?.name ?? id)),
  }
}

const jmChapterNumber = (sort: unknown, index: number): number => {
  const value = jmParseNumber(sort, 0)
  return value > 0 ? value : index + 1
}

const jmFormatChapterNumber = (value: number): string => Number.isInteger(value) ? `${value}` : `${value}`.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")

const jmChapterTitle = (item: JMSeriesItem, index: number): string => {
  const name = String(item?.name ?? "").trim()
  if (name) return name
  return `第${jmFormatChapterNumber(jmChapterNumber(item?.sort, index))}話`
}

const jmParseAlbumDetail = (comicId: string, payload: JMAlbumResp, cdnBase: string, deps: JMDeps): OnlineComicDetails => {
  const tags = Array.isArray(payload?.tags) ? payload.tags.map((value) => String(value)).filter(Boolean) : []
  const works = Array.isArray(payload?.works) ? payload.works.map((value) => String(value)).filter(Boolean) : []
  const authors = Array.isArray(payload?.author) ? payload.author.map((value) => String(value)).filter(Boolean) : []
  const series = Array.isArray(payload?.series) ? payload.series : []
  return {
    id: comicId,
    title: String(payload?.name ?? "未命名漫画"),
    author: jmDisplayAuthor(authors),
    categories: works,
    tags,
    pagesCount: 0,
    epsCount: Math.max(series.length, 1),
    finished: jmDetectFinished(tags),
    likesCount: 0,
    totalViews: 0,
    thumb: deps.buildAbsoluteOnlineThumb(deps.coverUrl(cdnBase, comicId), String(payload?.name ?? comicId)),
    description: String(payload?.description ?? ""),
    chineseTeam: works.slice(0, 3).join(" / "),
    totalLikes: 0,
    totalComments: 0,
    updatedAt: String(payload?.addtime ?? ""),
    createdAt: String(payload?.addtime ?? ""),
    allowDownload: true,
    allowComment: false,
    isFavourite: false,
    isLiked: false,
  }
}

const jmParseChapters = (comicId: string, payload: JMAlbumResp): OnlineChapter[] => {
  const series = Array.isArray(payload?.series) ? [...payload.series] : []
  if (series.length === 0) {
    return [{ id: comicId, title: "第1話", order: 1, updatedAt: String(payload?.addtime ?? "") }]
  }
  series.sort((left, right) => {
    const leftSort = jmParseNumber(left?.sort, 0)
    const rightSort = jmParseNumber(right?.sort, 0)
    if (leftSort > 0 && rightSort > 0 && leftSort !== rightSort) return leftSort - rightSort
    if (leftSort > 0 && rightSort <= 0) return -1
    if (leftSort <= 0 && rightSort > 0) return 1
    return String(left?.id ?? "").localeCompare(String(right?.id ?? ""), undefined, { numeric: true })
  })
  return series.map((item, index) => ({
    id: String(item?.id ?? `${comicId}_${index + 1}`),
    title: jmChapterTitle(item, index),
    order: jmChapterNumber(item?.sort, index),
    updatedAt: String(payload?.addtime ?? ""),
  })).reverse()
}

const jmBuildRandomKeyword = (): string => JM_TAG_KEYWORDS[Math.floor(Math.random() * JM_TAG_KEYWORDS.length)] ?? "纯爱"

export const createJMComicAdapter = (source: SourceDescriptor, deps: JMDeps): ComicSourceAdapter => {
  let cachedCategories: OnlineCategory[] | null = null
  const albums = new Map<string, { expires: number; task: Promise<{ ctx: JMApiContext; comicId: string; album: JMAlbumResp }> }>()

  const loadAlbum = async (comicId: string): Promise<{ ctx: JMApiContext; comicId: string; album: JMAlbumResp }> => {
    const cached = albums.get(comicId)
    if (cached && cached.expires > Date.now()) return cached.task
    const task = (async () => {
      const ctx = await deps.ensureContext()
      const normalizedId = await jmResolveDirectMangaKey(comicId, ctx, deps).catch(() => null)
      const resolvedComicId = String(normalizedId ?? comicId).trim()
      const album = await deps.apiGet<JMAlbumResp>(ctx.domain, deps.albumPath(resolvedComicId))
      return { ctx, comicId: resolvedComicId, album }
    })().catch(error => { albums.delete(comicId); throw error })
    albums.set(comicId, { expires: Date.now() + 120000, task })
    if (albums.size > 64) albums.delete(albums.keys().next().value!)
    return task
  }

  return {
    id: `jmcomic:${source.id}`,
    name: `${source.name} 真实适配器`,
    descriptor: () => source,
    requiresAuth: false,
    getCategories: async () => {
      if (cachedCategories) return cachedCategories
      const nextCategories: OnlineCategory[] = JM_CATEGORY_OPTIONS.map((item, index) => ({
        id: item.id,
        title: item.title,
        description: `JMComic 类别 · ${item.title}`,
        thumb: deps.buildAbsoluteOnlineThumb(source.iconUrl, `${source.name}_${index}`),
      }))
      cachedCategories = nextCategories
      return nextCategories
    },
    getMangaList: async (_auth, params) => {
      const ctx = await deps.ensureContext()
      const page = Math.max(1, Number(params.page ?? 1))
      const order = JM_ORDER_MAP[params.sort ?? "dd"] ?? "mr"
      const categoryMap = Object.fromEntries(JM_CATEGORY_OPTIONS.map((item) => [item.title, item.id])) as Record<string, string>
      const sourceCategory = params.sourceLanguage && params.sourceLanguage !== "all" ? params.sourceLanguage : ""
      const legacyCategory = params.category ? (categoryMap[params.category] ?? params.category) : ""
      const category = sourceCategory || legacyCategory
      const tagKeyword = params.translatedLanguage && params.translatedLanguage !== "all" ? params.translatedLanguage : ""
      const keyword = String(params.keyword ?? tagKeyword).trim()
      const directMangaKey = keyword ? await jmResolveDirectMangaKey(keyword, ctx, deps).catch(() => null) : null
      if (directMangaKey && page === 1 && !category) {
        const album = await deps.apiGet<JMAlbumResp>(ctx.domain, deps.albumPath(directMangaKey))
        const doc = jmParseAlbumDetail(directMangaKey, album, ctx.cdnBase, deps)
        return { docs: [doc], page: 1, pages: 1, total: 1 }
      }
      const path = keyword ? deps.searchPath(keyword, order, category, page) : deps.filterPath(order, category, page)
      const payload = await deps.apiGet<JMSearchResp>(ctx.domain, path)
      const docs = jmSearchResultItems(payload).map((item) => jmParseComicItem(item, ctx.cdnBase, deps))
      const total = Math.max(docs.length, jmParseNumber(payload?.total, docs.length))
      const pageSize = docs.length > 0 ? docs.length : 80
      return {
        docs,
        page,
        pages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
        total,
      }
    },
    getMangaDetails: async (_auth, comicId) => {
      const { ctx, comicId: resolvedComicId, album } = await loadAlbum(comicId)
      return jmParseAlbumDetail(resolvedComicId, album, ctx.cdnBase, deps)
    },
    getChapterList: async (_auth, comicId) => {
      const { comicId: resolvedComicId, album } = await loadAlbum(comicId)
      return jmParseChapters(resolvedComicId, album)
    },
    getPageList: async (_auth, _comicId, chapter) => {
      const ctx = await deps.ensureContext()
      const payload = await deps.apiGet<JMChapterResp>(ctx.domain, deps.chapterPath(chapter.id))
      const episodeId = String(payload?.id ?? chapter.id)
      const images = Array.isArray(payload?.images) ? payload.images : []
      if (images.length === 0) throw new Error("JMComic 章节图片为空")
      const epNumber = jmParseNumber(episodeId, jmParseNumber(chapter.id, 0))
      return images.map((fileName, index) => {
        const imageUrl = `${ctx.cdnBase}/media/photos/${episodeId}/${fileName}`
        let task: Promise<string> | undefined
        return {
          id: `${chapter.id}_${index}`,
          media: deps.buildAbsoluteOnlineThumb(imageUrl, `${chapter.title}_${index + 1}`),
          loadLocalFile: () => {
            if (!task) task = deps.fetchPageToLocalFile(imageUrl, chapter.id, `${index + 1}_${fileName}`, fileName, epNumber)
              .catch(error => { task = undefined; throw error })
            return task
          },
        }
      })
    },
    getRecommendations: async (_auth, comicId) => {
      const detail = await loadAlbum(comicId).then(result => result.album).catch(() => ({} as JMAlbumResp))
      const keyword = String((detail?.tags ?? detail?.works ?? []).find(Boolean) ?? jmBuildRandomKeyword())
      const ctx = await deps.ensureContext()
      const payload = await deps.apiGet<JMSearchResp>(ctx.domain, deps.searchPath(keyword, "mr", "", 1)).catch(() => ({ content: [] }))
      return jmSearchResultItems(payload).map((item) => jmParseComicItem(item, ctx.cdnBase, deps)).filter((item) => item.id !== comicId).slice(0, 6)
    },
    getLeaderboard: async (_auth, range) => {
      const ctx = await deps.ensureContext()
      const order = JM_RANK_ORDER_MAP[range] ?? "mv"
      const payload = await deps.apiGet<JMSearchResp>(ctx.domain, deps.filterPath(order, "", 1))
      return jmSearchResultItems(payload).map((item) => jmParseComicItem(item, ctx.cdnBase, deps)).slice(0, 24)
    },
    getRandomComics: async () => {
      const ctx = await deps.ensureContext()
      const items = await Promise.all(Array.from({ length: 6 }, async () => {
        const payload = await deps.apiGet<JMSearchResp>(ctx.domain, deps.searchPath(jmBuildRandomKeyword(), "mr", "", 1)).catch(() => ({ content: [] }))
        const docs = jmSearchResultItems(payload)
        if (docs.length === 0) return null
        const picked = docs[Math.floor(Math.random() * docs.length)]
        return picked ? jmParseComicItem(picked, ctx.cdnBase, deps) : null
      }))
      return items.filter((item): item is OnlineComic => Boolean(item))
    },
  }
}
