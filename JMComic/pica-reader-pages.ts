import type { OnlineApiHost, OnlinePageImage, PageItem } from "./types"

export const preparePicaReaderPages = (
  images: OnlinePageImage[],
  host: OnlineApiHost,
  normalizeImageUrl: (thumb: OnlinePageImage["media"], host: OnlineApiHost) => string,
): PageItem[] => images.map((item, index) => {
  const id = String(item.id ?? index)
  if (item.localFilePath) {
    return { id, index, path: item.localFilePath }
  }
  const primaryUrl = normalizeImageUrl(item.media, host)
  const fallbackHost: OnlineApiHost = host === "go2778" ? "picacomic" : "go2778"
  const fallbackUrl = normalizeImageUrl(item.media, fallbackHost)
  return {
    id,
    index,
    imageUrl: primaryUrl,
    fallbackImageUrls: fallbackUrl !== primaryUrl ? [fallbackUrl] : undefined,
  }
})
