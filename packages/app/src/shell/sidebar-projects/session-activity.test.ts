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
    const remember = (id: string, parentID?: string) => {
      const info: SessionInfo = {
        id,
        parentID,
        projectID: "project",
        location: { directory: "/demo" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 1, updated: 1 },
      }
      data.session.remember(info)
    }
    try {
      remember("root")
      remember("child", "root")
      remember("nested", "child")
      remember("other")
      data.session.setStatus("root", "running")
      expect(sessionActivity(data, "root")).toEqual({ main: true, workers: 0 })
      data.session.setStatus("child", "running")
      data.session.setStatus("nested", "running")
      data.session.setStatus("other", "running")
      expect(sessionActivity(data, "root")).toEqual({ main: true, workers: 2 })
      data.session.setStatus("root", "idle")
      expect(sessionActivity(data, "root")).toEqual({ main: false, workers: 2 })
      data.session.setStatus("child", "idle")
      expect(sessionActivity(data, "root")).toEqual({ main: false, workers: 1 })
      data.session.setStatus("nested", "idle")
      expect(sessionActivity(data, "root")).toEqual({ main: false, workers: 0 })
    } finally {
      dispose()
    }
  })
})
