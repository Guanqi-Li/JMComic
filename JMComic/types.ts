import type { ShapeStyle, Color, ColorScheme, DynamicShapeStyle } from "scripting"

export type ThemeStyle = ShapeStyle | DynamicShapeStyle

export type SourceContentRating = "safe" | "suggestive" | "nsfw"
export type SourceKind = "builtin" | "remote-adapter" | "script" | "local"
export type SourceListing = { id: string; title: string; kind?: "default" | "list" }
export type SourceFeatureFlags = {
  providesHome?: boolean
  providesListings?: boolean
  providesSearch?: boolean
  dynamicFilters?: boolean
  handlesImageRequests?: boolean
  supportsDeepLinks?: boolean
  supportsLogin?: boolean
  supportsLibrary?: boolean
}
export type SourceDescriptor = {
  id: string
  name: string
  version: number
  languages: string[]
  contentRating?: SourceContentRating
  iconUrl?: string
  downloadUrl?: string
  baseUrl?: string
  altNames?: string[]
  minAppVersion?: string
  maxAppVersion?: string
  kind: SourceKind
  adapterId: string
  runtimeConfig?: SourceRuntimeConfig
}
export type SourceRuntimeConfig = {
  sourceId: string
  languageSelectType?: "single" | "multiple"
  languages?: { code: string; label?: string; default?: boolean }[]
  listings?: SourceListing[]
  features?: SourceFeatureFlags
}
export type SourceCatalog = {
  id: string
  name: string
  url: string
  description?: string
  sources: SourceDescriptor[]
  updatedAt: number
}
export type SourceLanguageFilter = {
  id: string
  title: string
  description?: string
}

export type ComicSourceAdapter = {
  id: string
  name: string
  descriptor: () => SourceDescriptor
  requiresAuth?: boolean
  getCategories?: (auth: OnlineAuth) => Promise<OnlineCategory[]>
  getMangaList: (auth: OnlineAuth, params: { page?: number; category?: string; keyword?: string; sort?: OnlineSortMode; sourceLanguage?: string; translatedLanguage?: string }) => Promise<{ docs: OnlineComic[]; pages: number; page: number; total: number }>
  getMangaDetails: (auth: OnlineAuth, comicId: string) => Promise<OnlineComicDetails>
  getFavouriteState?: (comicId: string) => Promise<boolean>
  getChapterList: (auth: OnlineAuth, comicId: string) => Promise<OnlineChapter[]>
  getPageList: (auth: OnlineAuth, comicId: string, chapter: OnlineChapter) => Promise<OnlinePageImage[]>
  getRecommendations?: (auth: OnlineAuth, comicId: string) => Promise<OnlineComic[]>
  getHomeRecommendations?: () => Promise<OnlineComic[]>
  getFavourites?: (auth: OnlineAuth, page: number, sort: OnlineSortMode) => Promise<OnlineCollectionResult>
  getLeaderboard?: (auth: OnlineAuth, range: OnlineRankRange) => Promise<OnlineComic[]>
  getRandomComics?: (auth: OnlineAuth) => Promise<OnlineComic[]>
  toggleFavourite?: (auth: OnlineAuth, comicId: string) => Promise<OnlineActionResult>
  toggleLike?: (auth: OnlineAuth, comicId: string) => Promise<OnlineActionResult>
}
export type SourceHomeConfig = {
  navigationTitle: string
  heroTitle: string
  heroSubtitle: string
  loginRequiredMessage: string
  browseTitle?: string
  categoriesTitle?: string
  resultsTitle?: string
  discoverTitle?: string
  shelfTitle?: string
  sourceLanguageTitle?: string
  sourceLanguages?: SourceLanguageFilter[]
  translatedLanguageTitle?: string
  translatedLanguages?: SourceLanguageFilter[]
  hotKeywordLoader?: (auth: OnlineAuth) => Promise<string[]>
}

export type ComicItem = {
  id: string; name: string; path: string; size: string; sizeBytes: number
  ext: string; pageCount: number; lastReadPage: number; lastReadAt: number; modTime: number
  favorite: boolean; note: string; tags: string[]
}
export type PageItem = {
  id: string
  path?: string
  imageUrl?: string
  fallbackImageUrls?: string[]
  index: number
  loadLocalFile?: () => Promise<string>
}
export type ProgressData = { lastPage: number; totalPages: number; lastReadAt: number }
export type ComicMeta = { favorite?: boolean; note?: string; tags?: string[] }
export type ReadMode = "scroll-v" | "scroll-h" | "page-ltr" | "page-rtl"
export type SortMode = "recent" | "name" | "progress" | "unread" | "favorite" | "size"
export type LibraryViewMode = "grid" | "list"
export type MainTab = "discover" | "library" | "search" | "settings"
export type OnlineApiHost = "go2778" | "picacomic"
export type AppearanceMode = "auto" | "light" | "dark"
export type AppTheme = {
  scheme: ColorScheme
  pageBackground: ThemeStyle
  glassOuter: ThemeStyle
  glassInner: ThemeStyle
  sectionCard: ThemeStyle
  softFill: ThemeStyle
  softFillStrong: ThemeStyle
  iconChip: ThemeStyle
  iconChipTint: ThemeStyle
  iconChipWarning: ThemeStyle
  rowBackground: ThemeStyle
  rowProminentBackground: ThemeStyle
  cardOuter: ThemeStyle
  cardInner: ThemeStyle
  textPrimary: Color
  textSecondary: Color
  textTertiary: Color
  textMuted: Color
  pillInactiveOuter: ThemeStyle
  pillInactiveInner: ThemeStyle
  filterInactiveOuter: ThemeStyle
  filterInactiveInner: ThemeStyle
  neutralActiveOuter: ThemeStyle
  neutralActiveInner: ThemeStyle
  accentActiveOuter: ThemeStyle
  accentActiveInner: ThemeStyle
  successActiveOuter: ThemeStyle
  successActiveInner: ThemeStyle
  dangerActiveOuter: ThemeStyle
  dangerActiveInner: ThemeStyle
}
export type OnlineSortMode = "dd" | "da" | "ld" | "vd"
export type OnlineAuth = { email: string; password: string; token: string; host: OnlineApiHost }
export type OnlineThumb = { fileServer: string; path: string; originalName?: string }
export type OnlineCategory = { id: string; title: string; description: string; isWeb?: boolean; thumb: OnlineThumb }
export type OnlineComic = {
  id: string; title: string; author: string; categories: string[]; tags: string[]
  pagesCount: number; epsCount: number; finished: boolean; likesCount: number
  totalViews?: number; thumb: OnlineThumb
}
export type OnlineChapter = { id: string; title: string; order: number; updatedAt: string }
export type OnlineComicDetails = OnlineComic & {
  description: string; chineseTeam: string; totalLikes: number; totalComments: number
  totalViews: number; updatedAt: string; createdAt: string; allowDownload: boolean
  allowComment: boolean; isFavourite: boolean; isLiked: boolean
}
export type OnlinePageImage = { id: string; media: OnlineThumb; localFilePath?: string; loadLocalFile?: () => Promise<string> }
export type OnlineUserProfile = {
  id: string
  name: string
  title: string
  slogan: string
  level: number
  exp: number
  email: string
  verified: boolean
  isPunched: boolean
  character: string
  comicsUploaded: number
  createdAt: string
  avatar?: OnlineThumb
}
export type OnlineActionResult = { action: string }
export type OnlineCollectionResult = { docs: OnlineComic[]; page: number; pages: number; total: number }
export type OnlineRankRange = "H24" | "D7" | "D30"
export type OnlineMyComment = {
  id: string
  content: string
  createdAt: string
  likesCount: number
  commentsCount: number
  isLiked: boolean
  comicId?: string
  comicTitle?: string
}
export type OnlineNotificationItem = {
  id: string
  title: string
  content: string
  createdAt: string
  senderName: string
  senderTitle: string
  system: boolean
  redirectType: string
  redirectId: string
  comicId?: string
  cover?: OnlineThumb
}
export type OnlineProgressIdentity = {
  sourceId: string
  comicId: string
  chapterId: string
  chapterOrder: number
}
export type OnlineReadingRecord = {
  comicId: string
  comicTitle: string
  comicAuthor: string
  comicCover: OnlineThumb
  sourceId?: string
  chapterId?: string
  chapterTitle: string
  chapterOrder: number
  progressText: string
  lastReadAt: number
  host: OnlineApiHost
}
export type ReaderOnlineProgress = {
  sourceId?: string
  chapterId?: string
  comicId: string
  comicTitle: string
  comicAuthor: string
  comicCover: OnlineThumb
  chapterTitle: string
  chapterOrder: number
  host: OnlineApiHost
}

export type ReadModeConfig = { label: string; icon: string }
