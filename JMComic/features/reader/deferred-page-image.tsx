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
  const notifyLoaded = (): void => {
    if (!mounted.current || !path.value || reported.current) return
    reported.current = true
    props.onLoaded?.()
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const load = async (): Promise<void> => {
    if (busy.value || path.value || (!props.loadPage && !props.item.loadLocalFile)) return
    busy.setValue(true); error.setValue("")
    try {
      const value = props.loadPage ? await props.loadPage() : await withPageLoadSlot(props.item.loadLocalFile!)
      if (!value) throw new Error("图片数据为空")
      if (mounted.current) {
        path.setValue(value)
        setTimeout(notifyLoaded, 180)
      }
    } catch (e) { if (mounted.current) error.setValue(e instanceof Error ? e.message : "图片加载失败") }
    finally { if (mounted.current) busy.setValue(false) }
  }
  const width = Math.max(1, props.viewport.width)
  const height = path.value ? width / (imageRatio(path.value) || width / Math.max(1, props.viewport.height)) : Math.max(1, props.viewport.height)
  const frame = { ...props.frame, width, height }
  return <VStack spacing={0} frame={frame}
    onAppear={() => { if (path.value) notifyLoaded(); else load().catch(() => {}); props.onAppear?.() }} onDisappear={props.onDisappear} onTapGesture={props.onTapGesture}>
    {path.value ? <Image filePath={path.value} resizable aspectRatio={{ value: null, contentMode: "fit" }} frame={frame}
      onError={() => { reported.current = false; path.setValue(""); error.setValue("图片无法显示") }} />
      : error.value ? <VStack spacing={10} padding={20}>
        <Text font="caption" foregroundStyle="white">{`第 ${props.item.index + 1} 页 · ${error.value}`}</Text>
        <Button title="重试" action={() => { load().catch(() => {}) }} />
      </VStack>
      : <VStack spacing={8}><ProgressView /><Text font="caption" foregroundStyle="gray">{`第 ${props.item.index + 1} 页`}</Text></VStack>}
  </VStack>
}
