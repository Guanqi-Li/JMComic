import type { OnlineChapter, PageItem } from "../../types"

export type ChapterSegment = { chapter: OnlineChapter; start: number; count: number }

export class ChapterStream {
  readonly chapters: OnlineChapter[]
  pages: PageItem[] = []
  segments: ChapterSegment[] = []
  private epoch = 0
  private tasks = new Map<string, Promise<PageItem[]>>()
  constructor(chapters: OnlineChapter[], selected: OnlineChapter, pages: PageItem[], private load: (chapter: OnlineChapter) => Promise<PageItem[]>) {
    this.chapters = [...chapters].sort((a, b) => a.order - b.order)
    if (!this.chapters.some(chapter => chapter.id === selected.id)) this.chapters.push(selected)
    this.append(selected, pages)
  }
  private append(chapter: OnlineChapter, pages: PageItem[]): void {
    if (!pages.length) throw new Error("章节图片为空")
    const start = this.pages.length
    this.pages = [...this.pages, ...pages.map((page, index) => ({ ...page, id: `${chapter.id}:${page.id}`, index: start + index }))]
    this.segments = [...this.segments, { chapter, start, count: pages.length }]
  }
  private fetch(chapter: OnlineChapter): Promise<PageItem[]> {
    const existing = this.tasks.get(chapter.id)
    if (existing) return existing
    const task = this.load(chapter).then(pages => {
      if (!pages.length) throw new Error("章节图片为空")
      return pages
    }).catch(error => { this.tasks.delete(chapter.id); throw error })
    this.tasks.set(chapter.id, task)
    return task
  }
  segmentAt(page: number): ChapterSegment {
    return this.segments.find(segment => page >= segment.start && page < segment.start + segment.count) ?? this.segments[0]
  }
  adjacent(chapter: OnlineChapter, direction: number): OnlineChapter | undefined {
    return this.chapters[this.chapters.findIndex(item => item.id === chapter.id) + direction]
  }
  async prefetchNext(chapter: OnlineChapter): Promise<PageItem[]> {
    const next = this.adjacent(chapter, 1)
    if (!next) return []
    const epoch = this.epoch
    const pages = await this.fetch(next)
    return epoch === this.epoch ? pages : []
  }
  async appendNext(): Promise<boolean> {
    const tail = this.segments[this.segments.length - 1].chapter
    const next = this.adjacent(tail, 1)
    if (!next) return false
    const epoch = this.epoch
    const pages = await this.fetch(next)
    if (epoch !== this.epoch || this.segments[this.segments.length - 1].chapter.id !== tail.id) return false
    this.append(next, pages)
    return true
  }
  async select(chapter: OnlineChapter): Promise<void> {
    const epoch = ++this.epoch
    const pages = await this.fetch(chapter)
    if (epoch !== this.epoch) return
    this.pages = []; this.segments = []
    this.append(chapter, pages)
  }
}
