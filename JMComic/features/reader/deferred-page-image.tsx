import { Button, Image, ProgressView, Text, VStack, useEffect, useObservable, useRef } from "scripting"
import { withPageLoadSlot } from "../../page-load-queue"
import type { PageItem } from "../../types"

export function DeferredPageImage(props: {
  item: PageItem
  frame: { maxWidth?: "infinity"; maxHeight?: "infinity" }
  onAppear?: () => void
  onDisappear?: () => void
  onTapGesture?: () => void
}) {
  const path = useObservable("")
  const busy = useObservable(false)
  const error = useObservable("")
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const load = async (): Promise<void> => {
    if (busy.value || path.value || !props.item.loadLocalFile) return
    busy.setValue(true); error.setValue("")
    try {
      const value = await withPageLoadSlot(props.item.loadLocalFile)
      if (!value) throw new Error("图片数据为空")
      if (mounted.current) path.setValue(value)
    } catch (e) { if (mounted.current) error.setValue(e instanceof Error ? e.message : "图片加载失败") }
    finally { if (mounted.current) busy.setValue(false) }
  }
  return <VStack spacing={10} frame={{ ...props.frame, minHeight: path.value ? 0 : 180 }}
    onAppear={() => { props.onAppear?.(); load().catch(() => {}) }} onDisappear={props.onDisappear} onTapGesture={props.onTapGesture}>
    {path.value ? <Image filePath={path.value} resizable aspectRatio={{ value: null, contentMode: "fit" }} frame={props.frame}
      onError={() => { path.setValue(""); error.setValue("图片无法显示") }} />
      : error.value ? <VStack spacing={10} padding={20}>
        <Text font="caption" foregroundStyle="white">{`第 ${props.item.index + 1} 页 · ${error.value}`}</Text>
        <Button title="重试" action={() => { load().catch(() => {}) }} />
      </VStack>
      : <VStack spacing={8}><ProgressView /><Text font="caption" foregroundStyle="gray">{`第 ${props.item.index + 1} 页`}</Text></VStack>}
  </VStack>
}
