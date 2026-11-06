import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createData } from "@opencode/client/solid"
import { OpenCode, type SessionInfo } from "@opencode/client/promise"
import { createDesktopData } from "@/runtime/server/data"
import { sessionActivity } from "./session-activity"

test("distinguishes root execution from busy descendants and excludes other families", () => {
  createRoot((dispose) => {
    const raw = createData({
      api: () => OpenCode.make({ baseUrl: "http://unused.invalid" }),
      directory: "/demo",
      event: { on: () => () => {}, listen: () => () => {} },
    })
    const data = createDesktopData({ data: raw, remove: async () => {} })
    const remember = (id: string, parentID?: string, busy?: number) => {
      const info: SessionInfo = {
        id,
        parentID,
        projectID: "project",
        location: { directory: "/demo" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 1, updated: 1, busy },
      }
      data.session.remember(info)
    }
    try {
      remember("root", undefined, 2)
      remember("child", "root", 10)
      remember("nested", "child", 20)
      remember("other", undefined, 1)
      data.session.setStatus("root", "running")
      expect(sessionActivity(data, "root")).toEqual({ main: true, workers: 0, since: undefined })
      data.session.setStatus("child", "running")
      data.session.setStatus("nested", "running")
      data.session.setStatus("other", "running")
      expect(sessionActivity(data, "root")).toEqual({ main: true, workers: 2, since: 10 })
      data.session.setStatus("root", "idle")
      expect(sessionActivity(data, "root")).toEqual({ main: false, workers: 2, since: 10 })
      data.session.setStatus("child", "idle")
      expect(sessionActivity(data, "root")).toEqual({ main: false, workers: 1, since: 20 })
      data.session.setStatus("nested", "idle")
      expect(sessionActivity(data, "root")).toEqual({ main: false, workers: 0, since: undefined })
      remember("nested", "child")
      data.session.setStatus("nested", "running")
      expect(sessionActivity(data, "root")).toEqual({ main: false, workers: 1, since: undefined })
    } finally {
      dispose()
    }
  })
})
