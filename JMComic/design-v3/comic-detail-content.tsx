import {
  Button,
  HStack,
  Image,
  List,
  ProgressView,
  ScrollView,
  Section,
  Spacer,
  Text,
  VStack,
} from "scripting"
import { V3ComicCover, V3ContentState, V3PrimaryReadButton } from "./components"
import { V3_DESIGN } from "./tokens"

export function V3ComicDetailContent(props: {
  comic: any
  chapters: any[]
  recommendations: any[]
  coverURL: string
  continueChapter?: any
  latestChapter?: any
  primaryChapter?: any
  continueSubtitle: string
  primaryActionTitle: string
  showLatestAction: boolean
  blockedKeywordHits: string[]
  chapterAscending: boolean
  chapterLoading: string
  actionBusy: string
  supportsMinimization: boolean
  getChapterProgressLabel: (chapter: any) => string
  onOpenChapter: (chapter: any) => void
  onToggleChapterOrder: () => void
  onToggleFavourite?: () => void
  onToggleLike?: () => void
  onOpenTag: (tag: string) => void
  onOpenRecommendations: () => void
  renderRecommendations: (items: any[]) => any
  onMinimize: () => void
  onClose: () => void
  onReload: () => void
}) {
  const comic = props.comic
  const displayedChapters = props.chapterAscending ? [...props.chapters].reverse() : props.chapters
  const toolbar = {
    primaryAction: props.supportsMinimization
      ? <Button title="最小化" systemImage="arrow.down.right.and.arrow.up.left" action={props.onMinimize} />
      : undefined,
    cancellationAction: <Button title="关闭来源" systemImage="xmark" action={props.onClose} />,
  }

  return (
    <List
      navigationTitle={comic.title}
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGroup"
      toolbar={toolbar}
    >
      <Section>
        <HStack alignment="top" spacing={V3_DESIGN.spacing.section} padding={{ vertical: 6 }}>
          <V3ComicCover imageUrl={props.coverURL} width={122} height={174} />
          <VStack alignment="leading" spacing={V3_DESIGN.spacing.compact} frame={{ maxWidth: "infinity", minHeight: 174, alignment: "leading" }}>
            <Text font="title3" fontWeight="semibold" lineLimit={3}>{comic.title}</Text>
            <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={2}>{comic.author || "未知作者"}</Text>
            <HStack spacing={6}>
              <Image systemName={comic.finished ? "checkmark.circle.fill" : "book.closed"} font="caption" foregroundStyle={comic.finished ? "systemGreen" : V3_DESIGN.color.accent} />
              <Text font="caption" foregroundStyle="secondaryLabel">{comic.finished ? "已完结" : "连载中"}</Text>
            </HStack>
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>{props.continueSubtitle}</Text>
            <Spacer />
            <Text font="caption" foregroundStyle="tertiaryLabel">{`${comic.epsCount > 0 ? `${comic.epsCount} 话` : "章节未知"} · ${comic.totalViews ?? 0} 浏览`}</Text>
          </VStack>
        </HStack>
      </Section>

      <Section title="阅读">
        <V3PrimaryReadButton
          title={props.primaryActionTitle}
          systemImage={props.continueChapter ? "bookmark.fill" : "book.pages.fill"}
          disabled={!props.primaryChapter || props.chapterLoading.length > 0}
          action={() => { if (props.primaryChapter) props.onOpenChapter(props.primaryChapter) }}
        />
        {props.showLatestAction && props.latestChapter ? (
          <Button title={`阅读最新 · 第 ${props.latestChapter.order} 话`} systemImage="sparkles" action={() => props.onOpenChapter(props.latestChapter)} />
        ) : null}
        {props.onToggleFavourite ? (
          <Button
            title={props.actionBusy === "fav" ? "处理中…" : comic.isFavourite ? "取消收藏" : "加入收藏"}
            systemImage={comic.isFavourite ? "heart.slash" : "heart"}
            action={props.onToggleFavourite}
          />
        ) : null}
        {props.onToggleLike ? (
          <Button
            title={props.actionBusy === "like" ? "处理中…" : comic.isLiked ? "取消喜欢" : "喜欢"}
            systemImage={comic.isLiked ? "hand.thumbsdown" : "hand.thumbsup"}
            action={props.onToggleLike}
          />
        ) : null}
      </Section>

      {comic.description ? (
        <Section title="简介">
          <Text font="body" foregroundStyle="label" lineLimit={10}>{comic.description}</Text>
        </Section>
      ) : null}

      {comic.categories?.length > 0 || comic.tags?.length > 0 ? (
        <Section title="分类与标签">
          {comic.categories?.length > 0 ? (
            <ScrollView axes="horizontal" scrollIndicator="hidden">
              <HStack spacing={V3_DESIGN.spacing.compact} padding={{ vertical: 4 }}>
                {comic.categories.map((item: string) => (
                  <Button key={`category-${item}`} title={item} action={() => props.onOpenTag(item)} buttonStyle="bordered" />
                ))}
              </HStack>
            </ScrollView>
          ) : null}
          {comic.tags?.length > 0 ? (
            <ScrollView axes="horizontal" scrollIndicator="hidden">
              <HStack spacing={V3_DESIGN.spacing.compact} padding={{ vertical: 4 }}>
                {comic.tags.map((item: string) => (
                  <Button key={`tag-${item}`} title={`#${item}`} action={() => props.onOpenTag(item)} buttonStyle="bordered" tint={V3_DESIGN.color.accent} />
                ))}
              </HStack>
            </ScrollView>
          ) : null}
        </Section>
      ) : null}

      {props.blockedKeywordHits.length > 0 ? (
        <Section title="内容过滤">
          <HStack spacing={V3_DESIGN.spacing.row}>
            <Image systemName="eye.slash.fill" foregroundStyle="systemRed" />
            <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={3}>{`命中：${props.blockedKeywordHits.join("、")}`}</Text>
          </HStack>
        </Section>
      ) : null}

      <Section
        header={
          <HStack frame={{ maxWidth: "infinity" }}>
            <Text font="headline">章节</Text>
            <Spacer />
            <Button title={props.chapterAscending ? "旧到新" : "新到旧"} systemImage="arrow.up.arrow.down" action={props.onToggleChapterOrder} />
          </HStack>
        }
      >
        {displayedChapters.length === 0 ? (
          <V3ContentState title="还没有可读章节" message="当前作品暂时没有可打开的章节。" systemImage="book.closed" actionTitle="重新加载" action={props.onReload} />
        ) : displayedChapters.map((chapter: any) => {
          const isContinue = props.continueChapter?.id === chapter.id
          return (
            <Button key={chapter.id} action={() => props.onOpenChapter(chapter)} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>
              <HStack spacing={V3_DESIGN.spacing.row} frame={{ minHeight: V3_DESIGN.metric.rowMinHeight, maxWidth: "infinity" }}>
                <Image systemName={isContinue ? "bookmark.fill" : "book.pages"} frame={{ width: 28 }} foregroundStyle={isContinue ? V3_DESIGN.color.accent : "secondaryLabel"} />
                <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <Text font="body" fontWeight={isContinue ? "semibold" : "regular"} lineLimit={2}>{chapter.title}</Text>
                  <Text font="caption" foregroundStyle={isContinue ? V3_DESIGN.color.accent : "secondaryLabel"} lineLimit={1}>{isContinue ? `续读位置 · ${props.getChapterProgressLabel(chapter)}` : `第 ${chapter.order} 话 · ${props.getChapterProgressLabel(chapter)}`}</Text>
                </VStack>
                {props.chapterLoading === chapter.id ? <ProgressView progressViewStyle="circular" /> : <Image systemName="chevron.right" font="caption" foregroundStyle="tertiaryLabel" />}
              </HStack>
            </Button>
          )
        })}
      </Section>

      {props.recommendations.length > 0 ? (
        <Section
          header={
            <HStack frame={{ maxWidth: "infinity" }}>
              <Text font="headline">相关推荐</Text>
              <Spacer />
              <Button title="查看全部" action={props.onOpenRecommendations} />
            </HStack>
          }
        >
          {props.renderRecommendations(props.recommendations.slice(0, 4))}
        </Section>
      ) : null}
    </List>
  )
}
