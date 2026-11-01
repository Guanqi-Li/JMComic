import { fetch, Image, ImageRenderer, VStack } from "scripting"
import { JM_SCRAMBLE_ID } from "./source-definitions"
import { jmImageHeaders, jmMd5Hex } from "./jm-request"

const jmCalcScrambleNum = (epId: number, filename: string): number => {
  if (epId < JM_SCRAMBLE_ID) return 0
  if (epId < 268850) return 10
  const picName = filename.replace(/\.[^.]+$/, "")
  const last = jmMd5Hex(`${epId}${picName}`).slice(-1).charCodeAt(0)
  return epId > 421926 ? (last % 8) * 2 + 2 : (last % 10) * 2 + 2
}

const jmUnscrambleImageToFile = async (imageData: Data, epId: number, sourceFileName: string, targetPath: string): Promise<string> => {
  const lowerName = sourceFileName.toLowerCase()
  if (lowerName.endsWith(".gif")) {
    FileManager.writeAsDataSync(targetPath, imageData)
    return targetPath
  }
  const scrambleNum = jmCalcScrambleNum(epId, sourceFileName)
  const image = UIImage.fromData(imageData)
  if (!image) throw new Error("JM 图片解码失败，请重试")
  if (scrambleNum <= 1) {
    FileManager.writeAsDataSync(targetPath, imageData)
    return targetPath
  }
  const width = Math.max(1, image.width)
  const height = Math.max(1, image.height)
  const block = Math.floor(height / scrambleNum)
  const remainder = height % scrambleNum
  if (block <= 0) throw new Error("JM 图片尺寸异常，请重试")
  const orderedSlices: UIImage[] = []
  for (let i = scrambleNum - 1; i >= 0; i -= 1) {
    const currentHeight = i === scrambleNum - 1 ? block + remainder : block
    const slice = image.renderedIn(
      { width, height: currentHeight },
      { position: { x: 0, y: i * block }, size: { width, height: currentHeight } },
    )
    if (!slice) throw new Error("JM 图片还原失败，请重试")
    orderedSlices.push(slice)
  }
  const pngData = await ImageRenderer.toPNGData(
    <VStack spacing={0} frame={{ width, height }}>
      {orderedSlices.map((slice, index) => (
        <Image key={`${sourceFileName}_${index}`} image={slice} resizable={true} frame={{ width, height: slice.height }} />
      ))}
    </VStack>,
    { opaque: true, scale: 1 },
  )
  const outputPath = targetPath.replace(/\.[^.]+$/, ".png")
  FileManager.writeAsDataSync(outputPath, pngData)
  return outputPath
}

export const jmFetchPageToLocalFile = async (
  url: string,
  namespace: string,
  cacheFileName: string,
  sourceFileName: string,
  epId: number,
  deps: { getOnlineImageCachePath: (namespace: string, fileName: string) => string },
  reload = false,
): Promise<string> => {
  const path = deps.getOnlineImageCachePath(namespace, cacheFileName)
  const pngPath = path.replace(/\.[^.]+$/, ".png")
  if (!reload && FileManager.existsSync(pngPath)) return pngPath
  if (!reload && FileManager.existsSync(path)) return path
  const response = await fetch(url, { headers: jmImageHeaders(), timeout: 30 })
  if (!response.ok) throw new Error(`JM 图片请求失败 (${response.status})`)
  const buffer = await response.arrayBuffer()
  const data = Data.fromArrayBuffer(buffer)
  if (!data) throw new Error("JM 图片数据为空")
  return jmUnscrambleImageToFile(data, epId, sourceFileName, path)
}
