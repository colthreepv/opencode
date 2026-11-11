import { describe, expect, test } from "bun:test"
import { hasRunningService } from "./service-registration"

describe("service registration", () => {
  test("preserves a live process even when its service is unreachable", () => {
    expect(hasRunningService(JSON.stringify({ pid: process.pid, url: "http://127.0.0.1:1" }))).toBe(true)
  })

  test("allows recovery after the registered process exits", async () => {
    const child = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" })
    await child.exited
    expect(hasRunningService(JSON.stringify({ pid: child.pid }))).toBe(false)
  })

  test.each(["invalid", "{}", '{"pid":0}', '{"pid":-1}', '{"pid":1.5}', '{"pid":"42"}'])(
    "preserves an unrecognized registration: %s",
    (text) => {
      expect(hasRunningService(text)).toBe(true)
    },
  )
})
