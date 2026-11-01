import type { ComicItem, ReadMode } from "./types"

export const clampPage = (page: number, total: number): number => {
  if (total <= 0) return 0
  return Math.min(Math.max(Math.round(page), 0), total - 1)
}

export const getReaderPercent = (page: number, total: number): number => {
  if (total <= 0) return 0
  return Math.round(((clampPage(page, total) + 1) / total) * 100)
}

export const formatReaderProgress = (page: number, total: number): string => {
  if (total <= 0) return "0%"
  return `${getReaderPercent(page, total)}%`
}

export const hasStoredReadingProgress = (comic: ComicItem): boolean => comic.pageCount > 0

export const getCompletionState = (comic: ComicItem): "unread" | "reading" | "finished" => {
  if (!hasStoredReadingProgress(comic)) return "unread"
  if (comic.lastReadPage >= comic.pageCount - 1) return "finished"
  return "reading"
}

export const getCompletionLabel = (comic: ComicItem): string => {
  const state = getCompletionState(comic)
  if (state === "finished") return "已读完"
  if (state === "reading") return `读到 ${comic.lastReadPage + 1}/${comic.pageCount}`
  return "未读"
}

export const selectionFromRealPage = (page: number, total: number, mode: ReadMode): number => {
  const safe = clampPage(page, total)
  return mode === "page-rtl" && total > 0 ? total - 1 - safe : safe
}

export const realPageFromSelection = (selection: number, total: number, mode: ReadMode): number => {
  const safe = clampPage(selection, total)
  return mode === "page-rtl" && total > 0 ? total - 1 - safe : safe
}

export const shouldRenderPageImage = (
  index: number,
  currentPage: number,
  total: number,
  mode: ReadMode,
): boolean => {
  if (mode !== "page-ltr" && mode !== "page-rtl") return true
  const distance = Math.abs(index - currentPage)
  return distance <= 2
}
