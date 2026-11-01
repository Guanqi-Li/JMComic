import type {
  OnlineRankRange,
  OnlineSortMode,
  SourceCatalog,
  SourceContentRating,
  SourceDescriptor,
  SourceKind,
  SourceLanguageFilter,
  SourceRuntimeConfig,
} from "./types"

export const AIDOKU_COMMUNITY_CATALOG_URL = "https://aidoku-community.github.io/sources/index.min.json"

export const sourceContentRatingFromAidoku = (value: unknown): SourceContentRating => {
  if (value === 2 || value === "2") return "nsfw"
  if (value === 1 || value === "1") return "suggestive"
  return "safe"
}

export const buildAidokuSourceRuntimeConfig = (sourceId: string): SourceRuntimeConfig => ({
  sourceId,
  listings: [{ id: "browse", title: "目录浏览", kind: "default" }],
  features: {
    providesListings: true,
    providesSearch: true,
    supportsLibrary: true,
  },
})

export const normalizeCatalogResourceUrl = (catalogUrl: string, resourceUrl?: string): string | undefined => {
  if (typeof resourceUrl !== "string") return undefined
  const trimmed = resourceUrl.trim()
  if (!trimmed) return undefined
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const normalizedBase = catalogUrl.replace(/[#?].*$/, "")
  if (trimmed.startsWith("/")) {
    const match = normalizedBase.match(/^(https?:\/\/[^/]+)/i)
    return match ? `${match[1]}${trimmed}` : trimmed
  }
  const baseDir = normalizedBase.slice(0, normalizedBase.lastIndexOf("/") + 1)
  return `${baseDir}${trimmed}`
}

export const MANGADEX_API_ROOT = "https://api.mangadex.org"
export const MANGADEX_DEFAULT_LANGUAGE = "en"
export const MANGADEX_PREFERRED_LANGUAGES = ["zh", "zh-hk", "en", "ja", "ko"]
export const MANGADEX_SOURCE_LANGUAGE_FILTERS: SourceLanguageFilter[] = [
  { id: "all", title: "全部", description: "不过滤原作语言" },
  { id: "ja", title: "日漫", description: "原作语言为日文" },
  { id: "zh", title: "国漫", description: "原作语言为中文" },
  { id: "ko", title: "韩漫", description: "原作语言为韩文" },
  { id: "en", title: "英语", description: "原作语言为英文" },
]
export const MANGADEX_TRANSLATED_LANGUAGE_FILTERS: SourceLanguageFilter[] = [
  { id: "all", title: "全部", description: "不过滤翻译语言" },
  { id: "zh", title: "简中", description: "筛选中文翻译" },
  { id: "zh-hk", title: "繁中", description: "筛选繁体中文翻译" },
  { id: "en", title: "英语", description: "筛选英文翻译" },
  { id: "ja", title: "日语", description: "筛选日语翻译" },
  { id: "ko", title: "韩语", description: "筛选韩语翻译" },
]
export const MANGADEX_CATEGORY_SEEDS = ["Action", "Romance", "Comedy", "Fantasy", "Drama", "Adventure", "Slice of Life", "School Life", "Isekai", "Mystery"]

export const JM_DOMAIN_REFRESH_URLS = [
  "https://rup4a04-c01.tos-ap-southeast-1.bytepluses.com/newsvr-2025.txt",
  "https://rup4a04-c02.tos-cn-hongkong.bytepluses.com/newsvr-2025.txt",
] as const

export const JM_DOMAIN_REFRESH_SECRET = "diosfjckwpqpdfjkvnqQjsik"
export const JM_VERSION = "2.0.16"
export const JM_UA = "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36"
export const JM_PKG = "com.example.app"
export const JM_AUTH_KEY = "18comicAPPContent"
export const JM_DATA_SECRET = "185Hcomic3PAPP7R"
export const JM_WEB_URL = "https://18comic.vip"
export const JM_SCRAMBLE_ID = 220980
export const JM_PREFERRED_IMAGE_SHUNTS = [3, 2, 4, 1] as const
export const JM_CATEGORY_OPTIONS = [
  { id: "doujin", title: "同人" },
  { id: "single", title: "单本" },
  { id: "short", title: "短篇" },
  { id: "meiman", title: "英文" },
  { id: "hanmansfw", title: "一般向韩漫" },
  { id: "another_cosplay", title: "角色扮演" },
] as const
export const JM_TAG_KEYWORDS = [
  "禁漫汉化组", "剧情向", "校园", "纯爱", "人妻", "师生", "近亲", "百合",
  "YAOI", "性转", "NTR", "伪娘", "痴女", "全彩", "女性向", "萝莉",
  "御姐", "熟女", "正太", "巨乳", "贫乳", "女王", "教师", "女僕",
  "护士", "泳装", "眼镜", "连裤袜", "兔女郎", "群交", "足交", "SM",
  "肛交", "阿黑颜", "药物", "扶他", "调教", "野外露出", "催眠", "自慰",
  "触手", "兽交", "CG集", "重口", "猎奇", "非H", "血腥暴力",
] as const
export const JM_SOURCE_CATEGORY_FILTERS: SourceLanguageFilter[] = [
  { id: "all", title: "全部" },
  ...JM_CATEGORY_OPTIONS.map((item) => ({ id: item.id, title: item.title, description: `JMComic 类别 · ${item.title}` })),
]
export const JM_TAG_FILTERS: SourceLanguageFilter[] = [
  { id: "all", title: "全部" },
  ...JM_TAG_KEYWORDS.map((item) => ({ id: item, title: item, description: `JMComic 标签 · ${item}` })),
]
export const JM_ORDER_MAP: Record<OnlineSortMode, string> = {
  dd: "mr",
  da: "md",
  ld: "tf",
  vd: "mv",
}
export const JM_RANK_ORDER_MAP: Record<OnlineRankRange, string> = {
  H24: "md",
  D7: "mp",
  D30: "mv",
}

export const seedBuiltinSources = (): SourceDescriptor[] => [{
  id: "zh.jmcomic",
  name: "JMComic",
  version: 1,
  languages: ["zh"],
  contentRating: "nsfw",
  baseUrl: "https://18comic.vip",
  altNames: ["JMComic", "禁漫", "JM"],
  kind: "builtin",
  adapterId: "zh.jmcomic",
  runtimeConfig: {
    sourceId: "zh.jmcomic",
    languageSelectType: "single",
    languages: [{ code: "zh", label: "中文", default: true }],
    listings: [
      { id: "browse", title: "最新漫画", kind: "default" },
      { id: "likes", title: "最多爱心", kind: "list" },
      { id: "rank_h24", title: "日排行", kind: "list" },
      { id: "rank_d7", title: "月排行", kind: "list" },
      { id: "rank_d30", title: "总排行", kind: "list" },
      { id: "random", title: "随机发现", kind: "list" },
    ],
    features: {
      providesHome: true,
      providesListings: true,
      providesSearch: true,
      supportsLibrary: true,
      handlesImageRequests: true,
    },
  },
}]

export const allAvailableSources = (_catalogs: SourceCatalog[]): SourceDescriptor[] => (
  seedBuiltinSources()
)

export const isSourceInstalled = (installedSourceIds: string[], sourceId: string): boolean => installedSourceIds.includes(sourceId)

export const sourceKindLabel = (kind: SourceKind): string => (
  kind === "builtin" ? "内建适配器" : kind === "script" ? "脚本源" : kind === "local" ? "本地源" : "兼容占位"
)

export const sourceFeatureSummary = (source: SourceDescriptor): string => {
  const features = source.runtimeConfig?.features
  const parts: string[] = []
  if (features?.providesHome) parts.push("首页")
  if (features?.providesSearch) parts.push("搜索")
  if (features?.providesListings) parts.push("列表")
  if (features?.supportsLogin) parts.push("登录")
  if (features?.supportsLibrary) parts.push("书架")
  return parts.length > 0 ? parts.join(" · ") : "待接入"
}

export const sourceLanguageSummary = (source: SourceDescriptor): string => (
  source.languages.length > 0 ? source.languages.join(" / ") : "未标注语言"
)
