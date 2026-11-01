import type { OnlineApiHost, OnlineSortMode, OnlineThumb } from "./types"
export const ONLINE_SORT_LABELS: Record<OnlineSortMode, string> = { dd: "最新", da: "日排行", ld: "最多爱心", vd: "总排行" }
export const normalizeOnlineThumbUrl = (thumb: OnlineThumb, _host?: OnlineApiHost): string => {
  if (/^https?:\/\//i.test(thumb?.path ?? "")) return thumb.path
  return `${thumb?.fileServer ?? ""}/${thumb?.path ?? ""}`.replace(/([^:]\/)\/+/g, "$1")
}
