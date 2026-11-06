import { createElementSize } from "@solid-primitives/resize-observer"
import { createEffect, createMemo, For, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { ActivityRing } from "@opencode/ui/activity-ring"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { displayName } from "@opencode/ui/project-avatar"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { useLanguage } from "@/runtime/i18n/language"
import { SessionTabAvatarView } from "@/shell/layout/session-tab-avatar"
import { inboxArchived, type InboxEntry, type InboxStatus } from "@/shell/titlebar/inbox-model"
import { compareWorking, workingSince } from "@/shell/titlebar/inbox-working"
import { sessionTabTitle } from "@/shell/titlebar/tab-title"
import { ProjectGlyph } from "./glyph"
import { projectKey, useSidebarProjects } from "./state"

/** Section header height: matches the `h-7` on `DockSectionHeader`. */
const HEADER = 28

/** Keyboard resize step of the DockHandle. */
const STEP = 16

// Sessions waiting on a person come first, then failures, then unread results.
const RANK: Partial<Record<InboxStatus, number>> = { approval: 0, input: 0, failed: 1, done: 2 }

/**
 * Bottom region of the Projects sidebar, at most half its height: NeedsAttention (collapsible) above Ongoing (always
 * shown, the backbone). Ongoing keeps its full height while it fits; NeedsAttention takes what remains and scrolls.
 * A stored height (DockHandle) only lowers the cap, so the Dock never grows past its content.
 */
export function Dock() {
  const language = useLanguage()
  const sidebar = useSidebarProjects()
  const inbox = sidebar.inbox

  const [ui, setUi] = createStore<{
    root?: HTMLElement
    attention?: HTMLElement
    ongoing?: HTMLElement
    drag?: { y: number; height: number }
  }>({})

  const container = createElementSize(() => ui.root?.parentElement)
  const attentionList = createElementSize(() => ui.attention)
  const ongoingList = createElementSize(() => ui.ongoing)

  const sections = createMemo(() => {
    const list = inbox.entries().filter((entry) => !inboxArchived(entry))

    return {
      // Entries arrive newest first and the sort is stable, so each rank stays newest first.
      attention: list
        .filter((entry) => RANK[entry.status] !== undefined)
        .toSorted((a, b) => (RANK[a.status] ?? 0) - (RANK[b.status] ?? 0)),
      // Ordered by when each run started so rows stay in place while their sessions update.
      ongoing: list.filter((entry) => entry.status === "working").toSorted(compareWorking),
    }
  })

  // The client only refreshes `time.idle` for loaded sessions when a run ends, so load every working one (as Inbox).
  createEffect(() => {
    sections().ongoing.forEach((entry) => {
      if (entry.ctx.data.session.get(entry.session.id)) return
      void entry.ctx.data.session.sync(entry.session.id).catch(() => undefined)
    })
  })

  const collapsed = () => sidebar.state.store.dock.attentionCollapsed

  const size = createMemo(() => {
    const attentionHeader = sections().attention.length > 0 ? HEADER : 0
    const ongoingHeader = sections().ongoing.length > 0 ? HEADER : 0
    const min = attentionHeader + ongoingHeader
    // Until the sidebar is measured the cap is the content itself.
    const max = Math.max(min, container.height ? Math.floor(container.height / 2) : Infinity)
    const cap = Math.min(Math.max(sidebar.state.store.dock.height ?? Infinity, min), max)
    const ongoing = Math.min(ongoingHeader && ongoingHeader + (ongoingList.height ?? 0), cap - attentionHeader)

    const attention = Math.min(
      attentionHeader && attentionHeader + (collapsed() ? 0 : (attentionList.height ?? 0)),
      cap - ongoing,
    )

    return { min, max, ongoing, attention, height: ongoing + attention }
  })

  const resize = (height: number) =>
    sidebar.state.setDockHeight(Math.round(Math.min(Math.max(height, size().min), size().max)))

  const keys = (list: () => InboxEntry[]) => list().map((entry) => entry.key)

  // Rows read entries by key so live session updates do not remount them.
  const rows = (list: () => InboxEntry[]) => (
    <For each={keys(list)}>
      {(key) => (
        <Show when={inbox.byKey().get(key)}>
          {(entry) => (
            <DockRow
              entry={entry()}
              selected={inbox.selected(entry())}
              now={inbox.now()}
              onOpen={() => {
                inbox.open(entry())
                inbox.markViewed(entry())
              }}
              onDecide={(decision) => inbox.decide(entry(), decision)}
            />
          )}
        </Show>
      )}
    </For>
  )

  return (
    <Show when={sections().attention.length > 0 || sections().ongoing.length > 0}>
      <div
        ref={(el) => setUi("root", el)}
        data-slot="sidebar-projects-dock"
        role="region"
        aria-label={language.t("sidebar.projects.dock.label")}
        class="relative flex shrink-0 flex-col border-t border-v2-border-border-muted"
      >
        <div
          data-slot="sidebar-projects-dock-handle"
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={language.t("sidebar.projects.dock.resize")}
          aria-valuenow={Math.round(size().height)}
          aria-valuemin={size().min}
          aria-valuemax={Number.isFinite(size().max) ? size().max : undefined}
          data-state={ui.drag ? "dragging" : undefined}
          class="group/handle absolute inset-x-0 -top-[4px] z-10 flex h-[7px] cursor-row-resize touch-none items-center focus-visible:outline-none"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            setUi("drag", { y: event.clientY, height: size().height })
          }}
          onPointerMove={(event) => {
            const drag = ui.drag

            if (!drag) return
            resize(drag.height - (event.clientY - drag.y))
          }}
          onPointerUp={() => setUi("drag", undefined)}
          onPointerCancel={() => setUi("drag", undefined)}
          onLostPointerCapture={() => setUi("drag", undefined)}
          onDblClick={() => sidebar.state.setDockHeight(undefined)}
          onKeyDown={(event) => {
            const height = {
              ArrowUp: size().height + STEP,
              ArrowDown: size().height - STEP,
              Home: size().min,
              End: size().max,
            }[event.key]

            if (height === undefined) return
            event.preventDefault()
            resize(height)
          }}
        >
          <span
            aria-hidden="true"
            class="h-[3px] w-full bg-v2-border-border-base opacity-0 transition-opacity group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-data-[state=dragging]/handle:opacity-100"
          />
        </div>
        <Show when={sections().attention.length > 0}>
          <section
            data-slot="sidebar-projects-dock-attention"
            aria-label={language.t("sidebar.inbox.section.needsAttention")}
            class="flex shrink-0 flex-col overflow-hidden"
            style={{ height: `${size().attention}px` }}
          >
            <DockSectionHeader
              label={language.t("sidebar.inbox.section.needsAttention")}
              count={sections().attention.length}
              expanded={!collapsed()}
              onToggle={() => sidebar.state.toggleAttention()}
            />
            <Show when={!collapsed()}>
              <div data-scrollable class="min-h-0 flex-1 overflow-y-auto">
                <div ref={(el) => setUi("attention", el)} class="flex flex-col gap-px pb-1">
                  {rows(() => sections().attention)}
                </div>
              </div>
            </Show>
          </section>
        </Show>
        <Show when={sections().ongoing.length > 0}>
          <section
            data-slot="sidebar-projects-dock-ongoing"
            aria-label={language.t("sidebar.projects.dock.ongoing")}
            class="flex shrink-0 flex-col overflow-hidden"
            classList={{ "border-t border-v2-border-border-muted": sections().attention.length > 0 }}
            style={{ height: `${size().ongoing}px` }}
          >
            <DockSectionHeader label={language.t("sidebar.projects.dock.ongoing")} count={sections().ongoing.length} />
            <div data-scrollable class="min-h-0 flex-1 overflow-y-auto">
              <div ref={(el) => setUi("ongoing", el)} class="flex flex-col gap-px pb-1">
                {rows(() => sections().ongoing)}
              </div>
            </div>
          </section>
        </Show>
      </div>
    </Show>
  )
}

/** Compact heading in the style of the tree's group headings; `onToggle` makes it a collapse button. */
function DockSectionHeader(props: { label: string; count: number; expanded?: boolean; onToggle?: () => void }) {
  const content = (): JSX.Element => (
    <>
      <span class="min-w-0 truncate">{props.label}</span>
      <span class="shrink-0 rounded-full bg-v2-background-bg-layer-02 px-1.5 text-[11px] leading-4 tabular-nums text-v2-text-text-muted">
        {props.count}
      </span>
      <Show when={props.onToggle}>
        <Icon
          name="chevron-down"
          size="small"
          class="ms-auto shrink-0 transition-transform"
          classList={{ "-rotate-90 rtl:rotate-90": !props.expanded }}
        />
      </Show>
    </>
  )

  return (
    <Show
      when={props.onToggle}
      fallback={
        <div class="flex h-7 shrink-0 items-center gap-1.5 px-1.5 text-[12px] leading-4 font-medium text-v2-text-text-faint">
          {content()}
        </div>
      }
    >
      {(toggle) => (
        <button
          type="button"
          data-slot="sidebar-projects-dock-header"
          aria-expanded={props.expanded}
          class="flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] px-1.5 text-start text-[12px] leading-4 font-medium text-v2-text-text-faint hover:text-v2-text-text-muted focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
          onClick={toggle()}
        >
          {content()}
        </button>
      )}
    </Show>
  )
}

/**
 * A session in the Dock, laid out like an Inbox row: project avatar and name with the status (or working duration)
 * on the first line, the session title on the second. Approval rows add the quick decisions below.
 */
function DockRow(props: {
  entry: InboxEntry
  selected: boolean
  now: number
  onOpen: () => void
  onDecide: (decision: "once" | "always" | "reject") => void
}) {
  const language = useLanguage()
  const project = createMemo(() => props.entry.ctx.projects.forSession(props.entry.session))
  const status = () => props.entry.status

  const compact = (seconds: number) => {
    if (seconds < 60) return language.plural("sidebar.inbox.elapsed.seconds", seconds)

    if (seconds < 3600) return language.plural("sidebar.inbox.elapsed.minutes", Math.floor(seconds / 60))

    if (seconds < 86_400) return language.plural("sidebar.inbox.elapsed.hours", Math.floor(seconds / 3600))

    return language.plural("sidebar.inbox.elapsed.days", Math.floor(seconds / 86_400))
  }

  // Without the current run's start yet, say only that the session is working.
  const working = () => {
    const since = workingSince(props.entry.session)

    if (since === undefined) return language.t("sidebar.inbox.status.working")

    return language.t("sidebar.inbox.status.workingFor", {
      duration: compact(Math.max(0, Math.floor((props.now - since) / 1000))),
    })
  }

  const age = () => {
    const seconds = Math.max(
      0,
      Math.floor((props.now - (props.entry.session.time.idle ?? props.entry.session.time.updated)) / 1000),
    )

    return seconds < 60 ? language.t("sidebar.inbox.time.now") : compact(seconds)
  }

  return (
    <div
      data-slot="sidebar-projects-dock-item"
      data-status={status()}
      data-state={props.selected ? "active" : undefined}
      class="flex shrink-0 flex-col rounded-[6px] hover:bg-v2-overlay-simple-overlay-hover data-[state=active]:bg-v2-background-bg-layer-02"
    >
      <button
        type="button"
        class="flex w-full min-w-0 flex-col gap-0.5 rounded-[6px] px-1.5 py-1 text-start focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
        aria-current={props.selected ? "page" : undefined}
        onClick={props.onOpen}
      >
        <span class="flex h-4 w-full min-w-0 items-center gap-1.5 text-[12px] leading-4 text-v2-text-text-faint">
          <span class="flex size-4 shrink-0 items-center justify-center">
            <Show
              when={project()}
              fallback={
                <SessionTabAvatarView
                  project={undefined}
                  directory={props.entry.session.location.directory}
                  unread={false}
                />
              }
            >
              {(value) => (
                <ProjectGlyph project={value()} projectKey={projectKey(props.entry.server, value().worktree)} />
              )}
            </Show>
          </span>
          <bdi class="min-w-0 truncate">
            {displayName(project() ?? { worktree: props.entry.session.location.directory })}
          </bdi>
          <span class="ms-auto flex shrink-0 items-center gap-1 tabular-nums" role="status">
            <Show
              when={status() === "working"}
              fallback={
                <>
                  <span
                    classList={{
                      "text-v2-state-fg-warning": status() === "approval" || status() === "input",
                      "text-v2-state-fg-danger": status() === "failed",
                      "text-v2-state-fg-success": status() === "done",
                    }}
                  >
                    {language.t(`sidebar.inbox.status.${status() === "ready" ? "done" : status()}`)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{age()}</span>
                </>
              }
            >
              <ActivityRing width={12} height={12} />
              {/* Announce only the status: the ticking duration would be re-read every second. */}
              <span class="sr-only">{language.t("sidebar.inbox.status.working")}</span>
              {/* Keep the status colour under the sweep. */}
              <span
                aria-hidden="true"
                class="text-v2-state-fg-info [&_[data-component=text-shimmer]]:[--text-shimmer-base-color:var(--v2-state-fg-info)]!"
              >
                <TextShimmer text={working()} active />
              </span>
            </Show>
          </span>
        </span>
        <span
          dir="auto"
          class="w-full min-w-0 truncate text-[13px] leading-4"
          classList={{
            "font-medium text-v2-text-text-base": status() !== "working",
            "text-v2-text-text-muted": status() === "working",
          }}
        >
          {sessionTabTitle(props.entry.session.title, language.t("session.tab.session"))}
        </span>
      </button>
      <Show when={status() === "approval"}>
        <div data-slot="sidebar-projects-dock-decide" class="flex items-center justify-end gap-1 px-1.5 pb-1">
          <Button variant="ghost-muted" size="small" onClick={() => props.onDecide("reject")}>
            {language.t("ui.permission.deny")}
          </Button>
          <Button variant="neutral" size="small" onClick={() => props.onDecide("once")}>
            {language.t("ui.permission.allowOnce")}
          </Button>
        </div>
      </Show>
    </div>
  )
}
