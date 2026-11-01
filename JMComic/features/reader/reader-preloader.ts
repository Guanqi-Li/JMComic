import { withPageLoadSlot } from "../../page-load-queue"
import type { PageItem } from "../../types"
import type { ChapterStream } from "./chapter-stream"

type PendingPage = { task: Promise<string>; visible: boolean; valid: () => boolean }

export class ReaderPreloader {
  private pending = new WeakMap<() => Promise<string>, PendingPage>()
  private generation = 0
  private active = true

  // Foreground and background requests share one task and the decoded local file.
  load(page: PageItem, visible = true, valid: () => boolean = () => true): Promise<string> {
    const loader = page.loadLocalFile
    if (!loader) return Promise.resolve(page.path || "")
    const existing = this.pending.get(loader)
    if (existing) {
      existing.visible ||= visible
      existing.valid = valid
      return existing.task
    }
    const entry: PendingPage = { task: Promise.resolve(""), visible, valid }
    entry.task = withPageLoadSlot(async () => {
      if (!this.active || (!entry.visible && !entry.valid())) return ""
      const path = await loader()
      if (!path) throw new Error("图片数据为空")
      return path
    }, () => entry.visible ? 1 : 0).then(path => {
      if (!path) this.pending.delete(loader)
      return path
    }).catch(error => {
      this.pending.delete(loader)
      throw error
    })
    this.pending.set(loader, entry)
    return entry.task
  }

  update(stream: ChapterStream, index: number): void {
    if (!this.active) return
    const generation = ++this.generation
    const valid = () => this.active && generation === this.generation
    const segment = stream.segmentAt(index)
    const end = segment.start + segment.count
    // Stay within this chapter; prefetch only three pages across its boundary.
    for (const page of stream.pages.slice(index + 1, Math.min(index + 6, end))) {
      this.load(page, false, valid).catch(() => {})
    }
    if (end - index <= 5) {
      stream.prefetchNext(segment.chapter).then(pages => {
        if (!valid()) return
        for (const page of pages.slice(0, 3)) this.load(page, false, valid).catch(() => {})
      }).catch(() => {})
    }
  }

  cancel(): void { this.generation += 1 }
  stop(): void { this.active = false; this.cancel() }
}
