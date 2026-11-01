import {
  Button, HStack, Image, List, Navigation, NavigationStack, ProgressView, Script, Section,
  SecureField, Spacer, Tab, TabView, Text, TextField, VStack, useEffect, useObservable, useRef,
} from "scripting"
import { V3ComicCover } from "./design-v3/components"
import { fetchJMAccountPage, loadJMAccount, loginJMAccount, openJMAccountBrowser, saveJMCredentials } from "./jm-account"
import { appearanceModeLabel, loadAppearanceMode, saveAppearanceMode, setActiveThemeScheme, readSystemColorScheme } from "./theme"
import type { AccountListKind, AccountPage } from "./jm-account-parser"
import type { AppearanceMode, ComicSourceAdapter, OnlineComic, OnlineSortMode } from "./types"

export function JMComicRows(props: { comics: OnlineComic[]; onOpen: (comic: OnlineComic) => void }) {
  return <VStack spacing={0}>
    {props.comics.map(comic => <Button key={comic.id} action={() => props.onOpen(comic)} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>
      <HStack spacing={14} padding={{ vertical: 8 }} frame={{ minHeight: 98, maxWidth: "infinity", alignment: "leading" }}>
        <V3ComicCover imageUrl={comic.thumb.path} width={62} height={88} />
        <VStack alignment="leading" spacing={6} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font="body" foregroundStyle="label" lineLimit={3}>{comic.title}</Text>
          {comic.author ? <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{comic.author}</Text> : null}
        </VStack>
        <Image systemName="chevron.right" font="caption" foregroundStyle="tertiaryLabel" />
      </HStack>
    </Button>)}
  </VStack>
}

function JMAccountListPage(props: { kind: AccountListKind; initial: AccountPage; onOpen: (comic: OnlineComic) => void }) {
  const result = useObservable(props.initial)
  const busy = useObservable(false)
  const error = useObservable("")
  const paths = useRef<string[]>([""])
  const dismiss = Navigation.useDismiss()
  const load = async (page: number): Promise<void> => {
    if (busy.value) return
    busy.setValue(true); error.setValue("")
    try {
      const path = page === 1 ? undefined : paths.current[page - 1]
      if (page > 1 && !path) throw new Error("没有下一页")
      const next = await fetchJMAccountPage(props.kind, path, page)
      result.setValue(next)
      if (next.nextPath) paths.current[page] = next.nextPath
    } catch (e) { error.setValue(e instanceof Error ? e.message : "加载失败") }
    finally { busy.setValue(false) }
  }
  useEffect(() => { if (props.initial.nextPath) paths.current[1] = props.initial.nextPath }, [])
  return <List navigationTitle={props.kind === "albums" ? "收藏" : "观看历史"} listStyle="insetGroup"
    toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} /> }}>
    {error.value ? <Section><Text foregroundStyle="red">{error.value}</Text><Button title="重试" action={() => { load(result.value.page).catch(() => {}) }} /></Section> : null}
    <Section>
      {busy.value ? <ProgressView /> : null}
      <JMComicRows comics={result.value.docs} onOpen={props.onOpen} />
      {!busy.value && !result.value.docs.length ? <Text foregroundStyle="secondaryLabel">暂无记录</Text> : null}
    </Section>
    <Section>
      <HStack>
        <Button title="上一页" disabled={busy.value || result.value.page <= 1} action={() => { load(result.value.page - 1).catch(() => {}) }} />
        <Spacer /><Text foregroundStyle="secondaryLabel">{`第 ${result.value.page} 页`}</Text><Spacer />
        <Button title="下一页" disabled={busy.value || !result.value.nextPath} action={() => { load(result.value.page + 1).catch(() => {}) }} />
      </HStack>
      <Button title="刷新" systemImage="arrow.clockwise" disabled={busy.value} action={() => { load(result.value.page).catch(() => {}) }} />
    </Section>
  </List>
}

const auth = { email: "", password: "", token: "", host: "go2778" as const }
const sorts: OnlineSortMode[] = ["dd", "ld", "vd", "da"]
const labels: Record<OnlineSortMode, string> = { dd: "最新", ld: "最多爱心", vd: "总排行", da: "日排行" }

export function JMPersonalApp(props: { adapter: ComicSourceAdapter; onOpen: (comic: OnlineComic, onUpdate: () => void) => Promise<void> }) {
  const tab = useObservable("library")
  const username = useObservable(() => loadJMAccount().username)
  const password = useObservable(() => loadJMAccount().password)
  const loggedIn = useObservable(false)
  const loginBusy = useObservable(false)
  const loginError = useObservable("")
  const shelfBusy = useObservable(false)
  const shelfError = useObservable("")
  const favourites = useObservable<AccountPage>({ docs: [], page: 1 })
  const history = useObservable<AccountPage>({ docs: [], page: 1 })
  const keyword = useObservable("")
  const submittedKeyword = useObservable("")
  const sort = useObservable<OnlineSortMode>("dd")
  const results = useObservable<OnlineComic[]>([])
  const page = useObservable(1)
  const pages = useObservable(1)
  const searchBusy = useObservable(false)
  const searchError = useObservable("")
  const appearance = useObservable<AppearanceMode>(() => loadAppearanceMode())
  const searchGeneration = useRef(0)
  const lastShelfRefresh = useRef(0)
  const home = useObservable<OnlineComic[]>([])
  const homeBusy = useObservable(false)
  const homeError = useObservable("")
  const loadHome = async (): Promise<void> => {
    if (homeBusy.value || !props.adapter.getHomeRecommendations) return
    homeBusy.setValue(true); homeError.setValue("")
    try { home.setValue(await props.adapter.getHomeRecommendations()) }
    catch (error) { homeError.setValue(error instanceof Error ? error.message : "推荐加载失败") }
    finally { homeBusy.setValue(false) }
  }

  const refresh = async (force = false): Promise<void> => {
    if (shelfBusy.value || !loadJMAccount().username || (!force && Date.now() - lastShelfRefresh.current < 30000)) return
    shelfBusy.setValue(true); shelfError.setValue("")
    try {
      favourites.setValue(await fetchJMAccountPage("albums"))
      loggedIn.setValue(true)
      history.setValue(await fetchJMAccountPage("watchlist"))
      lastShelfRefresh.current = Date.now()
    } catch (e) { shelfError.setValue(e instanceof Error ? e.message : "书架加载失败") }
    finally { shelfBusy.setValue(false) }
  }
  const onUpdate = (): void => { refresh(true).catch(() => {}) }
  const openComic = (comic: OnlineComic): void => {
    props.onOpen(comic, onUpdate).then(onUpdate).catch(e => { Dialog.alert({ title: "打开失败", message: String(e instanceof Error ? e.message : e) }).catch(() => {}) })
  }
  const openMore = async (kind: AccountListKind): Promise<void> => {
    const initial = kind === "albums" ? favourites.value : history.value
    await Navigation.present({ element: <NavigationStack><JMAccountListPage kind={kind} initial={initial} onOpen={openComic} /></NavigationStack> })
    await refresh(true)
  }
  const login = async (): Promise<void> => {
    if (loginBusy.value || shelfBusy.value) return
    loginBusy.setValue(true); loginError.setValue("")
    try {
      const changed = loadJMAccount().username !== username.value.trim()
      lastShelfRefresh.current = 0
      saveJMCredentials(username.value, password.value)
      if (changed) { favourites.setValue({ docs: [], page: 1 }); history.setValue({ docs: [], page: 1 }) }
      loggedIn.setValue(false)
      await loginJMAccount()
      loggedIn.setValue(true)
      await refresh(true)
    } catch (e) { loginError.setValue(e instanceof Error ? e.message : "登录失败") }
    finally { loginBusy.setValue(false) }
  }
  const browserLogin = async (): Promise<void> => {
    if (loginBusy.value || shelfBusy.value) return
    loginBusy.setValue(true); loginError.setValue("")
    try {
      saveJMCredentials(username.value, password.value)
      await openJMAccountBrowser()
      await refresh(true)
    } catch (e) { loginError.setValue(e instanceof Error ? e.message : "网页验证失败") }
    finally { loginBusy.setValue(false) }
  }
  const search = async (targetPage = 1, newQuery = true): Promise<void> => {
    const query = newQuery ? keyword.value.trim() : submittedKeyword.value
    if (!query) {
      searchGeneration.current += 1; submittedKeyword.setValue(""); results.setValue([]); page.setValue(1); pages.setValue(1)
      searchBusy.setValue(false); searchError.setValue("")
      if (!home.value.length) await loadHome()
      return
    }
    const generation = ++searchGeneration.current
    submittedKeyword.setValue(query)
    searchBusy.setValue(true); searchError.setValue("")
    if (newQuery) { page.setValue(1); pages.setValue(1) }
    // Do not leave results from an older query under a newer query's error message.
    results.setValue([])
    try {
      const result = await props.adapter.getMangaList(auth, { keyword: query || undefined, page: targetPage, sort: sort.value })
      if (generation !== searchGeneration.current) return
      results.setValue(result.docs); page.setValue(result.page); pages.setValue(result.pages)
    } catch (e) {
      if (generation === searchGeneration.current) searchError.setValue(e instanceof Error ? e.message : "搜索失败")
    } finally { if (generation === searchGeneration.current) searchBusy.setValue(false) }
  }

  useEffect(() => { refresh().catch(() => {}) }, [])
  useEffect(() => { if (tab.value === "library") refresh().catch(() => {}) }, [tab.value])
  useEffect(() => { if (tab.value === "search" && !submittedKeyword.value && !home.value.length) loadHome().catch(() => {}) }, [tab.value])
  useEffect(() => { setActiveThemeScheme(appearance.value === "auto" ? null : appearance.value) }, [appearance.value])
  const toolbar = { cancellationAction: <Button title="关闭" systemImage="xmark" action={() => Script.exit()} />,
    primaryAction: Script.supportsMinimization() ? <Button title="最小化" systemImage="arrow.down.right.and.arrow.up.left" action={() => { Script.minimize().catch(() => {}) }} /> : undefined }
  const sectionHeader = (title: string, kind: AccountListKind) => <HStack>
    <Text font="headline">{title}</Text><Spacer />
    <Button title="更多" buttonStyle="plain" disabled={shelfBusy.value || !loggedIn.value} action={() => { openMore(kind).catch(e => { shelfError.setValue(String(e)) }) }} />
  </HStack>

  return <NavigationStack preferredColorScheme={appearance.value === "auto" ? undefined : appearance.value} background={{ style: "systemGroupedBackground", shape: "rect" }}
    toolbarBackground={{ style: "systemGroupedBackground", bars: ["navigationBar"] }}
    toolbarBackgroundVisibility={{ visibility: "visible", bars: ["navigationBar"] }}>
    <TabView selection={tab} tint="systemPink" toolbar={toolbar}>
      <Tab title="书架" systemImage="books.vertical" value="library">
        <List navigationTitle="书架" listStyle="insetGroup">
          {!loadJMAccount().username ? <Section><Button title="登录 JMComic" systemImage="person.crop.circle" action={() => tab.setValue("settings")} /></Section> : null}
          {shelfBusy.value ? <Section><ProgressView /></Section> : null}
          {shelfError.value ? <Section><Text foregroundStyle="red">{shelfError.value}</Text><Button title="重试" action={onUpdate} /></Section> : null}
          <Section header={sectionHeader("收藏", "albums")}>
            <JMComicRows comics={favourites.value.docs.slice(0, 5)} onOpen={openComic} />
            {!favourites.value.docs.length ? <Text foregroundStyle="secondaryLabel">暂无收藏</Text> : null}
          </Section>
          <Section header={sectionHeader("观看历史", "watchlist")}>
            <JMComicRows comics={history.value.docs.slice(0, 5)} onOpen={openComic} />
            {!history.value.docs.length ? <Text foregroundStyle="secondaryLabel">暂无观看历史</Text> : null}
          </Section>
          {loadJMAccount().username ? <Section><Button title="刷新" systemImage="arrow.clockwise" disabled={shelfBusy.value || loginBusy.value} action={onUpdate} /></Section> : null}
        </List>
      </Tab>
      <Tab title="搜索" systemImage="magnifyingglass" value="search">
        <VStack spacing={0} navigationTitle="搜索" navigationBarTitleDisplayMode="inline" background={{ style: "systemGroupedBackground", shape: "rect" }}
          toolbarBackground={{ style: "systemGroupedBackground", bars: ["navigationBar"] }} toolbarBackgroundVisibility="visible">
          <VStack padding={{ horizontal: 20, top: 18, bottom: 14 }}>
            <HStack spacing={12} padding={{ horizontal: 18, vertical: 15 }}
              background={{ style: "secondarySystemGroupedBackground", shape: { type: "rect", cornerRadius: 26, style: "continuous" } }}
              shadow={{ color: "rgba(0,0,0,0.12)", radius: 10, x: 0, y: 5 }}>
              <TextField title="漫画名、作者或 ID" value={keyword.value} onChanged={v => {
                keyword.setValue(v)
                if (!v.trim()) {
                  searchGeneration.current += 1; submittedKeyword.setValue(""); results.setValue([]); pages.setValue(1); page.setValue(1)
                  searchBusy.setValue(false); searchError.setValue("")
                  if (!home.value.length) loadHome().catch(() => {})
                }
              }} submitLabel="search" onSubmit={() => { search().catch(() => {}) }} autocorrectionDisabled frame={{ maxWidth: "infinity" }} />
              <Button disabled={searchBusy.value} action={() => { search().catch(() => {}) }}><Image systemName="magnifyingglass" foregroundStyle="systemPink" /></Button>
            </HStack>
          </VStack>
          <List listStyle="insetGroup" scrollContentBackground="hidden" background={{ style: "systemGroupedBackground", shape: "rect" }}>
            {!submittedKeyword.value ? <Section title="首页推荐">
              {homeBusy.value ? <ProgressView /> : null}
              {homeError.value ? <VStack><Text foregroundStyle="secondaryLabel">{homeError.value}</Text><Button title="重试" action={() => { loadHome().catch(() => {}) }} /></VStack> : null}
              <JMComicRows comics={home.value} onOpen={openComic} />
            </Section> : <>
              <Section><Button title={`排序：${labels[sort.value]}`} systemImage="arrow.up.arrow.down" disabled={searchBusy.value} action={() => {
                sort.setValue(sorts[(sorts.indexOf(sort.value) + 1) % sorts.length]); search(1, false).catch(() => {})
              }} /></Section>
              {searchError.value ? <Section><Text foregroundStyle="red">{searchError.value}</Text><Button title="重试" action={() => { search(page.value, false).catch(() => {}) }} /></Section> : null}
              <Section>
                {searchBusy.value ? <ProgressView /> : null}
                <JMComicRows comics={results.value} onOpen={openComic} />
                {!results.value.length && !searchBusy.value && !searchError.value ? <Text foregroundStyle="secondaryLabel">没有找到漫画</Text> : null}
              </Section>
              {pages.value > 1 ? <Section><HStack>
                <Button title="上一页" disabled={searchBusy.value || page.value <= 1} action={() => { search(page.value - 1, false).catch(() => {}) }} />
                <Spacer /><Text foregroundStyle="secondaryLabel">{`${page.value} / ${pages.value}`}</Text><Spacer />
                <Button title="下一页" disabled={searchBusy.value || page.value >= pages.value} action={() => { search(page.value + 1, false).catch(() => {}) }} />
              </HStack></Section> : null}
            </>}
          </List>
        </VStack>
      </Tab>
      <Tab title="设置" systemImage="gear" value="settings">
        <List navigationTitle="设置" listStyle="insetGroup">
          <Section title="JMComic 登录">
            <TextField title="账号" value={username.value} onChanged={v => username.setValue(v)} autocorrectionDisabled disabled={loginBusy.value || shelfBusy.value} />
            <SecureField title="密码" value={password.value} onChanged={v => password.setValue(v)} disabled={loginBusy.value || shelfBusy.value} onSubmit={() => { login().catch(() => {}) }} />
            <Text font="caption" foregroundStyle="secondaryLabel">{loggedIn.value ? `已登录：${loadJMAccount().username}` : "账号密码和登录状态会自动保存"}</Text>
            {loginError.value ? <Text foregroundStyle="red">{loginError.value}</Text> : null}
            <Button title={loginBusy.value ? "处理中…" : loggedIn.value ? "重新登录" : "登录"} disabled={loginBusy.value || shelfBusy.value || !username.value.trim() || !password.value} action={() => { login().catch(() => {}) }} />
            <Button title="网页登录 / 验证" disabled={loginBusy.value || shelfBusy.value || !username.value.trim()} action={() => { browserLogin().catch(() => {}) }} />
          </Section>
          <Section title="外观">
            <Button title={appearanceModeLabel(appearance.value, readSystemColorScheme())} action={() => {
              const modes: AppearanceMode[] = ["auto", "light", "dark"]
              const next = modes[(modes.indexOf(appearance.value) + 1) % modes.length]
              saveAppearanceMode(next); appearance.setValue(next)
            }} />
          </Section>
        </List>
      </Tab>
    </TabView>
  </NavigationStack>
}
