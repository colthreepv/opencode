import { isSessionNotFoundError, type SessionInfo } from "@opencode/client/promise"
import { useInfiniteQuery, useQueries, useQueryClient } from "@tanstack/solid-query"
import { createEffect, createMemo, onCleanup, untrack } from "solid-js"
import type { ServerConnection } from "@/runtime/server/registry"
import type { ServerCtx } from "@/runtime/server/runtime"
import type { LocalProject } from "@/shell/state/layout"
import { projectKey } from "./state"

/** Session actions invalidate this prefix per server, so archived discovery and pages refresh after a change. */
export const ARCHIVED_QUERY = "sidebar-projects-archived"

const SESSIONS_QUERY = "sidebar-projects-sessions"

const PIN_QUERY = "sidebar-projects-pin"

const PAGE_SIZE = 50

// Discovery probes every catalog project; keep the burst small so it never competes with the session being opened.
const CONCURRENCY = 4

const CACHE_TIME = 30 * 60_000

// Events that can change which projects hold archived root sessions.
const ARCHIVE_EVENTS = ["session.archived", "session.unarchived", "session.moved", "session.deleted"] as const

export type SidebarProject = {
  key: string
  server: ServerConnection.Key
  ctx: ServerCtx
  project: LocalProject
}

export type SidebarPin = {
  key: string
  id: string
  server: ServerConnection.Key
  ctx: ServerCtx
}

const limit = createLimiter(CONCURRENCY)

/**
 * Which projects hold archived root sessions. Each project is probed once with a one-row page, so projects that only
 * have archived conversations still appear, without loading any archive until a project is expanded.
 */
export function createArchiveDiscovery(props: { enabled: () => boolean; projects: () => SidebarProject[] }) {
  const queryClient = useQueryClient()

  const queries = useQueries(() => ({
    queries: props.projects().map((item) => ({
      queryKey: [ARCHIVED_QUERY, item.server, "exists", item.key] as const,
      enabled: props.enabled() && item.ctx.sdk.connection.status() === "connected",
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        limit(() =>
          item.ctx.sdk.api.session
            .list({ ...projectFilter(item.project), parentID: null, archived: true, limit: 1 }, { signal })
            .then((response) => response.data[0] ?? null),
        ),
      retry: false,
      staleTime: 60_000,
      gcTime: CACHE_TIME,
    })),
  }))

  // The probe answers with the newest archived session. Once live events unarchive, move or delete that session, the
  // answer is stale: hide the project until a fresh probe finds another one.
  const probes = createMemo(() =>
    props.projects().map((item, index) => {
      const probe = queries[index]?.isSuccess ? queries[index]?.data : undefined

      if (!probe) return { item, index, found: false, stale: false }
      const session = item.ctx.data.session.apply([item.ctx.data.session.get(probe.id) ?? probe])[0]
      const project = session && item.ctx.projects.forSession(session)

      const found =
        !!session &&
        session.time.archived !== undefined &&
        projectKey(item.server, project?.worktree ?? session.location.directory) === item.key

      return { item, index, found, stale: !found }
    }),
  )

  // Once per probe answer, so a server still reporting a session the live store has unarchived cannot loop.
  const refreshed = new Set<string>()

  createEffect(() =>
    probes().forEach((probe) => {
      const query = queries[probe.index]
      const answer = query?.isSuccess ? query.data : undefined
      const id = `${probe.item.key}\0${answer?.id ?? ""}`

      if (!probe.stale || !query || query.isFetching || refreshed.has(id)) return
      refreshed.add(id)
      void untrack(() => query.refetch())
    }),
  )

  // Another client archiving a session this one never loaded only reaches us as an event, and a project probed empty
  // would otherwise stay hidden until its probe goes stale. One subscription per server, only while the archive shows.
  const servers = createMemo(
    () => [...new Map(props.projects().map((item) => [String(item.server), item] as const)).values()],
    [],
    { equals: (a, b) => a.length === b.length && a.every((item, index) => item.ctx === b[index]?.ctx) },
  )

  createEffect(() => {
    if (!props.enabled()) return
    servers().forEach((item) => {
      const invalidate = () => void queryClient.invalidateQueries({ queryKey: [ARCHIVED_QUERY, item.server] })

      ARCHIVE_EVENTS.forEach((type) => onCleanup(item.ctx.data.on(type, invalidate)))
    })
  })

  const found = createMemo(() => new Set(probes().flatMap((probe) => (probe.found ? [probe.item.key] : []))))

  return {
    found: (key: string) => found().has(key),
    loading: () => queries.some((query) => query.isLoading),
    failed: () => queries.some((query) => query.isError),
    retry: () => queries.filter((query) => query.isError).forEach((query) => void query.refetch()),
  }
}

/**
 * Root sessions of one project, newest first, 50 per page. Normal and archived lists are separate queries: the server
 * returns both kinds when `archived` is omitted.
 */
export function createProjectPages(props: { item: () => SidebarProject | undefined; archived: () => boolean }) {
  const query = useInfiniteQuery(() => {
    const item = props.item()
    const archived = props.archived()

    return {
      queryKey: [archived ? ARCHIVED_QUERY : SESSIONS_QUERY, item?.server ?? "", "pages", item?.key ?? ""] as const,
      enabled: !!item && item.ctx.sdk.connection.status() === "connected",
      // SAFETY: the first request has no cursor; subsequent page parameters are opaque server cursor strings.
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page: { sessions: SessionInfo[]; next?: string }) => page.next,
      queryFn: ({ pageParam, signal }: { pageParam: string | undefined; signal: AbortSignal }) => {
        if (!item) return Promise.resolve({ sessions: [] })

        return item.ctx.sdk.api.session
          .list(
            {
              ...projectFilter(item.project),
              parentID: null,
              archived,
              limit: PAGE_SIZE,
              order: "desc",
              cursor: pageParam,
            },
            { signal },
          )
          .then((response) => {
            // Unarchived rows join the live store so they get inbox status; archived pages stay in this cache only.
            if (!archived)
              response.data.forEach((session) => {
                if (!item.ctx.data.session.get(session.id)) item.ctx.data.session.remember(session)
              })

            return { sessions: response.data, next: response.cursor.next ?? undefined }
          })
      },
      retry: false,
      staleTime: 30_000,
      gcTime: CACHE_TIME,
    }
  })

  // Reading `data` before the first page arrives would suspend the tree.
  const sessions = createMemo(() =>
    query.dataUpdatedAt > 0 ? (query.data?.pages.flatMap((page) => page.sessions) ?? []) : [],
  )

  return {
    sessions,
    loaded: () => query.dataUpdatedAt > 0,
    loading: () => query.isLoading || query.isFetchingNextPage,
    failed: () => query.isError,
    more: () => query.hasNextPage,
    next: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    },
    retry: () => void (query.dataUpdatedAt > 0 ? query.fetchNextPage() : query.refetch()),
  }
}

/**
 * Loads pinned sessions the client does not know yet by ID, so old pins never depend on the inbox index or a project
 * page reaching them. Loaded sessions join the live store, which then keeps them current.
 */
export function createPinHydration(props: { pins: () => SidebarPin[] }) {
  const queries = useQueries(() => ({
    queries: props.pins().map((pin) => ({
      queryKey: [PIN_QUERY, pin.server, pin.id] as const,
      enabled: pin.ctx.sdk.connection.status() === "connected",
      queryFn: () =>
        limit(() =>
          pin.ctx.sdk.api.session
            .get({ sessionID: pin.id })
            .then((session) => {
              if (!pin.ctx.data.session.get(session.id)) pin.ctx.data.session.remember(session)

              return true
            })
            .catch((cause) => {
              // A deleted pinned session stays pinned but renders nowhere; the user can no longer reach it to unpin.
              if (isSessionNotFoundError(cause)) return false
              throw cause
            }),
        ),
      retry: false,
      staleTime: Infinity,
      refetchOnReconnect: "always",
      gcTime: CACHE_TIME,
    })),
  }))

  return {
    loading: () => queries.some((query) => query.isLoading),
  }
}

/** Splits a pin key (`server \0 sessionID`). */
export function pinTarget(key: string) {
  const split = key.lastIndexOf("\0")

  return { server: key.slice(0, split), id: key.slice(split + 1) }
}

// Projects without a root commit share the `global` ID, so their sessions are told apart by directory.
function projectFilter(project: LocalProject) {
  return { project: project.id, directory: project.id === "global" ? project.worktree : undefined }
}

function createLimiter(max: number) {
  const state = { active: 0 }
  const waiting: (() => void)[] = []

  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        state.active++
        task()
          .then(resolve, reject)
          .finally(() => {
            state.active--
            waiting.shift()?.()
          })
      }

      if (state.active < max) {
        start()

        return
      }

      waiting.push(start)
    })
}
