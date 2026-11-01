import { Path } from "scripting"
import type {
  ComicItem,
  ComicMeta,
  LibraryViewMode,
  ProgressData,
  ReadMode,
  SortMode,
} from "./types"

const LIBRARY_VIEW_KEY = "comic_library_view_mode"
const LIBRARY_SORT_KEY = "comic_library_sort_mode"
const EXPERIENCE_IMPORT_GUIDE_SEEN_KEY = "comic_experience_import_guide_seen"

export const getComicsDir = (): string => {
  const dir = Path.join(FileManager.documentsDirectory, "Comics")
  if (!FileManager.existsSync(dir)) FileManager.createDirectorySync(dir, true)
  return dir
}

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

export const makeUniqueFileName = (dir: string, fileName: string): string => {
  const ext = Path.extname(fileName)
  const base = Path.basename(fileName, ext)
  let candidate = fileName
  let index = 2
  while (FileManager.existsSync(Path.join(dir, candidate))) {
    candidate = `${base} (${index})${ext}`
    index++
  }
  return candidate
}

export const cleanupTempComicCaches = (): void => {
  try {
    const tmp = FileManager.temporaryDirectory
    for (const name of FileManager.readDirectorySync(tmp)) {
      if (!name.startsWith("comic_") && !name.startsWith("pdf_")) continue
      const path = Path.join(tmp, name)
      try { FileManager.removeSync(path) } catch { /**/ }
    }
  } catch { /**/ }
}

const normalizeProgress = (progress: Partial<ProgressData>): ProgressData => {
  const totalPages = Number.isFinite(progress.totalPages) ? Math.max(0, Math.floor(progress.totalPages!)) : 0
  return {
    totalPages,
    lastPage: totalPages > 0 && Number.isFinite(progress.lastPage) ? Math.min(totalPages - 1, Math.max(0, Math.floor(progress.lastPage!))) : 0,
    lastReadAt: Number.isFinite(progress.lastReadAt) ? Math.max(0, progress.lastReadAt!) : 0,
  }
}

export const loadProgress = (name: string): ProgressData => {
  const raw = Storage.get<string>(`comic_${name}`)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ProgressData>
      return normalizeProgress(parsed)
    } catch { /**/ }
  }
  return { lastPage: 0, totalPages: 0, lastReadAt: 0 }
}

export const saveProgressData = (name: string, page: number, total: number, lastReadAt?: number): void => {
  Storage.set(`comic_${name}`, JSON.stringify(normalizeProgress({
    lastPage: page,
    totalPages: total,
    lastReadAt: typeof lastReadAt === "number" ? lastReadAt : (total > 0 ? Date.now() : 0),
  })))
}

export const metaKey = (name: string): string => `comic_meta_${name}`

export const loadMeta = (name: string): ComicMeta => {
  const raw = Storage.get<string>(metaKey(name))
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as ComicMeta
    return {
      favorite: parsed.favorite === true,
      note: typeof parsed.note === "string" ? parsed.note : "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter(t => typeof t === "string") : [],
    }
  } catch {
    return {}
  }
}

export const saveMeta = (name: string, meta: ComicMeta): void => {
  Storage.set(metaKey(name), JSON.stringify({
    favorite: meta.favorite === true,
    note: meta.note ?? "",
    tags: meta.tags ?? [],
  }))
}

export const migrateMeta = (oldName: string, newName: string): void => {
  const meta = loadMeta(oldName)
  if (meta.favorite || meta.note || (meta.tags && meta.tags.length > 0)) saveMeta(newName, meta)
  Storage.remove(metaKey(oldName))
}

export const loadLibraryViewMode = (): LibraryViewMode => {
  const raw = Storage.get<string>(LIBRARY_VIEW_KEY)
  return raw === "list" ? "list" : "grid"
}

export const saveLibraryViewMode = (mode: LibraryViewMode): void => {
  Storage.set(LIBRARY_VIEW_KEY, mode)
}

export const loadSortMode = (): SortMode => {
  const raw = Storage.get<string>(LIBRARY_SORT_KEY)
  if (raw === "recent" || raw === "name" || raw === "progress" || raw === "unread" || raw === "favorite" || raw === "size") return raw
  return "recent"
}

export const saveSortMode = (mode: SortMode): void => {
  Storage.set(LIBRARY_SORT_KEY, mode)
}

export const loadReadMode = (name: string): ReadMode => {
  const raw = Storage.get<string>(`readmode_${name}`)
  if (raw === "scroll-v" || raw === "scroll-h" || raw === "page-ltr" || raw === "page-rtl") return raw
  return "scroll-v"
}

export const saveReadMode = (name: string, mode: ReadMode): void => {
  Storage.set(`readmode_${name}`, mode)
}

export const loadImportGuideSeen = (): boolean => Storage.get<string>(EXPERIENCE_IMPORT_GUIDE_SEEN_KEY) === "1"

export const saveImportGuideSeen = (seen: boolean): void => {
  Storage.set(EXPERIENCE_IMPORT_GUIDE_SEEN_KEY, seen ? "1" : "0")
}

const clampStoredPage = (page: number, total: number): number => {
  if (total <= 0) return 0
  return Math.min(Math.max(Math.round(page), 0), total - 1)
}

export const scanComics = (): ComicItem[] => {
  const dir = getComicsDir()
  const result: ComicItem[] = []
  for (const item of FileManager.readDirectorySync(dir)) {
    const lower = item.toLowerCase()
    if (!lower.endsWith(".zip") && !lower.endsWith(".cbz") && !lower.endsWith(".pdf")) continue
    const fp = Path.join(dir, item)
    try {
      const stat = FileManager.statSync(fp)
      const prog = loadProgress(item)
      const meta = loadMeta(item)
      result.push({
        id: item, name: item, path: fp,
        size: formatSize(stat.size), sizeBytes: stat.size,
        ext: Path.extname(item).toLowerCase(),
        pageCount: prog.totalPages,
        lastReadPage: clampStoredPage(prog.lastPage, Math.max(prog.totalPages, 1)),
        lastReadAt: prog.lastReadAt,
        modTime: stat.modificationDate,
        favorite: meta.favorite === true,
        note: meta.note ?? "",
        tags: meta.tags ?? [],
      })
    } catch { /**/ }
  }
  return result.sort((a, b) => b.modTime - a.modTime)
}
