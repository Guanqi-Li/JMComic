import { DeferredPageImage } from "./deferred-page-image"
import {
  Script, Navigation, Path, NavigationStack, VStack, HStack, ZStack, Text, Button, Image,
  ScrollView, Spacer, ScrollViewReader, ForEach, LazyVStack, LazyHStack, ProgressView, TabView,
  Slider, Group, DragGesture, useObservable, useEffect, useRef,
} from "scripting"
import { currentTheme } from "../../theme"
import { COMIC_UI } from "../../comic-design-system"
import { V3_DESIGN } from "../../design-v3/tokens"
import { getDisplayName, isImageFile } from "../../comic-ui-utils"
import { cleanupTempComicCaches, loadProgress, loadReadMode, saveProgressData, saveReadMode } from "../../library-storage"
import { pushOnlineReadingHistory } from "../../online-storage"
import { ReadSettingsPanel as ExtractedReadSettingsPanel } from "../../read-settings-panel"
import {
  clampPage, formatReaderProgress, getReaderPercent, realPageFromSelection,
  selectionFromRealPage, shouldRenderPageImage,
} from "../../reader-utils"
import type { PageItem, ReadMode, ReadModeConfig, ReaderOnlineProgress } from "../../types"

const READ_MODE_CONFIGS: Record<ReadMode, ReadModeConfig> = {
  "scroll-v": { label: "竖向滚动", icon: "arrow.up.and.down" },
  "scroll-h": { label: "横向滚动", icon: "arrow.left.and.right" },
  "page-ltr": { label: "从左向右翻页", icon: "book" },
  "page-rtl": { label: "从右向左翻页", icon: "book.closed" },
}

// ─── File Operations ──────────────────────────────────────────────────────────

const unzipComic = (filePath: string): PageItem[] => {
  const tmp = Path.join(FileManager.temporaryDirectory, `comic_${Date.now()}`)
  if (FileManager.existsSync(tmp)) FileManager.removeSync(tmp)
  FileManager.createDirectorySync(tmp, true)
  FileManager.unzipSync(filePath, tmp)
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const name of FileManager.readDirectorySync(dir)) {
      if (name.startsWith(".") || name === "__MACOSX") continue
      const p = Path.join(dir, name)
      if (FileManager.isDirectorySync(p)) walk(p)
      else if (isImageFile(name)) files.push(p)
    }
  }
  walk(tmp)
  files.sort((a, b) =>
    Path.basename(a).localeCompare(Path.basename(b), undefined, { numeric: true })
  )
  return files.map((p, i): PageItem => ({ id: String(i), path: p, index: i }))
}

const extractPdfPages = async (filePath: string): Promise<PageItem[]> => {
  const pdf = PDFDocument.fromFilePath(filePath)
  if (!pdf) return []
  const tmp = Path.join(FileManager.temporaryDirectory, `pdf_${Date.now()}`)
  FileManager.createDirectorySync(tmp, true)
  const pages: PageItem[] = []
  for (let i = 0; i < pdf.pageCount; i++) {
    const page = pdf.pageAt(i)
    if (!page) continue
    const data = await page.data
    if (!data) continue
    const p = Path.join(tmp, `p${String(i).padStart(5, "0")}.pdf`)
    FileManager.writeAsDataSync(p, data)
    pages.push({ id: String(i), path: p, index: i })
  }
  return pages
}

// ─── ReadSettingsPanel ────────────────────────────────────────────────────────

function ReadSettingsPanel(props: {
  currentMode: ReadMode
  onModeChange: (mode: ReadMode) => void
  onGoToFirstPage: () => void
  onGoToLastPage: () => void
  onClose: () => void
}) {
  return (
    <ExtractedReadSettingsPanel
      {...props}
      readModeConfigs={READ_MODE_CONFIGS}
    />
  )
}

// ─── ReaderView ───────────────────────────────────────────────────────────────

export function ComicReaderView(props: {
  filePath?: string
  fileName: string
  title?: string
  progressStorageKey?: string
  initialPages?: PageItem[]
  onlineProgress?: ReaderOnlineProgress
  onProgressUpdate?: () => void
}) {
  const dismiss = Navigation.useDismiss()
  const readModeStorageKey = props.progressStorageKey ?? props.fileName
  const pageItems = useObservable<PageItem[]>([])
  const loading = useObservable(true)
  const errorMsg = useObservable("")
  const failedPages = useObservable<Record<string, boolean>>({})
  const pageRetryCounts = useObservable<Record<string, number>>({})
  const pageSourceIndices = useObservable<Record<string, number>>({})
  const readMode = useObservable<ReadMode>(() => loadReadMode(readModeStorageKey))
  const theme = currentTheme()
  // currentPage 仅用于显示（topBar / bottomBar / slider）。为了避免滚动时每页 onAppear
  // 都触发整棵 ReaderView 重渲，滚动态下把页码写进 ref，只在
  // 打开控制条 / 切模式 / debounce 保存时，才 sync 到 observable。
  const currentPage = useObservable(0)
  const currentPageRef = useRef(0)
  const visiblePageWindow = useObservable(0)
  const visiblePageWindowRef = useRef(0)
  const showControls = useObservable(false)
  const showSettings = useObservable(false)
  const pageSelection = useObservable<number>(0)
  const restoredPageHint = useRef<number | null>(null)

  // 非响应式状态（不触发重渲）
  const pendingScrollTarget = useRef(-1)
  const scrollPending = useRef(false)
  const verticalScrollRequestToken = useRef(0)
  const minVisibleIndex = useRef(0)
  const visibleCount = useRef(0)
  const saveTimer = useRef<number | null>(null)
  const autoHideTimer = useRef<number | null>(null)
  const interactionHint = useObservable("")
  const interactionHintTimer = useRef<number | null>(null)
  const settingsRestoreControls = useRef(false)
  const settingsWasPresented = useRef(false)
  const controlsLayoutGuardUntil = useRef(0)
  const controlsLayoutGuardPage = useRef(0)

  const syncOnlineProgress = (page: number, totalPages: number, lastReadAt = Date.now()): void => {
    if (!props.onlineProgress || totalPages <= 0) return
    pushOnlineReadingHistory({
      ...props.onlineProgress,
      progressText: page >= totalPages - 1 ? "已读完" : `读到 ${page + 1}/${totalPages}`,
      lastReadAt,
    })
    props.onProgressUpdate?.()
  }

  // debounce 保存进度（停止翻动 ~1.2s 后写 Storage）
  const scheduleSaveProgress = (page: number): void => {
    if (saveTimer.current != null) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      const total = pageItems.value.length
      if (total > 0) {
        const lastReadAt = Date.now()
        saveProgressData(readModeStorageKey, page, total, lastReadAt)
        syncOnlineProgress(page, total, lastReadAt)
      }
      saveTimer.current = null
    }, 1200) as unknown as number
  }

  const showInteractionHint = (message: string, duration = 1400): void => {
    if (interactionHint.value === message && interactionHintTimer.current != null) {
      clearTimeout(interactionHintTimer.current)
    } else if (interactionHintTimer.current != null) {
      clearTimeout(interactionHintTimer.current)
    }
    interactionHint.setValue(message)
    interactionHintTimer.current = setTimeout(() => {
      interactionHint.setValue("")
      interactionHintTimer.current = null
    }, duration) as unknown as number
  }

  const refreshControlsAutoHide = (duration = 3200): void => {
    if (showControls.value) armControlsAutoHide(duration)
  }

  const controlsHintMessage = (): string => {
    const mode = readMode.value
    if (mode === "page-ltr" || mode === "page-rtl") {
      return readMode.value === "page-rtl"
        ? "轻点中央显示控制栏，按从右向左方向翻页"
        : "轻点中央显示控制栏，轻点左右边缘翻页"
    }
    return readMode.value === "scroll-v"
      ? "上下滑动连续阅读，轻点页面显示控制栏"
      : "左右滑动连续阅读，轻点页面显示控制栏"
  }

  // Panels 风格：控制条短暂显示后自动收起，拖动/跳页会刷新倒计时。
  const armControlsAutoHide = (duration = 4200): void => {
    if (autoHideTimer.current != null) clearTimeout(autoHideTimer.current)
    autoHideTimer.current = setTimeout(() => {
      showControls.setValue(false)
      interactionHint.setValue("")
      autoHideTimer.current = null
    }, duration) as unknown as number
  }

  const revealControls = (showHint = true): void => {
    const page = clampPage(currentPageRef.current, pageItems.value.length)
    controlsLayoutGuardPage.current = page
    controlsLayoutGuardUntil.current = Date.now() + 700
    currentPageRef.current = page
    currentPage.setValue(page)
    showControls.setValue(true)
    if (showHint) showInteractionHint(controlsHintMessage(), 1500)
    armControlsAutoHide(showHint ? 4300 : 3800)
  }

  const hideControls = (): void => {
    if (autoHideTimer.current != null) clearTimeout(autoHideTimer.current)
    autoHideTimer.current = null
    if (interactionHintTimer.current != null) clearTimeout(interactionHintTimer.current)
    interactionHintTimer.current = null
    interactionHint.setValue("")
    showControls.setValue(false)
  }

  const openSettings = (): void => {
    settingsRestoreControls.current = true
    hideControls()
    showSettings.setValue(true)
  }

  const closeSettings = (restoreControls = true): void => {
    settingsRestoreControls.current = restoreControls
    showSettings.setValue(false)
  }

  // 滚动时更新 ref + debounce 保存。控制条显示时同步 observable，保证底部进度条实时变化。
  // 唤出/隐藏控制条会触发布局重排，Lazy 容器可能重新触发第一页 onAppear；
  // guard 窗口内忽略离当前页太远的 onAppear，避免进度被错误写回第一页。
  const reportPage = (page: number): void => {
    const total = pageItems.value.length
    const safePage = clampPage(page, total)
    const now = Date.now()
    if (
      now < controlsLayoutGuardUntil.current &&
      Math.abs(safePage - controlsLayoutGuardPage.current) > 1
    ) {
      return
    }
    if (safePage === currentPageRef.current) return
    currentPageRef.current = safePage
    if (showControls.value || readMode.value === "page-ltr" || readMode.value === "page-rtl") {
      currentPage.setValue(safePage)
    }
    if (readMode.value === "page-ltr" || readMode.value === "page-rtl") {
      visiblePageWindowRef.current = safePage
      visiblePageWindow.setValue(safePage)
    }
    scheduleSaveProgress(safePage)
  }

  useEffect(() => {
    const run = async (): Promise<void> => {
      let restoredPage: number | null = null
      try {
        let result: PageItem[] = []
        if (props.initialPages && props.initialPages.length > 0) {
          result = props.initialPages
        } else if (props.filePath) {
          cleanupTempComicCaches()
          const ext = Path.extname(props.filePath).toLowerCase()
          if (ext === ".zip" || ext === ".cbz") result = unzipComic(props.filePath)
          else if (ext === ".pdf") result = await extractPdfPages(props.filePath)
        }
        if (result.length === 0) {
          errorMsg.setValue("没有找到可显示的页面")
        } else {
          pageItems.setValue(result)
          const prog = loadProgress(readModeStorageKey)
          if (prog.lastPage > 0 && prog.lastPage < result.length) {
            const safePage = clampPage(prog.lastPage, result.length)
            currentPageRef.current = safePage
            visiblePageWindowRef.current = safePage
            visiblePageWindow.setValue(safePage)
            minVisibleIndex.current = safePage
            currentPage.setValue(safePage)
            pageSelection.setValue(selectionFromRealPage(safePage, result.length, readMode.value))
            pendingScrollTarget.current = safePage
            restoredPage = safePage
          }
        }
      } catch (_error: unknown) {
        errorMsg.setValue("这一章暂时无法打开，请返回后重试。")
      }
      loading.setValue(false)
      if (restoredPage != null) {
        restoredPageHint.current = restoredPage
        setTimeout(() => {
          if (restoredPageHint.current == null) return
          revealControls(false)
          showInteractionHint(`已恢复到第 ${restoredPageHint.current + 1} 页`, 1300)
          refreshControlsAutoHide(2600)
          restoredPageHint.current = null
        }, 360)
      }
    }
    run()
    return () => {
      // 卸载时立即落盘一次
      if (saveTimer.current != null) clearTimeout(saveTimer.current)
      if (autoHideTimer.current != null) clearTimeout(autoHideTimer.current)
      if (interactionHintTimer.current != null) clearTimeout(interactionHintTimer.current)
      verticalScrollRequestToken.current += 1
      scrollPending.current = false
      const total = pageItems.value.length
      if (total > 0) {
        const lastReadAt = Date.now()
        saveProgressData(readModeStorageKey, currentPageRef.current, total, lastReadAt)
        syncOnlineProgress(currentPageRef.current, total, lastReadAt)
      }
    }
  }, [])

  // 翻页模式下：由 TabView selection 驱动 currentPage
  useEffect(() => {
    const mode = readMode.value
    if (mode === "page-ltr" || mode === "page-rtl") {
      const total = pageItems.value.length
      const realPage = realPageFromSelection(pageSelection.value, total, mode)
      currentPageRef.current = realPage
      currentPage.setValue(realPage)
      if (Math.abs(realPage - visiblePageWindowRef.current) >= 2) {
        visiblePageWindowRef.current = realPage
        visiblePageWindow.setValue(realPage)
      }
      scheduleSaveProgress(realPage)
    }
  }, [pageSelection.value])

  useEffect(() => {
    if (showSettings.value) {
      settingsWasPresented.current = true
      return
    }
    if (settingsWasPresented.current) {
      settingsWasPresented.current = false
      if (settingsRestoreControls.current) {
        revealControls(false)
        refreshControlsAutoHide(4000)
      }
      settingsRestoreControls.current = false
    }
  }, [showSettings.value])

  const title = props.title ?? getDisplayName(props.fileName)
  const total = pageItems.value.length
  const isRTL = readMode.value === "page-rtl"
  const isPagedMode = readMode.value === "page-ltr" || readMode.value === "page-rtl"
  const progressPercent = formatReaderProgress(currentPage.value, total)
  const displayedSliderValue = isRTL ? (total - 1 - currentPage.value) : currentPage.value

  const jumpToPage = (page: number, source: "step" | "slider" | "boundary" | "edge-tap" | "edge-tap-controls" = "step"): void => {
    const p = clampPage(page, total)
    if (p === currentPageRef.current) {
      if (showControls.value) {
        if (source === "slider") refreshControlsAutoHide(2400)
        else if (source === "edge-tap-controls") refreshControlsAutoHide(2200)
        else refreshControlsAutoHide(3200)
      }
      return
    }
    currentPageRef.current = p
    visiblePageWindowRef.current = p
    visiblePageWindow.setValue(p)
    currentPage.setValue(p)
    pageSelection.setValue(selectionFromRealPage(p, total, readMode.value))
    pendingScrollTarget.current = p
    scheduleSaveProgress(p)
    if (showControls.value) {
      if (source === "boundary") {
        showInteractionHint(p === 0 ? "已到首页" : "已到末页", 1000)
        refreshControlsAutoHide(2400)
      } else if (source === "slider") {
        showInteractionHint(`已定位到第 ${p + 1} 页`, 1000)
        refreshControlsAutoHide(2200)
      } else if (source === "edge-tap-controls") {
        if (!interactionHint.value) {
          showInteractionHint("轻点中间可收起控制栏", 900)
        }
        refreshControlsAutoHide(2100)
      } else {
        refreshControlsAutoHide(3000)
      }
    }
  }

  const goToPreviousPage = (source: "step" | "edge-tap" | "edge-tap-controls" = "step"): void => {
    jumpToPage(currentPage.value - 1, source)
  }

  const goToNextPage = (source: "step" | "edge-tap" | "edge-tap-controls" = "step"): void => {
    jumpToPage(currentPage.value + 1, source)
  }

  const handleEdgeTap = (direction: "leading" | "trailing", keepControlsVisible = false): void => {
    const canGoBackward = currentPage.value > 0
    const canGoForward = currentPage.value < total - 1
    const shouldGoBackward = isRTL ? (direction === "trailing") : (direction === "leading")
    const pageTurnSource = keepControlsVisible ? "edge-tap-controls" : "edge-tap"
    if (shouldGoBackward) {
      if (canGoBackward) {
        goToPreviousPage(pageTurnSource)
      } else {
        if (!showControls.value) revealControls(false)
        showInteractionHint("已经是第一页", 1000)
        refreshControlsAutoHide(keepControlsVisible ? 2000 : 2200)
      }
      return
    }
    if (canGoForward) {
      goToNextPage(pageTurnSource)
    } else {
      if (!showControls.value) revealControls(false)
      showInteractionHint("已经是最后一页", 1000)
      refreshControlsAutoHide(keepControlsVisible ? 2000 : 2200)
    }
  }

  const handleReaderSurfaceTap = (zone: "leading" | "center" | "trailing"): void => {
    const mode = readMode.value
    if (mode !== "page-ltr" && mode !== "page-rtl") {
      toggleControls()
      return
    }
    if (zone === "center") {
      toggleControls()
      return
    }
    if (showSettings.value) {
      closeSettings(false)
    }
    if (showControls.value) {
      handleEdgeTap(zone, true)
      return
    }
    handleEdgeTap(zone)
  }

  const toggleControls = (): void => {
    if (showSettings.value) {
      closeSettings(true)
      return
    }
    if (showControls.value) {
      const page = clampPage(currentPageRef.current, pageItems.value.length)
      currentPageRef.current = page
      currentPage.setValue(page)
      hideControls()
    } else {
      revealControls(true)
    }
  }

  const handleModeChange = (mode: ReadMode): void => {
    saveReadMode(readModeStorageKey, mode)
    readMode.setValue(mode)
    const page = clampPage(currentPageRef.current, pageItems.value.length)
    currentPageRef.current = page
    visiblePageWindowRef.current = page
    visiblePageWindow.setValue(page)
    currentPage.setValue(page)
    if (mode === "scroll-v" || mode === "scroll-h") {
      pendingScrollTarget.current = page
    } else {
      pageSelection.setValue(selectionFromRealPage(page, pageItems.value.length, mode))
    }
    closeSettings(false)
    revealControls(false)
    showInteractionHint(`已切换为${READ_MODE_CONFIGS[mode].label}`, 1300)
    refreshControlsAutoHide(4200)
  }

  const retryPage = (item: PageItem): void => {
    const key = item.id
    failedPages.setValue({ ...failedPages.value, [key]: false })
    pageSourceIndices.setValue({ ...pageSourceIndices.value, [key]: 0 })
    pageRetryCounts.setValue({
      ...pageRetryCounts.value,
      [key]: (pageRetryCounts.value[key] ?? 0) + 1,
    })
  }

  const renderPagePlaceholder = (item: PageItem, frame: { maxWidth?: "infinity"; maxHeight?: "infinity" }) => (
    <ZStack frame={{ ...frame, minHeight: 180 }} background={{ style: COMIC_UI.reader.background, shape: "rect" }}>
      <Text font="footnote" foregroundStyle="rgba(255,255,255,0.42)">{`第 ${item.index + 1} 页`}</Text>
    </ZStack>
  )

  const renderPageFailure = (item: PageItem, frame: { maxWidth?: "infinity"; maxHeight?: "infinity" }) => (
    <VStack spacing={10} frame={{ ...frame, minHeight: 180 }} alignment="center"
      background={{ style: COMIC_UI.reader.background, shape: "rect" }}>
      <Image systemName="exclamationmark.triangle" foregroundStyle="rgba(255,255,255,0.72)" />
      <Text font="footnote" foregroundStyle="rgba(255,255,255,0.72)">{`第 ${item.index + 1} 页加载失败`}</Text>
      <Button title="重试此页" systemImage="arrow.clockwise" action={() => retryPage(item)} />
    </VStack>
  )

  const renderPageImage = (item: PageItem, frame: { maxWidth?: "infinity"; maxHeight?: "infinity" }, handlers?: {
    onAppear?: () => void
    onDisappear?: () => void
    onTapGesture?: () => void
  }) => {
    if (item.loadLocalFile) return <DeferredPageImage item={item} frame={frame} {...handlers} />
    if (failedPages.value[item.id]) return renderPageFailure(item, frame)
    const retry = pageRetryCounts.value[item.id] ?? 0
    if (item.imageUrl) {
      const candidates = [item.imageUrl, ...(item.fallbackImageUrls ?? [])]
      const sourceIndex = Math.min(pageSourceIndices.value[item.id] ?? 0, candidates.length - 1)
      const markFailed = (): void => {
        if (sourceIndex + 1 < candidates.length) {
          pageSourceIndices.setValue({ ...pageSourceIndices.value, [item.id]: sourceIndex + 1 })
          return
        }
        failedPages.setValue({ ...failedPages.value, [item.id]: true })
      }
      return (
        <Image key={`${item.id}_${sourceIndex}_${retry}`} imageUrl={candidates[sourceIndex]} resizable={true}
          aspectRatio={{ value: null, contentMode: "fit" }}
          frame={frame}
          placeholder={renderPagePlaceholder(item, frame)}
          onError={markFailed}
          onAppear={handlers?.onAppear}
          onDisappear={handlers?.onDisappear}
          onTapGesture={handlers?.onTapGesture} />
      )
    }
    return (
      <Image filePath={item.path!} resizable={true}
        aspectRatio={{ value: null, contentMode: "fit" }}
        frame={frame}
        onAppear={handlers?.onAppear}
        onDisappear={handlers?.onDisappear}
        onTapGesture={handlers?.onTapGesture} />
    )
  }

  const scheduleVerticalScrollToPage = (proxy: { scrollTo: (id: string | number, anchor?: "top" | "center" | "bottom" | "leading" | "trailing") => void }): void => {
    if (pendingScrollTarget.current < 0 || scrollPending.current) return
    const targetIndex = clampPage(pendingScrollTarget.current, pageItems.value.length)
    const target = pageItems.value[targetIndex]?.id
    if (!target) return
    pendingScrollTarget.current = -1
    scrollPending.current = true
    const token = verticalScrollRequestToken.current + 1
    verticalScrollRequestToken.current = token
    const anchors: Array<"top" | "center" | "top"> = ["top", "center", "top"]
    anchors.forEach((anchor, attempt) => {
      setTimeout(() => {
        if (verticalScrollRequestToken.current !== token) return
        proxy.scrollTo(target, anchor)
        if (attempt === anchors.length - 1) {
          scrollPending.current = false
        }
      }, 70 + attempt * 160)
    })
  }

  const renderVerticalReaderPage = (item: PageItem, index: number) => (
    <VStack
      key={item.id}
      tag={item.id}
      spacing={0}
      alignment="center"
      background={{ style: COMIC_UI.reader.background, shape: "rect" }}
      frame={{ maxWidth: "infinity" }}
    >
      {renderPageImage(item, { maxWidth: "infinity" }, {
        onAppear: () => reportPage(index),
        onTapGesture: toggleControls,
      })}
    </VStack>
  )

  const minimizeButton = Script.supportsMinimization()
    ? <Button title="最小化" systemImage="arrow.down.right.and.arrow.up.left" action={() => { Script.minimize().catch(() => { /**/ }) }} />
    : undefined
  const lifecycleToolbar = {
    primaryAction: minimizeButton,
    cancellationAction: <Button title="关闭阅读器" systemImage="xmark" action={dismiss} />,
  }
  const readerToolbar = {
    primaryAction: (
      <HStack spacing={4}>
        <Button title="阅读设置" systemImage="textformat.size" action={openSettings} />
        {minimizeButton}
      </HStack>
    ),
    cancellationAction: <Button title="关闭阅读器" systemImage="xmark" action={dismiss} />,
  }

  if (loading.value) {
    return (
      <VStack spacing={14} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={{ style: COMIC_UI.reader.background, shape: "rect" }}
        navigationTitle={title} navigationBarTitleDisplayMode="inline" toolbar={lifecycleToolbar}>
        <Spacer />
        <ProgressView progressViewStyle="circular" />
        <VStack spacing={4}>
          <Text font="subheadline" bold={true} foregroundStyle="white">{"正在准备漫画"}</Text>
          <Text font="caption" foregroundStyle="rgba(255,255,255,0.68)"
            multilineTextAlignment="center">{title}</Text>
        </VStack>
        <Spacer />
      </VStack>
    )
  }

  if (errorMsg.value) {
    return (
      <VStack spacing={12} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={{ style: COMIC_UI.reader.background, shape: "rect" }}
        navigationTitle="加载失败" navigationBarTitleDisplayMode="inline" toolbar={lifecycleToolbar}>
        <Spacer />
        <Image systemName="exclamationmark.triangle" foregroundStyle="rgba(255,255,255,0.72)" />
        <Text font="title3" bold={true} foregroundStyle="white">无法打开这一章</Text>
        <Text font="subheadline" foregroundStyle="rgba(255,255,255,0.68)" multilineTextAlignment="center"
          padding={{ horizontal: 28 }}>{errorMsg.value}</Text>
        <Button title="关闭阅读器" systemImage="xmark" action={dismiss} />
        <Spacer />
      </VStack>
    )
  }

  // ─── 紧凑型原生阅读进度控制岛 ───
  const bottomBar = (
    <VStack spacing={8}
      padding={{ horizontal: 14, top: 10, bottom: 10 }}
      background={{
        style: V3_DESIGN.color.readerHUD,
        shape: { type: "rect", cornerRadius: V3_DESIGN.radius.featured, style: "continuous" },
      }}
    >
      <HStack spacing={10} frame={{ maxWidth: "infinity" }} alignment="center">
        {isPagedMode ? (
          <Button action={() => goToPreviousPage("step")} buttonStyle="plain" disabled={currentPage.value <= 0}>
            <ZStack frame={{ width: V3_DESIGN.metric.touchTarget, height: V3_DESIGN.metric.touchTarget }}>
              <Image systemName={isRTL ? "chevron.right" : "chevron.left"} foregroundStyle="white" />
            </ZStack>
          </Button>
        ) : undefined}
        <Text font="subheadline" fontWeight="semibold" foregroundStyle="white">
          {`${currentPage.value + 1} / ${total}`}
        </Text>
        <Spacer />
        <Text font="footnote" foregroundStyle="rgba(255,255,255,0.68)">
          {READ_MODE_CONFIGS[readMode.value].label}
        </Text>
        {isPagedMode ? (
          <Button action={() => goToNextPage("step")} buttonStyle="plain" disabled={currentPage.value >= total - 1}>
            <ZStack frame={{ width: V3_DESIGN.metric.touchTarget, height: V3_DESIGN.metric.touchTarget }}>
              <Image systemName={isRTL ? "chevron.left" : "chevron.right"} foregroundStyle="white" />
            </ZStack>
          </Button>
        ) : undefined}
      </HStack>
      <Slider
        value={displayedSliderValue}
        onChanged={(value: number) => {
          jumpToPage(isRTL ? (total - 1 - Math.round(value)) : Math.round(value), "slider")
        }}
        min={0}
        max={Math.max(total - 1, 1)}
        step={1}
        tint="systemPink"
        label={<Text>{`阅读进度，第 ${currentPage.value + 1} 页，共 ${total} 页`}</Text>}
      />
    </VStack>
  )

  // Controls 采用覆盖层，不改变漫画页面布局，避免 Panels 类阅读器中最忌讳的“呼出 HUD 后页面跳动”。
  // 中间的透明命中层放到 HUD 背后，并给顶部/底部预留安全区，避免遮住 Slider 与底部按钮。
  const readerOverlay = showControls.value ? (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={{
          style: {
            colors: ["rgba(0,0,0,0.03)", "rgba(0,0,0,0.00)", "rgba(0,0,0,0.09)"],
            startPoint: "top",
            endPoint: "bottom",
          },
          shape: "rect",
        }}
      />
      {isPagedMode ? (
        <HStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={{ top: 72, bottom: 132 }}>
          <Button action={() => handleReaderSurfaceTap("leading")} buttonStyle="plain">
            <ZStack frame={{ width: 88, maxHeight: "infinity" }}
              background={{ style: "rgba(0,0,0,0.001)", shape: "rect" }} />
          </Button>
          <Button action={() => handleReaderSurfaceTap("center")} buttonStyle="plain" frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
            <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
              background={{ style: "rgba(0,0,0,0.001)", shape: "rect" }} />
          </Button>
          <Button action={() => handleReaderSurfaceTap("trailing")} buttonStyle="plain">
            <ZStack frame={{ width: 88, maxHeight: "infinity" }}
              background={{ style: "rgba(0,0,0,0.001)", shape: "rect" }} />
          </Button>
        </HStack>
      ) : (
        <Button action={hideControls} buttonStyle="plain" frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={{ top: 72, bottom: 132 }}>
          <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
            background={{ style: "rgba(0,0,0,0.001)", shape: "rect" }} />
        </Button>
      )}
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={{ horizontal: 12, bottom: 12 }}>
        <Spacer />
        {interactionHint.value ? (
          <Text font="caption" foregroundStyle={theme.textPrimary}
            padding={{ horizontal: 12, vertical: 7 }}
            background={{
              style: theme.rowProminentBackground,
              shape: { type: "capsule", style: "continuous" },
            }}>
            {interactionHint.value}
          </Text>
        ) : undefined}
        <HStack frame={{ maxWidth: "infinity" }}>{bottomBar}</HStack>
      </VStack>
    </ZStack>
  ) : undefined

  const pageTapOverlay = (!showControls.value && !showSettings.value && isPagedMode) ? (
    <HStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Button action={() => handleReaderSurfaceTap("leading")} buttonStyle="plain">
        <ZStack frame={{ width: 88, maxHeight: "infinity" }}
          background={{ style: "rgba(0,0,0,0.001)", shape: "rect" }} />
      </Button>
      <Button action={() => handleReaderSurfaceTap("center")} buttonStyle="plain" frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          background={{ style: "rgba(0,0,0,0.001)", shape: "rect" }} />
      </Button>
      <Button action={() => handleReaderSurfaceTap("trailing")} buttonStyle="plain">
        <ZStack frame={{ width: 88, maxHeight: "infinity" }}
          background={{ style: "rgba(0,0,0,0.001)", shape: "rect" }} />
      </Button>
    </HStack>
  ) : undefined

  const settingsSheet = {
    isPresented: showSettings,
    content: (
      <ReadSettingsPanel
        currentMode={readMode.value}
        onModeChange={handleModeChange}
        onGoToFirstPage={() => {
          jumpToPage(0, "boundary")
          closeSettings(true)
        }}
        onGoToLastPage={() => {
          jumpToPage(total - 1, "boundary")
          closeSettings(true)
        }}
        onClose={() => closeSettings(true)}
      />
    ),
  }

  // ─── 竖向滚动（独立实现，单独维护显式页锚点与重试滚动） ───
  if (readMode.value === "scroll-v") {
    return (
      <ScrollViewReader>
        {(proxy) => {
          scheduleVerticalScrollToPage(proxy)
          return (
            <ScrollView
              background={{ style: COMIC_UI.reader.background, shape: "rect" }}
              navigationTitle={title}
              navigationBarTitleDisplayMode="inline"
              toolbar={readerToolbar}
              toolbarVisibility={{ visibility: showControls.value ? "visible" : "hidden", bars: ["navigationBar"] }}
              ignoresSafeArea={{ regions: "container", edges: "all" }}
              toolbarBackgroundVisibility={{
                visibility: showControls.value ? "visible" : "hidden",
                bars: ["navigationBar"],
              }}
              overlay={readerOverlay}
              sheet={settingsSheet}
            >
              <LazyVStack spacing={2}>
                <ForEach data={pageItems} builder={(item: PageItem, index: number) => (
                  renderVerticalReaderPage(item, index)
                )} />
              </LazyVStack>
            </ScrollView>
          )
        }}
      </ScrollViewReader>
    )
  }

  // ─── 横向滚动 ───
  if (readMode.value === "scroll-h") {
    return (
      <ScrollViewReader>
        {(proxy) => {
          if (pendingScrollTarget.current >= 0 && !scrollPending.current) {
            const targetIndex = clampPage(pendingScrollTarget.current, pageItems.value.length)
            const target = pageItems.value[targetIndex]?.id
            if (target) {
              scrollPending.current = true
              setTimeout(() => {
                pendingScrollTarget.current = -1
                scrollPending.current = false
                proxy.scrollTo(target, "leading")
              }, 300)
            }
          }
          return (
            <ScrollView
              axes="horizontal"
              background={{ style: COMIC_UI.reader.background, shape: "rect" }}
              navigationTitle={title}
              navigationBarTitleDisplayMode="inline"
              toolbar={readerToolbar}
              toolbarVisibility={{ visibility: showControls.value ? "visible" : "hidden", bars: ["navigationBar"] }}
              ignoresSafeArea={{ regions: "container", edges: "all" }}
              toolbarBackgroundVisibility={{
                visibility: showControls.value ? "visible" : "hidden",
                bars: ["navigationBar"],
              }}
              overlay={readerOverlay}
              sheet={settingsSheet}
            >
              <LazyHStack spacing={2} frame={{ maxHeight: "infinity" }}>
                <ForEach data={pageItems} builder={(item: PageItem, index: number) => (
                  renderPageImage(item, { maxHeight: "infinity" }, {
                    onAppear: () => {
                      visibleCount.current += 1
                      // 横滚中当前页取最小可见 index
                      if (visibleCount.current === 1 || index < minVisibleIndex.current) {
                        minVisibleIndex.current = index
                        reportPage(index)
                      }
                    },
                    onDisappear: () => {
                      if (visibleCount.current > 0) visibleCount.current -= 1
                      if (index === minVisibleIndex.current) {
                        // 粗略估计：向后推一页，并限制在合法范围内。
                        const next = clampPage(index + 1, pageItems.value.length)
                        minVisibleIndex.current = next
                        reportPage(next)
                      }
                    },
                    onTapGesture: toggleControls,
                  })
                )} />
              </LazyHStack>
            </ScrollView>
          )
        }}
      </ScrollViewReader>
    )
  }

  // ─── 翻页模式 ───
  const orderedPages = isRTL ? [...pageItems.value].reverse() : pageItems.value
  return (
    <TabView
      selection={pageSelection}
      tabViewStyle="pageNeverDisplayIndex"
      navigationTitle={title}
      navigationBarTitleDisplayMode="inline"
      toolbar={readerToolbar}
              toolbarVisibility={{ visibility: showControls.value ? "visible" : "hidden", bars: ["navigationBar"] }}
              ignoresSafeArea={{ regions: "container", edges: "all" }}
      toolbarBackgroundVisibility={{
        visibility: showControls.value ? "visible" : "hidden",
        bars: ["navigationBar"],
      }}
      overlay={readerOverlay}
      sheet={settingsSheet}
    >
      {orderedPages.map((p: PageItem) => {
        const tag = isRTL ? (total - 1 - p.index) : p.index
        return (
          <ZStack key={p.id} tag={tag} background={{ style: COMIC_UI.reader.background, shape: "rect" }} overlay={pageTapOverlay}>
            {shouldRenderPageImage(p.index, visiblePageWindow.value, total, readMode.value) ? (
              renderPageImage(p, { maxWidth: "infinity", maxHeight: "infinity" })
            ) : renderPagePlaceholder(p, { maxWidth: "infinity", maxHeight: "infinity" })}
          </ZStack>
        )
      })}
    </TabView>
  )
}
