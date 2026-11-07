import { expect, type Page } from "@playwright/test"
import { comparablePath } from "@opencode/util/path"
import { Predicate } from "effect"
import type { SidebarProStore } from "@/shell/sidebar-pro/state"
import { project } from "./app"
import { mockWorkspace, type WorkspaceInput } from "./workspace"
import { APP_READY_TIMEOUT } from "./waits"

/** Persisted Projects sidebar layout (`Persist.global("sidebar-projects")`). */
export const SIDEBAR_PROJECTS_STORAGE = "opencode.global.dat:sidebar-projects"

/** A pinned-session key and the project key it belongs to, both as the Projects sidebar persists them. */
export function sidebarProjectKey(server: string, directory: string) {
  return `${server}\0${comparablePath(directory)}`
}

export function pinnedSession(server: string, sessionID: string, directory: string) {
  return { [`${server}\0${sessionID}`]: sidebarProjectKey(server, directory) }
}

export function sidebarProjectsStorage(input: Partial<SidebarProStore["store"]> = {}) {
  return {
    [SIDEBAR_PROJECTS_STORAGE]: {
      groups: [],
      placement: {},
      glyphs: {},
      expanded: {},
      hidden: {},
      pins: {},
      archived: false,
      shown: {},
      dock: { attentionCollapsed: false },
      ...input,
    },
  }
}

/** Opens Home with the Projects interface mode and waits for its tree. */
export async function openProjectsSidebar(
  page: Page,
  input: WorkspaceInput & { sidebar?: Partial<SidebarProStore["store"]> },
) {
  const { sidebar, ...workspace } = input
  // A catalog entry replaces the mock server's default project inventory, so keep the primary project in it.

  const primary = project({
    id: workspace.project?.id ?? `proj_${workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    directory: workspace.directory ?? `C:/OpenCode/${workspace.name}`,
    name: workspace.name,
    ...workspace.project,
  })

  const extra = workspace.projects

  const projects =
    extra === undefined ? undefined : Predicate.isFunction(extra) ? () => [primary, ...extra()] : [primary, ...extra]

  const opened = await mockWorkspace(page, {
    ...workspace,
    projects,
    seed: {
      settings: { appearance: { tabLayout: "projects" } },
      ...workspace.seed,
      storage: { ...sidebarProjectsStorage(sidebar), ...workspace.seed?.storage },
    },
  })

  await page.goto("/")
  await expect(page.locator('[data-slot="sidebar-projects-tree"]')).toBeVisible({ timeout: APP_READY_TIMEOUT })

  return { ...opened, sidebar: sidebarProjects(page) }
}

/** The Projects sidebar's stable, user-visible parts. */
export function sidebarProjects(page: Page) {
  const root = page.locator('[data-slot="sidebar-projects"]')
  const tree = root.locator('[data-slot="sidebar-projects-tree"]')
  const sessions = tree.locator('[data-slot="sidebar-projects-session-item"]')
  const items = sessions
  const name = (title: string) => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  const session = (title: string) => tree.getByRole("treeitem", { name: name(title) })

  const row = (title: string) => items.filter({ has: page.getByRole("treeitem", { name: name(title) }) })

  const action = (title: string, name: string) => row(title).getByRole("button", { name, exact: true })

  return {
    root,
    tree,
    groups: tree.locator('[data-slot="sidebar-projects-group"]'),
    projects: tree.locator('[data-slot="sidebar-projects-project"]'),
    sessions,
    row,
    session,
    project: (name: string) => tree.locator('[data-slot="sidebar-projects-project"]').filter({ hasText: name }),
    group: (name: string) => tree.locator('[data-slot="sidebar-projects-group"]').filter({ hasText: name }),
    showMore: tree.locator('[data-slot="sidebar-projects-show-more"]'),
    archived: root.getByRole("button", { name: /^Archived( conversations)?$/ }),
    pin: (title: string) => action(title, "Pin conversation"),
    unpin: (title: string) => action(title, "Unpin conversation"),
    archive: (title: string) => action(title, "Archive conversation"),
    unarchive: (title: string) => action(title, "Unarchive conversation"),
    dock: root.locator('[data-slot="sidebar-projects-dock"]'),
  }
}
