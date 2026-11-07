import { expect, test } from "@playwright/test"
import { project, SERVER, sessionHref } from "../utils/app"
import {
  openProjectsSidebar,
  pinnedSession,
  SIDEBAR_PROJECTS_STORAGE,
  sidebarProjectKey,
} from "../utils/sidebar-projects"
import { APP_READY_TIMEOUT, expectSessionTitle } from "../utils/waits"

test("keeps a pinned conversation beyond the first page above the newest ones and pages the rest", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const directory = "C:/OpenCode/Pinned"
  // More sessions than the inbox index keeps, so only the targeted pin request can load the oldest one.

  const sessions = Array.from({ length: 205 }, (_, index) => ({
    id: `ses_pin_${index}`,
    title: `Pinned project session ${index}`,
    directory,
    time: { created: 1_000 + index, updated: 1_000 + index },
  }))

  const requested: string[] = []

  const { sidebar } = await openProjectsSidebar(page, {
    name: "Pinned",
    directory,
    sessions,
    onSession: (sessionID) => requested.push(sessionID),
    seed: { tabs: [] },
    sidebar: {
      expanded: { [sidebarProjectKey(SERVER, directory)]: true },
      pins: pinnedSession(SERVER, "ses_pin_0", directory),
    },
  })

  // A 205-session index and the targeted pin request finish after the shell renders, so allow the first render budget.
  await expect(sidebar.sessions.nth(0)).toHaveText("Pinned project session 0", { timeout: APP_READY_TIMEOUT })
  expect(requested).toContain("ses_pin_0")
  await expect(sidebar.sessions).toHaveCount(6)
  await expect(sidebar.showMore).toBeVisible()
  await sidebar.showMore.click()
  await expect(sidebar.sessions).toHaveCount(11)
  await expect(sidebar.session("Pinned project session 0")).toHaveCount(1)
})

test("shows only the groups and projects that hold archived conversations and pages them beyond 50", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const activeDirectory = "C:/OpenCode/Archive Active"
  const historyDirectory = "C:/OpenCode/Archive History"
  const activeKey = sidebarProjectKey(SERVER, activeDirectory)
  const historyKey = sidebarProjectKey(SERVER, historyDirectory)
  const archivedPages: URL[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())

    if (
      url.pathname === "/api/session" &&
      url.searchParams.get("archived") === "true" &&
      url.searchParams.get("cursor")
    )
      archivedPages.push(url)
  })

  const { sidebar } = await openProjectsSidebar(page, {
    name: "Archive Active",
    directory: activeDirectory,
    projects: [project({ id: "proj_archive_history", directory: historyDirectory, name: "Archive History" })],
    sessions: [
      {
        id: "ses_archive_active",
        title: "Active conversation",
        directory: activeDirectory,
        time: { created: 1, updated: 1_000 },
      },
      ...Array.from({ length: 55 }, (_, index) => ({
        id: `ses_archive_history_${index}`,
        title: `Archived conversation ${index}`,
        directory: historyDirectory,
        projectID: "proj_archive_history",
        time: { created: index + 2, updated: 999 - index, archived: 1_000 },
      })),
    ],
    seed: { tabs: [], usedProjects: { local: ["proj_archive_active"] } },
    sidebar: {
      groups: [
        { id: "grp_active", name: "Active group", collapsed: false },
        { id: "grp_history", name: "History group", collapsed: false },
        { id: "grp_empty", name: "Empty group", collapsed: false },
      ],
      placement: {
        [activeKey]: { group: "grp_active", order: 0 },
        [historyKey]: { group: "grp_history", order: 0 },
      },
      expanded: { [activeKey]: true, [historyKey]: true },
    },
  })

  await expect(sidebar.group("Active group")).toBeVisible()
  await expect(sidebar.group("History group")).toBeVisible()
  await expect(sidebar.group("Empty group")).toBeVisible()
  await expect(sidebar.session("Active conversation")).toBeVisible()
  await expect(sidebar.session("Archived conversation 0")).toHaveCount(0)

  await sidebar.archived.click()
  await expect(sidebar.groups).toHaveCount(1)
  await expect(sidebar.group("History group")).toBeVisible()
  await expect(sidebar.group("Active group")).toHaveCount(0)
  await expect(sidebar.project("Archive Active")).toHaveCount(0)
  await expect(sidebar.sessions).toHaveCount(5, { timeout: APP_READY_TIMEOUT })
  await expect(sidebar.session("Archived conversation 5")).toBeVisible()
  await expect(sidebar.session("Archived conversation 0")).toHaveCount(0)
  await expect(sidebar.session("Active conversation")).toHaveCount(0)

  for (let click = 0; click < 10; click++) await sidebar.showMore.click()
  await expect(sidebar.sessions).toHaveCount(55)
  await expect(sidebar.session("Archived conversation 0")).toBeVisible()
  await expect.poll(() => archivedPages.length).toBeGreaterThan(0)

  await sidebar.archived.click()
  await expect(sidebar.session("Active conversation")).toBeVisible()
  await expect(sidebar.session("Archived conversation 0")).toHaveCount(0)
})

test("opens session actions from the context menu and hover, and keeps the dock live", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.setViewportSize({ width: 1440, height: 900 })
  const directory = "C:/OpenCode/Session Actions"
  const patches: unknown[] = []
  page.on("request", (request) => {
    if (request.method() === "PATCH" && /^\/api\/session\/[^/]+$/.test(new URL(request.url()).pathname))
      patches.push(request.postDataJSON())
  })

  const { sidebar } = await openProjectsSidebar(page, {
    name: "Session Actions",
    directory,
    sessions: [
      { id: "ses_actions_idle", title: "Idle conversation", directory, created: 2 },
      { id: "ses_actions_working", title: "Working conversation", directory, created: 1 },
    ],
    sessionStatus: { ses_actions_working: { type: "running" } },
    sidebar: { expanded: { [sidebarProjectKey(SERVER, directory)]: true } },
  })

  const idle = sidebar.session("Idle conversation")
  const idleRow = sidebar.row("Idle conversation")
  await expect(sidebar.dock.getByText("Working conversation", { exact: true })).toBeVisible()
  await idle.click({ button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Open",
    "Pin conversation",
    "Fork conversation",
    "Copy conversation ID",
    "Copy conversation reference",
    "Mark as unread",
    "Archive conversation",
  ])
  await menu.getByRole("menuitem", { name: "Copy conversation ID", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("ses_actions_idle")
  await expect(page.getByText("Copied", { exact: true })).toBeVisible()
  await expect(idle).toBeFocused()
  await idle.press("Shift+F10")
  await menu.getByRole("menuitem", { name: "Copy conversation reference", exact: true }).click()
  // The reference is serialized locally; it must not read the session or its history.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("@session:ses_actions_idle")
  await idle.press("Shift+F10")
  await menu.getByRole("menuitem", { name: "Pin conversation", exact: true }).click()

  await idleRow.hover()
  await expect(sidebar.unpin("Idle conversation")).toBeVisible()
  await sidebar.unpin("Idle conversation").click()
  await idleRow.hover()
  await expect(sidebar.pin("Idle conversation")).toBeVisible()

  const archived = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/session/ses_actions_idle",
  )

  await idleRow.hover()
  await sidebar.archive("Idle conversation").click()
  expect((await archived).ok()).toBe(true)
  expect(patches).toEqual([{ archived: true }])
  await expect(idle).toHaveCount(0)

  await sidebar.archived.click()
  await expect(sidebar.dock.getByText("Working conversation", { exact: true })).toBeVisible()
  const archivedRow = sidebar.session("Idle conversation")
  await expect(archivedRow).toBeVisible()
  await sidebar.row("Idle conversation").hover()
  await expect(sidebar.unarchive("Idle conversation")).toBeVisible()
  await sidebar.unarchive("Idle conversation").click()
  await expect(archivedRow).toHaveCount(0)
  expect(patches).toEqual([{ archived: true }, { archived: false }])
})

test("keeps a local unread mark until the conversation is opened, including an external navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const directory = "C:/OpenCode/Unread"
  const idleID = "ses_unread_idle"
  const workingID = "ses_unread_working"
  const idleKey = `${SERVER}\0${idleID}`
  const workingKey = `${SERVER}\0${workingID}`

  const unread = () =>
    page.evaluate((storage) => {
      const stored = JSON.parse(localStorage.getItem(storage) ?? "{}")

      return stored.unread ?? {}
    }, SIDEBAR_PROJECTS_STORAGE)

  const { sidebar } = await openProjectsSidebar(page, {
    name: "Unread",
    directory,
    sessions: [
      { id: idleID, title: "Idle conversation", directory, created: 2 },
      { id: workingID, title: "Working conversation", directory, created: 1 },
    ],
    sessionStatus: { [workingID]: { type: "running" } },
    sidebar: { expanded: { [sidebarProjectKey(SERVER, directory)]: true } },
  })

  await expect(sidebar.session("Idle conversation")).toHaveAccessibleName("Idle conversation")

  // The mark is client-local, keyed by server and session, and reads back into the row's accessible name.
  await sidebar.session("Idle conversation").click({ button: "right" })
  await page.getByRole("menuitem", { name: "Mark as unread", exact: true }).click()
  await expect.poll(unread).toEqual({ [idleKey]: true })
  await expect(sidebar.session("Idle conversation")).toHaveAccessibleName("Idle conversation Unread")

  // Marking a working conversation unread must not replace its working status.
  const workingRow = sidebar.tree.getByRole("treeitem", { name: /^Working conversation Working(?: Unread)?$/ })
  await workingRow.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Mark as unread", exact: true }).click()
  await expect.poll(unread).toEqual({ [idleKey]: true, [workingKey]: true })
  await expect(workingRow).toHaveAttribute("data-status", "working")
  await expect(workingRow.locator('[data-component="activity-ring"]')).toHaveCount(1)
  await expect(workingRow).toHaveAccessibleName("Working conversation Working Unread")

  // The mark survives a reload because it is persisted with the Projects layout.
  await page.reload()
  await expect(sidebar.session("Idle conversation")).toHaveAccessibleName("Idle conversation Unread")
  const markedWorking = sidebar.tree.getByRole("treeitem", { name: "Working conversation Working Unread", exact: true })
  await expect(markedWorking).toBeVisible()
  await expect(markedWorking.locator('[data-component="activity-ring"]')).toBeVisible()

  // Opening from the tree clears that session only.
  await sidebar.session("Idle conversation").click()
  await expectSessionTitle(page, "Idle conversation")
  await expect.poll(unread).toEqual({ [workingKey]: true })

  // Navigating to a session from outside the tree clears it on the next opening too.
  await page.goto(sessionHref(workingID))
  await expectSessionTitle(page, "Working conversation")
  await expect.poll(unread).toEqual({})
})

test("marks a server unread result read without opening the conversation", async ({ page }) => {
  const directory = "C:/OpenCode/Read Result"
  const sessionID = "ses_read_result"
  const { sidebar } = await openProjectsSidebar(page, {
    name: "Read Result",
    directory,
    sessions: [
      { id: sessionID, title: "Completed conversation", directory, time: { created: 1, updated: 2, idle: 2 } },
    ],
    seed: { tabs: [] },
    sidebar: { expanded: { [sidebarProjectKey(SERVER, directory)]: true } },
  })
  const row = sidebar.tree.getByRole("treeitem", { name: /^Completed conversation/ })
  await expect(row).toHaveAttribute("data-status", "done")
  await row.click({ button: "right" })
  const viewed = page.waitForRequest(
    (request) => request.method() === "POST" && new URL(request.url()).pathname === `/api/session/${sessionID}/view`,
  )
  await page.getByRole("menuitem", { name: "Mark as read", exact: true }).click()
  expect((await viewed).postDataJSON()).toEqual({ idle: 2 })
  await expect(row).toHaveAttribute("data-status", "ready")
  await expect(row).toHaveAccessibleName("Completed conversation")
  await expect(page).toHaveURL("/")
})
