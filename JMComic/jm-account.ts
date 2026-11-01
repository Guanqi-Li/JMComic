import { fetch } from "scripting"
import { accountListPath, hasJMAccount, isJMChallenge, JM_ACCOUNT_ORIGIN, parseAccountPage, parseJMWebSearch } from "./jm-account-parser"
import type { AccountListKind, AccountPage } from "./jm-account-parser"

type SavedCookie = { name: string; value: string; domain: string; path: string; isSecure: boolean; isHTTPOnly: boolean; isSessionOnly: boolean; expiresDate?: string | null }
type Account = { username: string; password: string; cookies: SavedCookie[]; userAgent?: string }
const KEY = "jm_personal_account_v1"
const DEFAULT_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
let account: Account | undefined
let accountVersion = 0
let loginTask: { version: number; task: Promise<void> } | undefined
let verificationTask: { version: number; task: Promise<void> } | undefined

const allowedDomain = (domain: string, host: string): boolean => {
  const clean = domain.replace(/^\./, "").toLowerCase()
  return host.toLowerCase() === clean || (domain.startsWith(".") && host.toLowerCase().endsWith(`.${clean}`))
}
const alive = (cookie: SavedCookie): boolean => !cookie.expiresDate || new Date(cookie.expiresDate).getTime() > Date.now()
const normalizeCookie = (cookie: any): SavedCookie | null => {
  if (!cookie || typeof cookie.name !== "string" || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cookie.name) ||
    typeof cookie.value !== "string" || /[;\x00-\x1f\x7f]/.test(cookie.value)) return null
  const domain = String(cookie.domain || "18comic.vip").toLowerCase()
  if (domain.replace(/^\./, "") !== "18comic.vip") return null
  let expiresDate: string | null = null
  if (cookie.expiresDate != null) {
    const time = new Date(cookie.expiresDate).getTime()
    if (!Number.isFinite(time)) return null
    expiresDate = new Date(time).toISOString()
  }
  return { name: cookie.name, value: cookie.value, domain, path: typeof cookie.path === "string" && cookie.path.startsWith("/") ? cookie.path : "/",
    isSecure: Boolean(cookie.isSecure), isHTTPOnly: Boolean(cookie.isHTTPOnly), isSessionOnly: Boolean(cookie.isSessionOnly), expiresDate }
}

export const loadJMAccount = (): Account => {
  if (!account) {
    let parsed: any
    try { parsed = JSON.parse(Keychain.get(KEY) ?? "null") } catch { /**/ }
    account = { username: typeof parsed?.username === "string" ? parsed.username : "", password: typeof parsed?.password === "string" ? parsed.password : "",
      userAgent: typeof parsed?.userAgent === "string" && !/[\r\n]/.test(parsed.userAgent) ? parsed.userAgent : undefined,
      cookies: Array.isArray(parsed?.cookies) ? parsed.cookies.map(normalizeCookie).filter((cookie: SavedCookie | null): cookie is SavedCookie => Boolean(cookie && alive(cookie))) : [] }
  }
  return account
}
const persist = (next: Account): void => {
  if (!Keychain.set(KEY, JSON.stringify(next))) throw new Error("无法保存到钥匙串，请检查 Scripting 权限")
  account = next
}
const assertSession = (version: number): void => {
  if (version !== accountVersion) throw new Error("账号已切换，请重新操作")
}
export const saveJMCredentials = (username: string, password: string): void => {
  const current = loadJMAccount()
  const changed = current.username !== username.trim() || current.password !== password
  persist({ ...current, username: username.trim(), password, cookies: changed ? [] : current.cookies })
  if (changed) { accountVersion++; loginTask = undefined; verificationTask = undefined; homeCache = undefined }
}
const mergeCookies = (cookies: any[], version: number): void => {
  assertSession(version)
  if (!cookies.length) return
  const current = loadJMAccount(), next = [...current.cookies]
  for (const raw of cookies) {
    const item = normalizeCookie(raw)
    if (!item) continue
    const index = next.findIndex(cookie => cookie.name === item.name && cookie.domain === item.domain && cookie.path === item.path)
    if (index >= 0) next.splice(index, 1)
    if (alive(item)) next.push(item)
  }
  if (JSON.stringify(next) !== JSON.stringify(current.cookies)) persist({ ...current, cookies: next })
}
export const jmCookieHeader = (url: string): string => {
  const match = url.match(/^https:\/\/([^/:]+)(\/[^?#]*)?/i)
  if (!match) return ""
  const path = match[2] || "/"
  return loadJMAccount().cookies.filter(c => alive(c) && allowedDomain(c.domain, match[1]) &&
    (path === c.path || (path.startsWith(c.path) && (c.path.endsWith("/") || path[c.path.length] === "/"))))
    .sort((a, b) => b.path.length - a.path.length)
    .map(c => `${c.name}=${c.value}`).join("; ")
}

// Opens a normal browser for the user to complete the site's own verification.
// The same UA and cookie jar are used after the browser closes; no challenge is bypassed.
export const verifyJMWebsite = async (url = `${JM_ACCOUNT_ORIGIN}/`, version = accountVersion): Promise<void> => {
  assertSession(version)
  if (!verificationTask || verificationTask.version !== version) {
    const task = (async () => {
      if (!/^https:\/\/18comic\.vip(?:\/|$)/i.test(url)) throw new Error("验证地址不属于 JMComic")
      const web = new WebViewController({ ephemeral: true })
      try {
        if (typeof web.setCookie !== "function" || typeof web.getCookies !== "function") throw new Error("请更新 Scripting：需要支持 WebView Cookie 管理")
        for (const cookie of loadJMAccount().cookies.filter(alive)) {
          await web.setCookie({ ...cookie, expiresDate: cookie.expiresDate ? new Date(cookie.expiresDate) : undefined })
        }
        await web.loadURL(url); assertSession(version)
        await web.present({ navigationTitle: "完成验证后关闭返回" }); assertSession(version)
        mergeCookies(await web.getCookies(`${JM_ACCOUNT_ORIGIN}/`), version)
        const ua = await web.evaluateJavaScript<string>("return navigator.userAgent"); assertSession(version)
        if (ua && !/[\r\n]/.test(ua)) persist({ ...loadJMAccount(), userAgent: ua })
      } finally { web.dispose() }
    })().finally(() => { if (verificationTask?.task === task) verificationTask = undefined })
    verificationTask = { version, task }
  }
  return verificationTask.task
}

const request = async (path: string, body?: string, interactive = true, version = accountVersion): Promise<{ status: number; text: string }> => {
  assertSession(version)
  const url = `${JM_ACCOUNT_ORIGIN}${path}`
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("无效的账号请求路径")
  const response = await fetch(url, { method: body == null ? "GET" : "POST", timeout: 30,
    headers: { "User-Agent": loadJMAccount().userAgent || DEFAULT_UA, "Cookie": jmCookieHeader(url),
      "Referer": `${JM_ACCOUNT_ORIGIN}/`, "Origin": JM_ACCOUNT_ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    body, handleRedirect: async () => null })
  assertSession(version)
  mergeCookies(response.cookies ?? [], version)
  const text = await response.text(); assertSession(version)
  if (isJMChallenge(text)) {
    if (!interactive) throw new Error("验证尚未完成，请在设置中打开网页验证后重试")
    await verifyJMWebsite(`${JM_ACCOUNT_ORIGIN}${body ? "/login" : path}`, version)
    return request(path, body, false, version)
  }
  if (response.status >= 400) throw new Error(`JMComic 请求失败 (${response.status})`)
  return { status: response.status, text }
}

const login = async (interactive: boolean, version: number): Promise<void> => {
  assertSession(version)
  const current = loadJMAccount()
  if (!current.username || !current.password) throw new Error("请先在设置中登录 JMComic")
  const body = `username=${encodeURIComponent(current.username)}&password=${encodeURIComponent(current.password)}&submit_login=1`
  const response = await request("/login", body, interactive, version)
  let success = response.status >= 300 && response.status < 400
  try { success = Number(JSON.parse(response.text).status) === 1 } catch { /**/ }
  if (!success) throw new Error("登录未成功，请检查账号密码，或打开网页完成验证")
  const check = await request(accountListPath(current.username, "albums"), undefined, interactive, version)
  if (!hasJMAccount(check.text)) throw new Error("登录会话未生效，请打开网页登录后重试")
}

export const loginJMAccount = async (interactive = true, version = accountVersion): Promise<void> => {
  assertSession(version)
  if (!loginTask || loginTask.version !== version) {
    const task = login(interactive, version).finally(() => { if (loginTask?.task === task) loginTask = undefined })
    loginTask = { version, task }
  }
  return loginTask.task
}

export const fetchJMAccountPage = async (kind: AccountListKind, path?: string, page = 1): Promise<AccountPage> => {
  const version = accountVersion
  const current = loadJMAccount()
  if (!current.username) throw new Error("请先在设置中登录 JMComic")
  const root = accountListPath(current.username, kind)
  let target = path ?? (kind === "albums" ? `${root}?o=mr` : root)
  if (kind === "albums") {
    const [base, query = ""] = target.split("?")
    const parameters = query.split("&").filter(value => value && !/^o=/i.test(value))
    target = `${base}?${[...parameters, "o=mr"].join("&")}`
  }
  if (target !== root && !target.startsWith(`${root}?`)) throw new Error("无效的列表地址")
  let response = await request(target, undefined, true, version)
  if (!hasJMAccount(response.text)) {
    await loginJMAccount(true, version)
    response = await request(target, undefined, true, version)
  }
  if (!hasJMAccount(response.text)) throw new Error("会话已失效，请在设置中重新登录")
  return parseAccountPage(response.text, kind, page)
}

export const openJMAccountBrowser = async (): Promise<void> => {
  await verifyJMWebsite(`${JM_ACCOUNT_ORIGIN}/login`)
}

export const searchJMWebsite = async (keyword: string, page: number, order: string) => {
  const path = `/search/photos?search_query=${encodeURIComponent(keyword)}&o=${encodeURIComponent(order)}&page=${page}`
  const response = await request(path)
  return parseJMWebSearch(response.text, page)
}

let homeCache: { username: string; expires: number; docs: import("./types").OnlineComic[] } | undefined
export const fetchJMHomeRecommendations = async (): Promise<import("./types").OnlineComic[]> => {
  const username = loadJMAccount().username
  if (homeCache && homeCache.username === username && homeCache.expires > Date.now()) return homeCache.docs
  const response = await request("/")
  const docs = parseJMWebSearch(response.text, 1).docs.slice(0, 24)
  if (!docs.length) throw new Error("首页推荐暂时不可用，请重试")
  homeCache = { username, expires: Date.now() + 300000, docs }
  return docs
}

export const readJMWebAlbum = async (id: string, interactive = true): Promise<{ favourite: boolean; folder: string }> => {
  if (!/^\d+$/.test(id)) throw new Error("漫画 ID 无效")
  const response = await request(`/album/${id}/`, undefined, interactive)
  const button = response.text.match(new RegExp(`<(?:a|button)\\b[^>]*id=["'](?:album_favorite_|favorite_album_)${id}["'][^>]*>[\\s\\S]*?</(?:a|button)>`, "i"))?.[0] ?? ""
  if (!button) throw new Error("无法确认收藏状态，请打开网页登录或验证后重试")
  const checked = response.text.match(/<input\b(?=[^>]*name=["']f-category["'])(?=[^>]*\bchecked)[^>]*>/i)?.[0]
    ?? response.text.match(/<input\b(?=[^>]*name=["']f-category["'])[^>]*>/i)?.[0] ?? ""
  return { favourite: /\bbtn-primary\b|class=["'][^"']*\b(?:fas|fa\s+fa-bookmark)\b/i.test(button), folder: checked.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? "0" }
}

export const toggleJMAccountFavourite = async (id: string): Promise<{ action: string }> => {
  // Verify the current session before any account mutation; never retry a mutation blindly.
  const version = accountVersion
  await fetchJMAccountPage("albums")
  assertSession(version)
  const state = await readJMWebAlbum(id)
  assertSession(version)
  const path = state.favourite ? "/ajax/delete_favorite_album" : "/ajax/favorite_album"
  const body = `album_id=${encodeURIComponent(id)}&fid=${encodeURIComponent(state.folder)}`
  const response = await request(path, body, false, version)
  let result: any
  try { result = JSON.parse(response.text) } catch { throw new Error("收藏操作返回异常，请刷新列表确认结果") }
  if (Number(result.status) !== 1) throw new Error(String(result.msg ?? "收藏操作失败，请重新登录后重试"))
  return { action: state.favourite ? "un_favourite" : "favourite" }
}

export const recordJMAccountReading = async (chapterId: string): Promise<void> => {
  const version = accountVersion
  if (!loadJMAccount().username || !/^\d+$/.test(chapterId)) return
  // Use the website's reader route so JM, rather than a local list, records the visit.
  const response = await request(`/photo/${chapterId}`, undefined, false, version)
  if (!hasJMAccount(response.text)) {
    await loginJMAccount(false, version)
    const retry = await request(`/photo/${chapterId}`, undefined, false, version)
    if (!hasJMAccount(retry.text)) throw new Error("观看记录会话未生效，请重新登录")
  }
}
