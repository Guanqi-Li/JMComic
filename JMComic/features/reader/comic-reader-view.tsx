import {
  Button, GeometryReader, HStack, LazyVStack, List, Navigation, NavigationStack, ProgressView,
  ScrollView, Section, Spacer, Text, VStack, ZStack, useEffect, useObservable, useRef,
} from "scripting"
import { DeferredPageImage } from "./deferred-page-image"
import { ChapterStream, ChapterSegment } from "./chapter-stream"
import { ReaderPreloader } from "./reader-preloader"
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
  const preloaderRef = useRef<ReaderPreloader | null>(null)
  if (!preloaderRef.current) preloaderRef.current = new ReaderPreloader()
  const preloader = preloaderRef.current
  const pages = useObservable(stream.pages)
  const current = useObservable(props.selectedChapter)
  const controls = useObservable(false)
  const busy = useObservable(false)
  const error = useObservable("")
  const historyWarning = useObservable("")
  const initialIndex = useRef<number | null>(null)
  if (initialIndex.current === null) {
    const progress = getOnlineChapterProgress({ sourceId: props.onlineProgress.sourceId || "zh.jmcomic",
      comicId: props.onlineProgress.comicId, chapterId: props.selectedChapter.id, chapterOrder: props.selectedChapter.order })
    initialIndex.current = progress.lastPage > 0 && progress.lastPage < props.initialPages.length ? progress.lastPage : 0
  }
  const position = useObservable<string | null>(stream.pages[initialIndex.current]?.id ?? null)
  const loaded = useRef(new Set<string>())
  const visibleTargets = useRef(new Set<string>())
  const currentPage = useRef(initialIndex.current)
  const confirmed = useRef<{ segment: ChapterSegment; page: number } | null>(null)
  const saveTimer = useRef<any>(null)
  const hideTimer = useRef<any>(null)
  const alive = useRef(true)
  const seenChapters = useRef(new Set<string>())
  const closing = useRef(false)

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
  const saveConfirmed = (): void => {
    if (confirmed.current) snapshot(confirmed.current.segment, confirmed.current.page)
  }
  const returnToDetails = (): void => {
    if (closing.current) return
    closing.current = true; alive.current = false
    preloader.stop()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    saveConfirmed()
    dismiss()
  }
  const report = (page: number): void => {
    if (!alive.current || !stream.pages[page]) return
    currentPage.current = page
    const segment = stream.segmentAt(page)
    preloader.update(stream, page)
    if (current.value.id !== segment.chapter.id) current.setValue(segment.chapter)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    // Lazy creation and background decoding never count as reading a page.
    if (!loaded.current.has(stream.pages[page].id)) return
    confirmed.current = { segment, page }
    saveTimer.current = setTimeout(saveConfirmed, 800)
    if (!seenChapters.current.has(segment.chapter.id)) {
      seenChapters.current.add(segment.chapter.id)
      recordJMAccountReading(segment.chapter.id).catch(e => {
        if (alive.current) historyWarning.setValue(e instanceof Error ? e.message : "观看历史同步失败")
      })
    }
    maybeAppend()
  }
  const onPositionChanged = (id: string | number | null): void => {
    if (!alive.current || typeof id !== "string") return
    const index = stream.pages.findIndex(page => page.id === id)
    if (index < 0) return
    if (position.value !== id) position.setValue(id)
    report(index)
  }
  const armHide = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (alive.current) controls.setValue(false) }, 4000)
  }
  const toggleControls = (): void => { controls.setValue(!controls.value); if (controls.value) armHide() }
  const jump = (index: number): void => {
    const target = stream.pages[index]
    if (!target) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    confirmed.current = null
    currentPage.current = index
    current.setValue(stream.segmentAt(index).chapter)
    preloader.load(target).catch(() => {})
    preloader.update(stream, index)
    // One native position binding owns both restoration and explicit navigation.
    position.setValue(target.id)
  }
  const append = async (): Promise<void> => {
    if (!alive.current || busy.value || error.value) return
    const tail = stream.segments[stream.segments.length - 1].chapter
    if (!stream.adjacent(tail, 1)) return
    busy.setValue(true)
    try {
      if (await stream.appendNext()) {
        if (alive.current) { visibleTargets.current.clear(); pages.setValue(stream.pages) }
      }
    }
    catch (e) { if (alive.current) error.setValue(e instanceof Error ? e.message : "下一章加载失败") }
    finally { if (alive.current) busy.setValue(false) }
  }
  const maybeAppend = (): void => {
    const last = stream.pages[stream.pages.length - 1]
    // Native target visibility also handles a short chapter that fits on screen.
    // Lazy onAppear is deliberately never used to detect the chapter end.
    const atEnd = last && (currentPage.current === last.index ||
      visibleTargets.current.has(last.id))
    if (last && atEnd && stream.segmentAt(currentPage.current).chapter.id === stream.segmentAt(last.index).chapter.id &&
      loaded.current.has(last.id)) {
      append().catch(() => {})
    }
  }
  const onPageLoaded = (id: string): void => {
    if (!alive.current || !stream.pages.some(page => page.id === id)) return
    loaded.current.add(id)
    if (position.value === id) {
      report(currentPage.current)
    }
    maybeAppend()
  }
  const choose = async (chapter: OnlineChapter): Promise<void> => {
    if (busy.value || chapter.id === current.value.id) return
    preloader.cancel()
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    saveConfirmed()
    controls.setValue(false); error.setValue("")
    const existing = stream.segments.find(segment => segment.chapter.id === chapter.id)
    if (existing) { jump(existing.start); return }
    busy.setValue(true)
    try {
      await stream.select(chapter)
      if (!alive.current) return
      loaded.current.clear()
      visibleTargets.current.clear()
      pages.setValue(stream.pages)
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
    preloader.load(stream.pages[currentPage.current]).catch(() => {})
    preloader.update(stream, currentPage.current)
    return () => {
      alive.current = false
      preloader.stop()
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (!closing.current) saveConfirmed()
    }
  }, [])
  const previous = stream.adjacent(current.value, -1)
  const next = stream.adjacent(current.value, 1)

  return <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} background={{ style: "black", shape: "rect" }}
    statusBarHidden persistentSystemOverlays="hidden" toolbarVisibility="hidden">
    <GeometryReader key="reader-viewport" ignoresSafeArea={{ regions: "container", edges: "all" }}>{geometry =>
      <ScrollView key="reader-scroll" background={{ style: "black", shape: "rect" }}
        scrollPosition={{ value: position.value, onChanged: onPositionChanged, anchor: "top" }}
        onScrollTargetVisibilityChange={{ idType: "string", threshold: 0, onChanged: ids => {
          if (!alive.current) return
          visibleTargets.current = new Set(ids.filter((id): id is string => typeof id === "string"))
          maybeAppend()
        } }}
        ignoresSafeArea={{ regions: "container", edges: "all" }} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <LazyVStack key="reader-pages" spacing={0} scrollTargetLayout>
          {pages.value.map(item => <DeferredPageImage key={item.id}
            item={item} cachedPath={preloader.cachedPath(item)}
            loadPage={() => preloader.load(item)} viewport={geometry.size}
            frame={{ maxWidth: "infinity" }} onTapGesture={toggleControls}
            onLoaded={() => onPageLoaded(item.id)} />)}
        </LazyVStack>
      </ScrollView>
    }</GeometryReader>
    {busy.value || error.value ? <VStack key="reader-status" frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Spacer />
      <VStack spacing={8} padding={12} background={{ style: "rgba(25,25,25,0.94)", shape: { type: "rect", cornerRadius: 12 } }}>
        {busy.value ? <ProgressView /> : null}
        {error.value ? <VStack spacing={8}><Text foregroundStyle="white" font="caption">{error.value}</Text>
          <Button title="重试加载下一章" action={() => { error.setValue(""); maybeAppend() }} /></VStack> : null}
      </VStack>
    </VStack> : null}
    {controls.value ? <VStack key="reader-controls" frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={{ horizontal: 16, top: 12, bottom: 16 }}>
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
