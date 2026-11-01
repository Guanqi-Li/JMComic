import type { OnlineComic } from "./types"

export type AccountListKind = "albums" | "watchlist"
export type AccountPage = { docs: OnlineComic[]; page: number; nextPath?: string }
export const JM_ACCOUNT_ORIGIN = "https://18comic.vip"

export const decodeHTML = (value: string): string => value
  .replace(/<[^>]*>/g, " ")
  .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
    const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code)
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ""
  })
  .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, key) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " }[key] ?? ""))
  .replace(/\s+/g, " ").trim()

export const isJMChallenge = (html: string): boolean => (
  /<title[^>]*>\s*(?:Just a moment|Attention Required|人机验证|驗證)/i.test(html)
  || /(?:id=["']challenge-form["']|window\._cf_chl_opt\s*=|id=["']cf-chl-widget)/i.test(html)
)

export const hasJMAccount = (html: string): boolean => /href=["']\/logout(?:[?"'])/i.test(html)

export const accountListPath = (username: string, kind: AccountListKind): string => (
  `/user/${encodeURIComponent(username)}/favorite/${kind}`
)

// Parse only account list cards; navigation, adverts and recommendations are excluded.
export const parseAccountPage = (html: string, kind: AccountListKind, page = 1): AccountPage => {
  const prefix = kind === "albums" ? "favorites_album_" : "watchlist_album_"
  const markers = [...html.matchAll(new RegExp(`<div\\b[^>]*\\bid=["']${prefix}(\\d+)["'][^>]*>`, "gi"))]
  const docs: OnlineComic[] = []
  const seen = new Set<string>()
  markers.forEach((marker, index) => {
    const id = marker[1]
    if (seen.has(id)) return
    const block = html.slice(marker.index, markers[index + 1]?.index ?? (marker.index! + 10000))
    const anchor = block.match(new RegExp(`<a\\b[^>]*href=["']/album/${id}/?[^"']*["'][^>]*>([\\s\\S]*?)</a>`, "i"))?.[1]
    if (!anchor) return
    const title = decodeHTML(anchor.match(/<div\b[^>]*class=["'][^"']*(?:video-title|image-item-text)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "")
    const imageTag = anchor.match(/<img\b[^>]*>/i)?.[0] ?? ""
    const image = imageTag.match(/\bdata-original=["']([^"']+)["']/i)?.[1]
      ?? imageTag.match(/\bdata-src=["']([^"']+)["']/i)?.[1]
      ?? imageTag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? ""
    const src = decodeHTML(image)
    const url = /^https:\/\//i.test(src) ? src : src.startsWith("//") ? `https:${src}` : src.startsWith("/") ? `${JM_ACCOUNT_ORIGIN}${src}` : ""
    if (!title || !url) return
    seen.add(id)
    docs.push({ id, title, author: "", categories: [], tags: [], pagesCount: 0, epsCount: 0,
      finished: false, likesCount: 0, thumb: { fileServer: "", path: url } })
  })
  let nextPath: string | undefined
  const candidates: { path: string; page: number }[] = []
  for (const link of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    let path = decodeHTML(link[1]).replace(/^https:\/\/18comic\.vip/i, "")
    if (!/^\/user\/[^/]+\/favorite\/(?:albums|watchlist)\?/.test(path) || !path.includes(`/favorite/${kind}?`)) continue
    if (/(?:[?&])(?:clear|delete|remove)=/i.test(path)) continue
    const target = Number(path.match(/[?&](?:page|p)=(\d+)/)?.[1] ?? 0)
    if (target > page) candidates.push({ path, page: target })
  }
  candidates.sort((a, b) => a.page - b.page)
  nextPath = candidates[0]?.path
  return { docs, page, nextPath }
}

export const parseJMWebSearch = (html: string, page: number) => {
  const docs: OnlineComic[] = []
  const cards = new Map<string, { image?: string; title?: string }>()
  for (const link of html.matchAll(/<a\b([^>]*href=["']\/album\/(\d+)\/?[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    const id = link[2], content = link[3]
    const imageTag = content.match(/<img\b[^>]*>/i)?.[0] ?? ""
    const image = imageTag.match(/\bdata-original=["']([^"']+)["']/i)?.[1]
      ?? imageTag.match(/\bdata-src=["']([^"']+)["']/i)?.[1]
      ?? imageTag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
    const title = decodeHTML(content.match(/<(?:div|span)\b[^>]*class=["'][^"']*(?:video-title|image-item-text)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/i)?.[1]
      ?? link[1].match(/\btitle=["']([^"']+)["']/i)?.[1]
      ?? imageTag.match(/\btitle=["']([^"']+)["']/i)?.[1]
      ?? imageTag.match(/\balt=["']([^"']+)["']/i)?.[1] ?? content)
    const card = cards.get(id) ?? {}
    if (image && /\/media\/albums\//i.test(image) && !image.includes("/blank.jpg")) card.image = image
    if (title) card.title = title
    cards.set(id, card)
  }
  for (const [id, card] of cards) {
    const { image, title } = card
    if (!image || !title) continue
    const src = decodeHTML(image)
    docs.push({ id, title, author: "", categories: [], tags: [], pagesCount: 0, epsCount: 0,
      finished: false, likesCount: 0, thumb: { fileServer: "", path: src.startsWith("//") ? `https:${src}` : src.startsWith("/") ? JM_ACCOUNT_ORIGIN + src : src } })
  }
  const pages = Math.max(page, ...[...html.matchAll(/(?:[?&]|&amp;)(?:page|p)=(\d+)/g)].map(m => Number(m[1])))
  return { docs, page, pages, total: docs.length }
}
