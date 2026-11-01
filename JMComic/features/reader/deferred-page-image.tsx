import { Button, Image, ProgressView, Text, VStack, useEffect, useObservable, useRef } from "scripting"
import { withPageLoadSlot } from "../../page-load-queue"
import type { PageItem } from "../../types"

const imageRatios = new Map<string, number>()
function imageRatio(path: string): number | undefined {
  if (!path) return undefined
  if (imageRatios.has(path)) return imageRatios.get(path)
  try {
    const image = UIImage.fromFile(path)
    if (image && image.width > 0 && image.height > 0) {
      const ratio = image.width / image.height
      if (imageRatios.size >= 256) imageRatios.delete(imageRatios.keys().next().value!)
      imageRatios.set(path, ratio)
      return ratio
    }
  } catch { /**/ }
  return undefined
}

export function DeferredPageImage(props: {
  item: PageItem
  loadPage?: () => Promise<string>
  cachedPath?: string
  onInvalidate?: () => void
  viewport: { width: number; height: number }
  frame: { maxWidth?: "infinity"; maxHeight?: "infinity" }
  onAppear?: () => void
  onDisappear?: () => void
  onTapGesture?: () => void
  onLoaded?: () => void
}) {
  const path = useObservable(props.cachedPath || props.item.path || "")
  const busy = useObservable(false)
  const error = useObservable("")
  const mounted = useRef(true)
  const reported = useRef(false)
  const notifyTimer = useRef<any>(null)
  const notifyLoaded = (): void => {
    if (!mounted.current || !path.value || reported.current) return
    reported.current = true
    props.onLoaded?.()
  }
  const scheduleLoaded = (): void => {
    if (reported.current || notifyTimer.current) return
    notifyTimer.current = setTimeout(() => { notifyTimer.current = null; notifyLoaded() }, 180)
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (notifyTimer.current) clearTimeout(notifyTimer.current) } }, [])
  const load = async (): Promise<void> => {
    if (busy.value || path.value || (!props.loadPage && !props.item.loadLocalFile)) return
    busy.setValue(true); error.setValue("")
    try {
      const value = props.loadPage ? await props.loadPage() : await withPageLoadSlot(props.item.loadLocalFile!)
      if (!value) throw new Error("图片数据为空")
      if (mounted.current) {
        path.setValue(value)
        scheduleLoaded()
      }
    } catch (e) { if (mounted.current) error.setValue(e instanceof Error ? e.message : "图片加载失败") }
    finally { if (mounted.current) busy.setValue(false) }
  }
  const width = Math.max(1, props.viewport.width)
  const height = path.value ? width / (imageRatio(path.value) || width / Math.max(1, props.viewport.height)) : Math.max(1, props.viewport.height)
  const frame = { ...props.frame, width, height }
  const appear = (): void => {
    // Temporary files can be evicted while the reader is open. Only check rows
    // as they appear, rather than probing every cached page during each render.
    if (path.value && !FileManager.existsSync(path.value)) {
      imageRatios.delete(path.value); props.onInvalidate?.(); reported.current = false; path.setValue("")
    }
    if (path.value) scheduleLoaded(); else load().catch(() => {})
    props.onAppear?.()
  }
  return <VStack spacing={0} frame={frame}
    onAppear={appear} onDisappear={props.onDisappear} onTapGesture={props.onTapGesture}>
    {path.value ? <Image filePath={path.value} resizable aspectRatio={{ value: null, contentMode: "fit" }} frame={frame}
      onError={() => {
        if (notifyTimer.current) { clearTimeout(notifyTimer.current); notifyTimer.current = null }
        imageRatios.delete(path.value)
        props.onInvalidate?.()
        reported.current = false; path.setValue(""); error.setValue("图片无法显示，请重试下载")
      }} />
      : error.value ? <VStack spacing={10} padding={20}>
        <Text font="caption" foregroundStyle="white">{`第 ${props.item.index + 1} 页 · ${error.value}`}</Text>
        <Button title="重试" action={() => { load().catch(() => {}) }} />
      </VStack>
      : <VStack spacing={8}><ProgressView /><Text font="caption" foregroundStyle="gray">{`第 ${props.item.index + 1} 页`}</Text></VStack>}
  </VStack>
}
