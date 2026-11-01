import { seedBuiltinSources } from "./source-definitions"
import { loadProgress, saveProgressData } from "./library-storage"
import type {
  OnlineApiHost,
  OnlineAuth,
  OnlineChapter,
  OnlineProgressIdentity,
  OnlineReadingRecord,
  OnlineThumb,
  ProgressData,
  SourceCatalog,
  SourceDescriptor,
  SourceRuntimeConfig,
} from "./types"

const ONLINE_AUTH_KEY = "comic_online_auth"
const ONLINE_SEARCH_HISTORY_KEY = "comic_online_search_history"
const ONLINE_READING_HISTORY_KEY = "comic_online_reading_history"
const ONLINE_BLOCKED_KEYWORDS_KEY = "comic_online_blocked_keywords"
const PICA_BLOCKED_CATEGORIES_KEY = "comic_pica_blocked_categories"
const REMOTE_SOURCE_CATALOGS_KEY = "comic_remote_source_catalogs"
const INSTALLED_SOURCES_KEY = "comic_installed_sources"

export const loadOnlineAuth = (): OnlineAuth => {
  const raw = Storage.get<string>(ONLINE_AUTH_KEY)
  if (!raw) return { email: "", password: "", token: "", host: "go2778" }
  try {
    const parsed = JSON.parse(raw) as Partial<OnlineAuth>
    return {
      email: typeof parsed.email === "string" ? parsed.email : "",
      password: typeof parsed.password === "string" ? parsed.password : "",
      token: typeof parsed.token === "string" ? parsed.token : "",
      host: parsed.host === "picacomic" ? "picacomic" : "go2778",
    }
  } catch {
    return { email: "", password: "", token: "", host: "go2778" }
  }
}

export const saveOnlineAuth = (auth: OnlineAuth): void => {
  Storage.set(ONLINE_AUTH_KEY, JSON.stringify(auth))
}

export const clearOnlineToken = (): void => {
  const auth = loadOnlineAuth()
  saveOnlineAuth({ ...auth, token: "" })
}

export const loadOnlineSearchHistory = (): string[] => {
  const raw = Storage.get<string>(ONLINE_SEARCH_HISTORY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown[]
    return parsed.filter(item => typeof item === "string").slice(0, 12) as string[]
  } catch {
    return []
  }
}

export const saveOnlineSearchHistory = (items: string[]): void => {
  Storage.set(ONLINE_SEARCH_HISTORY_KEY, JSON.stringify(items.slice(0, 12)))
}

export const loadOnlineReadingHistory = (): OnlineReadingRecord[] => {
  const raw = Storage.get<string>(ONLINE_READING_HISTORY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<OnlineReadingRecord>[]
    return parsed
      .filter(item => item && typeof item.comicId === "string" && typeof item.chapterOrder === "number")
      .map((item): OnlineReadingRecord => ({
        comicId: String(item.comicId),
        comicTitle: String(item.comicTitle ?? "在线漫画"),
        comicAuthor: String(item.comicAuthor ?? ""),
        comicCover: item.comicCover as OnlineThumb,
        sourceId: typeof item.sourceId === "string" ? item.sourceId : undefined,
        chapterId: typeof item.chapterId === "string" ? item.chapterId : undefined,
        chapterTitle: String(item.chapterTitle ?? `第 ${Number(item.chapterOrder ?? 1)} 话`),
        chapterOrder: Number(item.chapterOrder ?? 1),
        progressText: String(item.progressText ?? "继续阅读"),
        lastReadAt: Number(item.lastReadAt ?? 0),
        host: item.host === "picacomic" ? "picacomic" : "go2778",
      }))
      .sort((a, b) => b.lastReadAt - a.lastReadAt)
      .slice(0, 12)
  } catch {
    return []
  }
}

export const saveOnlineReadingHistory = (items: OnlineReadingRecord[]): void => {
  Storage.set(ONLINE_READING_HISTORY_KEY, JSON.stringify(items.slice(0, 12)))
}

export const loadOnlineBlockedKeywords = (): string[] => {
  const raw = Storage.get<string>(ONLINE_BLOCKED_KEYWORDS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown[]
    return parsed
      .filter(item => typeof item === "string")
      .map(item => String(item).trim())
      .filter((item, index, arr) => item.length > 0 && arr.indexOf(item) === index)
      .slice(0, 24)
  } catch {
    return []
  }
}

export const saveOnlineBlockedKeywords = (items: string[]): void => {
  Storage.set(ONLINE_BLOCKED_KEYWORDS_KEY, JSON.stringify(items.slice(0, 24)))
}

export const loadPicaBlockedCategories = (): string[] => {
  const raw = Storage.get<string>(PICA_BLOCKED_CATEGORIES_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown[]
    return parsed
      .filter(item => typeof item === "string")
      .map(item => String(item).trim())
      .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index)
  } catch {
    return []
  }
}

export const savePicaBlockedCategories = (items: string[]): void => {
  Storage.set(PICA_BLOCKED_CATEGORIES_KEY, JSON.stringify(items))
}

export const loadRemoteSourceCatalogs = (): SourceCatalog[] => {
  const raw = Storage.get<string>(REMOTE_SOURCE_CATALOGS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<SourceCatalog>[]
    return parsed
      .filter(item => item && typeof item.id === "string" && typeof item.name === "string")
      .map((item): SourceCatalog => ({
        id: String(item.id),
        name: String(item.name),
        url: String(item.url ?? ""),
        description: typeof item.description === "string" ? item.description : "",
        updatedAt: Number(item.updatedAt ?? 0),
        sources: Array.isArray(item.sources)
          ? item.sources.filter(Boolean).map((source: any): SourceDescriptor => ({
            id: String(source.id ?? ""),
            name: String(source.name ?? "未命名源"),
            version: Number(source.version ?? 1),
            languages: Array.isArray(source.languages) ? source.languages.map((v: unknown) => String(v)) : [],
            contentRating: source.contentRating === "nsfw" || source.contentRating === "suggestive" ? source.contentRating : "safe",
            iconUrl: typeof source.iconUrl === "string" ? source.iconUrl : undefined,
            downloadUrl: typeof source.downloadUrl === "string" ? source.downloadUrl : undefined,
            baseUrl: typeof source.baseUrl === "string" ? source.baseUrl : undefined,
            altNames: Array.isArray(source.altNames) ? source.altNames.map((v: unknown) => String(v)) : [],
            minAppVersion: typeof source.minAppVersion === "string" ? source.minAppVersion : undefined,
            maxAppVersion: typeof source.maxAppVersion === "string" ? source.maxAppVersion : undefined,
            kind: source.kind === "builtin" || source.kind === "script" || source.kind === "local" ? source.kind : "remote-adapter",
            adapterId: typeof source.adapterId === "string" ? source.adapterId : "remote-catalog",
            runtimeConfig: source.runtimeConfig as SourceRuntimeConfig | undefined,
          }))
          : [],
      }))
  } catch {
    return []
  }
}

export const saveRemoteSourceCatalogs = (items: SourceCatalog[]): void => {
  Storage.set(REMOTE_SOURCE_CATALOGS_KEY, JSON.stringify(items))
}

export const loadInstalledSources = (): string[] => {
  const raw = Storage.get<string>(INSTALLED_SOURCES_KEY)
  if (!raw) return seedBuiltinSources().map(item => item.id)
  try {
    const parsed = JSON.parse(raw) as unknown[]
    const values = parsed.filter(item => typeof item === "string").map(item => String(item))
    return Array.from(new Set([...seedBuiltinSources().map(item => item.id), ...values]))
  } catch {
    return seedBuiltinSources().map(item => item.id)
  }
}

export const saveInstalledSources = (items: string[]): void => {
  Storage.set(INSTALLED_SOURCES_KEY, JSON.stringify(Array.from(new Set([...seedBuiltinSources().map(item => item.id), ...items]))))
}

const onlineHistorySourceId = (record: Pick<OnlineReadingRecord, "sourceId">): string => record.sourceId ?? "pica-online"

export const onlineReadingRecordsMatch = (
  left: Pick<OnlineReadingRecord, "sourceId" | "comicId" | "chapterId" | "chapterOrder">,
  right: Pick<OnlineReadingRecord, "sourceId" | "comicId" | "chapterId" | "chapterOrder">,
): boolean => {
  if (onlineHistorySourceId(left) !== onlineHistorySourceId(right) || left.comicId !== right.comicId) return false
  if (left.chapterId && right.chapterId) return left.chapterId === right.chapterId
  return left.chapterOrder === right.chapterOrder
}

export const removeOnlineReadingHistoryRecord = (record: Pick<OnlineReadingRecord, "sourceId" | "comicId" | "chapterOrder" | "chapterId">): OnlineReadingRecord[] => {
  const next = loadOnlineReadingHistory().filter(item => !onlineReadingRecordsMatch(item, record))
  saveOnlineReadingHistory(next)
  return next
}

export const clearOnlineReadingHistory = (): void => {
  Storage.remove(ONLINE_READING_HISTORY_KEY)
}

export const pushOnlineReadingHistory = (record: OnlineReadingRecord): OnlineReadingRecord[] => {
  const next = [
    record,
    ...loadOnlineReadingHistory().filter(item => !onlineReadingRecordsMatch(item, record)),
  ].slice(0, 12)
  saveOnlineReadingHistory(next)
  return next
}

const encodeOnlineProgressPart = (value: string): string => encodeURIComponent(value.trim() || "unknown")
const buildLegacyOnlineReaderProgressKey = (comicId: string, order: number): string => `online_reader_${comicId}_${order}`

export const buildOnlineReaderProgressKey = (identity: OnlineProgressIdentity): string => (
  `online_reader_v2_${encodeOnlineProgressPart(identity.sourceId)}_${encodeOnlineProgressPart(identity.comicId)}_${encodeOnlineProgressPart(identity.chapterId)}_${identity.chapterOrder}`
)

const hasOnlineProgress = (progress: ProgressData): boolean => progress.totalPages > 0 || progress.lastReadAt > 0

export const getOnlineChapterProgress = (identity: OnlineProgressIdentity): ProgressData => {
  const key = buildOnlineReaderProgressKey(identity)
  const current = loadProgress(key)
  if (hasOnlineProgress(current)) return current

  const legacy = loadProgress(buildLegacyOnlineReaderProgressKey(identity.comicId, identity.chapterOrder))
  if (hasOnlineProgress(legacy)) {
    saveProgressData(key, legacy.lastPage, legacy.totalPages, legacy.lastReadAt)
  }
  return legacy
}

export const getOnlineChapterProgressLabel = (identity: OnlineProgressIdentity, chapter: OnlineChapter): string => {
  const prog = getOnlineChapterProgress({ ...identity, chapterId: chapter.id, chapterOrder: chapter.order })
  if (prog.totalPages <= 0) return "未开始"
  const page = Math.min(Math.max(prog.lastPage + 1, 1), prog.totalPages)
  return `${page}/${prog.totalPages} 页`
}
