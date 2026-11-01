import { Path } from "scripting"
import type { Color } from "scripting"
import type { ComicItem, OnlineComic } from "./types"

export const COVER_COLORS: Color[] = [
  "#6F79D8", "#4B8AE8", "#5FA8C5", "#67A98C",
  "#D9A45E", "#D48967", "#D16D66", "#9A80D6",
]

export const getDisplayName = (fileName: string): string =>
  Path.basename(fileName, Path.extname(fileName))

export const isImageFile = (name: string): boolean => {
  const l = name.toLowerCase()
  return l.endsWith(".jpg") || l.endsWith(".jpeg") || l.endsWith(".png") ||
    l.endsWith(".gif") || l.endsWith(".webp") || l.endsWith(".bmp")
}

export const getCoverColor = (name: string): Color => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  return COVER_COLORS[hash % COVER_COLORS.length]
}

export const getCoverInitial = (name: string): string =>
  getDisplayName(name).trim().charAt(0) || "?"

export const compareComicName = (a: ComicItem, b: ComicItem): number =>
  getDisplayName(a.name).localeCompare(getDisplayName(b.name), undefined, {
    numeric: true,
    sensitivity: "base",
  })

export const getProgressRatio = (comic: ComicItem): number => {
  if (comic.pageCount <= 0) return 0
  return Math.min(Math.max((comic.lastReadPage + 1) / comic.pageCount, 0), 1)
}

export const formatDate = (timestamp: number): string => {
  const d = new Date(timestamp)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return `${sameYear ? "" : `${d.getFullYear()}/`}${d.getMonth() + 1}/${d.getDate()}`
}

export const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return "刚刚阅读"
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`
  if (diff < 172_800_000) return "昨天"
  if (diff < 604_800_000) return `${Math.max(2, Math.floor(diff / 86_400_000))} 天前`
  return formatDate(timestamp)
}

export const parseTagInput = (input: string): string[] => input
  .split(/[，,\s#]+/)
  .map(t => t.trim())
  .filter((t, index, arr) => t.length > 0 && arr.indexOf(t) === index)
  .slice(0, 12)

export type OnlineBlockedKeywordScope = "all" | "title" | "author" | "tag"

export const normalizeKeyword = (value: string): string => value.trim().toLowerCase()

export const parseStoredBlockedKeyword = (entry: string): { scope: OnlineBlockedKeywordScope; value: string } => {
  const text = entry.trim()
  const match = text.match(/^(title|author|tag|标题|作者|标签)\s*[:：]\s*(.+)$/i)
  if (!match) return { scope: "all", value: text }
  const rawScope = match[1].toLowerCase()
  const scope: OnlineBlockedKeywordScope = rawScope === "title" || rawScope === "标题"
    ? "title"
    : rawScope === "author" || rawScope === "作者"
      ? "author"
      : "tag"
  return { scope, value: match[2].trim() }
}

export const encodeBlockedKeyword = (scope: OnlineBlockedKeywordScope, value: string): string => {
  const normalizedValue = value.trim().replace(/^#/, "")
  if (!normalizedValue) return ""
  return scope === "all" ? normalizedValue : `${scope}:${normalizedValue}`
}

export const formatBlockedKeywordLabel = (entry: string): string => {
  const parsed = parseStoredBlockedKeyword(entry)
  if (parsed.scope === "all") return parsed.value
  const label = parsed.scope === "title" ? "标题" : parsed.scope === "author" ? "作者" : "标签"
  return `${label}:${parsed.value}`
}

export const parseBlockedKeywordEditorInput = (input: string): string[] => input
  .split(/[，,\n]+/)
  .map(item => item.trim())
  .filter(Boolean)
  .map((item) => {
    const parsed = parseStoredBlockedKeyword(item)
    return encodeBlockedKeyword(parsed.scope, parsed.value)
  })
  .filter((item, index, arr) => item.length > 0 && arr.indexOf(item) === index)
  .slice(0, 24)

export const onlineComicMatchesPicaCategories = (comic: OnlineComic, blockedCategories: string[]): boolean => {
  if (blockedCategories.length === 0) return false
  const categories = comic.categories.map(normalizeKeyword)
  return blockedCategories.some(category => categories.includes(normalizeKeyword(category)))
}

export const onlineComicMatchesBlockedKeywords = (comic: OnlineComic, blockedKeywords: string[]): boolean => {
  if (blockedKeywords.length === 0) return false
  return blockedKeywords.some((entry) => {
    const parsed = parseStoredBlockedKeyword(entry)
    const target = normalizeKeyword(parsed.value)
    if (!target) return false
    const haystacks = parsed.scope === "title"
      ? [comic.title]
      : parsed.scope === "author"
        ? [comic.author]
        : parsed.scope === "tag"
          ? [...comic.categories, ...comic.tags]
          : [comic.title, comic.author, ...comic.categories, ...comic.tags]
    return haystacks.map(item => normalizeKeyword(String(item))).some(item => item.includes(target))
  })
}

export const getOnlineComicBlockedKeywordHits = (comic: OnlineComic, blockedKeywords: string[]): string[] => {
  if (blockedKeywords.length === 0) return []
  return blockedKeywords.filter((entry, index, arr) => {
    const parsed = parseStoredBlockedKeyword(entry)
    const target = normalizeKeyword(parsed.value)
    if (!target) return false
    if (arr.findIndex(item => normalizeKeyword(formatBlockedKeywordLabel(item)) === normalizeKeyword(formatBlockedKeywordLabel(entry))) !== index) return false
    const haystacks = parsed.scope === "title"
      ? [comic.title]
      : parsed.scope === "author"
        ? [comic.author]
        : parsed.scope === "tag"
          ? [...comic.categories, ...comic.tags]
          : [comic.title, comic.author, ...comic.categories, ...comic.tags]
    return haystacks.map(item => normalizeKeyword(String(item))).some(item => item.includes(target))
  }).map(formatBlockedKeywordLabel)
}
