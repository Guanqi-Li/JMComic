import {
  Button, HStack, Image, LazyVStack, List, Navigation, NavigationStack, ProgressView,
  ScrollView, ScrollViewReader, Section, Spacer, Text, VStack, ZStack, useEffect, useObservable, useRef,
} from "scripting"
import { DeferredPageImage } from "./deferred-page-image"
import { ChapterStream, ChapterSegment } from "./chapter-stream"
import { buildOnlineReaderProgressKey, getOnlineChapterProgress, pushOnlineReadingHistory } from "../../online-storage"
import { saveProgressData } from "../../library-storage"
import { recordJMAccountReading } from "../../jm-account"
import type { OnlineChapter, PageItem, ReaderOnlineProgress } from "../../types"

export type ReaderProps = {
  fileName: string
  title?: string
  progressStorageKey?: string
  initialPages: PageItem[]
  onlineProgress: ReaderOnlineProgress
  onProgressUpdate?: () => void
  chapters: OnlineChapter[]
  selectedChapter: OnlineChapter
  loadChapterPages: (chapter: OnlineChapter) => Promise<PageItem[]>
}

function ChapterDirectory(props: { chapters: OnlineChapter[]; current: string; onChoose: (chapter: OnlineChapter) => Promise<void> }) {
  const dismiss = Navigation.useDismiss()
  return <List navigationTitle="目录" listStyle="insetGroup" toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} /> }}>
    <Section>{props.chapters.map(chapter => <Button key={chapter.id} title={chapter.title}
      systemImage={chapter.id === props.current ? "book.fill" : "book"}
      action={() => { Promise.resolve(dismiss()).then(() => props.onChoose(chapter)).catch(() => {}) }} />)}</Section>
  </List>
}

export function ComicReaderView(props: ReaderProps) {
  const dismiss = Navigation.useDismiss()
  const streamRef = useRef<ChapterStream | null>(null)
  if (!streamRef.current) streamRef.current = new ChapterStream(props.chapters, props.selectedChapter, props.initialPages, props.loadChapterPages)
  const stream = streamRef.current
  const pages = useObservable(stream.pages)
  const current = useObservable(props.selectedChapter)
  const controls = useObservable(false)
  const busy = useObservable(false)
  const error = useObservable("")
  const historyWarning = useObservable("")
  const revision = useObservable(0)
  const visible = useRef(new Set<number>())
  const loaded = useRef(new Set<string>())
  const visibleTail = useRef("")
  const currentPage = useRef(0)
  const saveTimer = useRef<any>(null)
  const hideTimer = useRef<any>(null)
  const alive = useRef(true)
  const seenChapters = useRef(new Set<string>())
  const proxy = useRef<any>(null)
  const restored = useRef(false)
  const jumpToken = useRef(0)
  const closing = useRef(false)
  // This dismiss belongs to the one full-screen reader, never to a chapter.
  const returnToDetails = (): void => {
    if (closing.current) return
    closing.current = true
    alive.current = false
    jumpToken.current += 1
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    snapshot(stream.segmentAt(currentPage.current), currentPage.current)
    dismiss()
  }

  const snapshot = (segment: ChapterSegment, globalPage: number): void => {
    const local = Math.max(0, Math.min(segment.count - 1, globalPage - segment.start))
    const identity = { sourceId: props.onlineProgress.sourceId || "zh.jmcomic", comicId: props.onlineProgress.comicId,
      chapterId: segment.chapter.id, chapterOrder: segment.chapter.order }
    const timestamp = Date.now()
    saveProgressData(buildOnlineReaderProgressKey(identity), local, segment.count, timestamp)
    pushOnlineReadingHistory({ ...props.onlineProgress, ...identity, chapterTitle: segment.chapter.title,
      progressText: local >= segment.count - 1 ? "已读完" : `读到 ${local + 1}/${segment.count}`, lastReadAt: timestamp })
    props.onProgressUpdate?.()
  }
  const report = (): void => {
    if (!alive.current || !visible.current.size) return
    const page = Math.min(...visible.current)
    const segment = stream.segmentAt(page)
    currentPage.current = page
    if (current.value.id !== segment.chapter.id) current.setValue(segment.chapter)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => snapshot(segment, page), 800)
    if (!seenChapters.current.has(segment.chapter.id)) {
      seenChapters.current.add(segment.chapter.id)
      recordJMAccountReading(segment.chapter.id).catch(e => {
        if (alive.current) historyWarning.setValue(e instanceof Error ? e.message : "观看历史同步失败")
      })
    }
  }
  const armHide = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (alive.current) controls.setValue(false) }, 4000)
  }
  const toggleControls = (): void => { controls.setValue(!controls.value); if (controls.value) armHide() }
  const jump = (index: number): void => {
    const target = stream.pages[index]?.id
    if (!target) return
    const token = ++jumpToken.current
    currentPage.current = index
    for (const delay of [100, 300]) setTimeout(() => {
      if (alive.current && token === jumpToken.current) proxy.current?.scrollTo(target, "top")
    }, delay)
  }
  const append = async (): Promise<void> => {
    if (!alive.current || busy.value || error.value) return
    const tail = stream.segments[stream.segments.length - 1].chapter
    if (!stream.adjacent(tail, 1)) return
    busy.setValue(true)
    try { if (await stream.appendNext()) { if (alive.current) pages.setValue(stream.pages) } }
    catch (e) { if (alive.current) error.setValue(e instanceof Error ? e.message : "下一章加载失败") }
    finally { if (alive.current) busy.setValue(false) }
  }
  const maybeAppend = (): void => {
    const last = stream.pages[stream.pages.length - 1]
    if (last && visibleTail.current === last.id && loaded.current.has(last.id)) append().catch(() => {})
  }
  const choose = async (chapter: OnlineChapter): Promise<void> => {
    if (busy.value) return
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    snapshot(stream.segmentAt(currentPage.current), currentPage.current)
    controls.setValue(false); error.setValue("")
    const existing = stream.segments.find(segment => segment.chapter.id === chapter.id)
    if (existing) { jump(existing.start); return }
    busy.setValue(true)
    try {
      await stream.select(chapter)
      if (!alive.current) return
      visible.current.clear(); loaded.current.clear(); visibleTail.current = ""; currentPage.current = 0
      current.setValue(chapter); pages.setValue(stream.pages); revision.setValue(revision.value + 1)
      jump(0)
    } catch (e) { if (alive.current) error.setValue(e instanceof Error ? e.message : "章节加载失败") }
    finally { if (alive.current) busy.setValue(false) }
  }
  const directory = async (): Promise<void> => {
    controls.setValue(false)
    await Navigation.present({ element: <NavigationStack><ChapterDirectory chapters={stream.chapters} current={current.value.id} onChoose={choose} /></NavigationStack> })
  }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false; jumpToken.current += 1
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      snapshot(stream.segmentAt(currentPage.current), currentPage.current)
    }
  }, [])
  const previous = stream.adjacent(current.value, -1)
  const next = stream.adjacent(current.value, 1)
  const last = pages.value[pages.value.length - 1]

  return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} background={{ style: "black", shape: "rect" }}
    statusBarHidden persistentSystemOverlays="hidden" toolbarVisibility="hidden">
    <ScrollViewReader>{scrollProxy => {
      proxy.current = scrollProxy
      if (!restored.current) {
        restored.current = true
        const progress = getOnlineChapterProgress({ sourceId: props.onlineProgress.sourceId || "zh.jmcomic",
          comicId: props.onlineProgress.comicId, chapterId: props.selectedChapter.id, chapterOrder: props.selectedChapter.order })
        if (progress.lastPage > 0 && progress.lastPage < props.initialPages.length) jump(progress.lastPage)
      }
      return <ScrollView key={revision.value} background={{ style: "black", shape: "rect" }}
        ignoresSafeArea={{ regions: "container", edges: "all" }} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <LazyVStack spacing={0}>
          {pages.value.map(item => <DeferredPageImage key={item.id}
            item={{ ...item, loadLocalFile: item.loadLocalFile || (item.path ? async () => item.path! : undefined) }}
            frame={{ maxWidth: "infinity" }} onTapGesture={toggleControls}
            onAppear={() => { visible.current.add(item.index); report() }}
            onDisappear={() => { visible.current.delete(item.index); report() }}
            onLoaded={() => { loaded.current.add(item.id); maybeAppend() }} />)}
          <VStack key={`end:${last?.id}`} spacing={0} frame={{ height: busy.value ? 36 : error.value ? 88 : 1, maxWidth: "infinity" }}
            onAppear={() => { visibleTail.current = last?.id || ""; maybeAppend() }}
            onDisappear={() => { if (visibleTail.current === last?.id) visibleTail.current = "" }}>
            {busy.value ? <ProgressView /> : null}
            {error.value ? <VStack spacing={8}><Text foregroundStyle="white" font="caption">{error.value}</Text>
              <Button title="重试加载下一章" action={() => { error.setValue(""); append().catch(() => {}) }} /></VStack> : null}
          </VStack>
        </LazyVStack>
      </ScrollView>
    }}</ScrollViewReader>
    {controls.value ? <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={{ horizontal: 16, top: 12, bottom: 16 }}>
      <HStack spacing={12} padding={16} background={{ style: "rgba(25,25,25,0.94)", shape: { type: "rect", cornerRadius: 22 } }}>
        <Button title="返回" systemImage="chevron.left" action={returnToDetails} />
        <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity" }}>
          <Text font="caption" foregroundStyle="gray">{`第 ${current.value.order} 章`}</Text>
          <Text font="headline" foregroundStyle="white" lineLimit={2}>{current.value.title}</Text>
        </VStack>
      </HStack>
      <Spacer />
      <VStack spacing={14} padding={18} background={{ style: "rgba(25,25,25,0.94)", shape: { type: "rect", cornerRadius: 22 } }}>
        <HStack spacing={20} frame={{ maxWidth: "infinity" }}>
          <Button title="上一章" systemImage="backward.end" disabled={busy.value || !previous} action={() => { if (previous) choose(previous).catch(() => {}) }} />
          <Spacer /><Button title="目录" systemImage="list.bullet" action={() => { directory().catch(() => {}) }} /><Spacer />
          <Button title="下一章" systemImage="forward.end" disabled={busy.value || !next} action={() => { if (next) choose(next).catch(() => {}) }} />
        </HStack>
        {historyWarning.value ? <Text font="caption" foregroundStyle="gray">{historyWarning.value}</Text> : null}
      </VStack>
    </VStack> : null}
  </ZStack>
}
