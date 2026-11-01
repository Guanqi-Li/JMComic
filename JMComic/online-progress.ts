import type { OnlineChapter, OnlineComic, OnlineProgressIdentity, OnlineReadingRecord } from "./types"

export const onlineStatText = (label: string, value: string): string => `${label} · ${value}`

export const getOnlineContinueChapter = (
  sourceId: string,
  comicId: string,
  chapters: OnlineChapter[],
  deps: {
    getOnlineChapterProgress: (identity: OnlineProgressIdentity) => { totalPages: number; lastReadAt: number }
  },
): OnlineChapter | null => {
  let best: { chapter: OnlineChapter; lastReadAt: number } | null = null
  for (const chapter of chapters) {
    const prog = deps.getOnlineChapterProgress({ sourceId, comicId, chapterId: chapter.id, chapterOrder: chapter.order })
    if (prog.totalPages <= 0 || prog.lastReadAt <= 0) continue
    if (!best || prog.lastReadAt > best.lastReadAt) best = { chapter, lastReadAt: prog.lastReadAt }
  }
  return best?.chapter ?? null
}

export const getOnlineComicProgress = (
  sourceId: string,
  comic: OnlineComic,
  deps: {
    loadOnlineReadingHistory: () => OnlineReadingRecord[]
    getOnlineChapterProgress: (identity: OnlineProgressIdentity) => { totalPages: number; lastPage: number }
    getOnlineChapterProgressLabel: (identity: OnlineProgressIdentity, chapter: OnlineChapter) => string
    clampPage: (page: number, totalPages: number) => number
  },
): { completed: number; total: number; fraction: number; label: string } => {
  const records = deps.loadOnlineReadingHistory().filter(item => item.comicId === comic.id && (item.sourceId ?? "pica-online") === sourceId)
  if (records.length === 0) return { completed: 0, total: Math.max(comic.epsCount, 1), fraction: 0, label: "未开始" }
  const latest = records.sort((a, b) => b.lastReadAt - a.lastReadAt)[0]
  const identity = {
    sourceId,
    comicId: comic.id,
    chapterId: latest.chapterId ?? String(latest.chapterOrder),
    chapterOrder: latest.chapterOrder,
  }
  const prog = deps.getOnlineChapterProgress(identity)
  const chapterProgress = prog.totalPages > 0 ? Math.min((deps.clampPage(prog.lastPage, prog.totalPages) + 1) / Math.max(prog.totalPages, 1), 1) : 0
  const total = Math.max(comic.epsCount, 1)
  const completed = Math.min(Math.max(latest.chapterOrder - 1, 0) + chapterProgress, total)
  const fraction = Math.min(completed / total, 1)
  return {
    completed,
    total,
    fraction,
    label: prog.totalPages > 0
      ? `第 ${latest.chapterOrder} 话 · ${deps.getOnlineChapterProgressLabel(identity, { id: identity.chapterId, title: latest.chapterTitle, order: latest.chapterOrder, updatedAt: "" })}`
      : `第 ${latest.chapterOrder} 话 · 待读取`,
  }
}
