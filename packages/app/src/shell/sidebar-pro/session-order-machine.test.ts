import { expect, test } from "bun:test"
import { SessionOrder } from "./session-order-machine"

test("order reconciliation preserves unchanged state identity and resets when switching archive views", () => {
  const idle: SessionOrder.State = { type: "idle", archived: false, pinned: ["pin"], unpinned: ["a", "b"] }
  const busy = SessionOrder.transition(idle, {
    type: "reconcile",
    busy: true,
    archived: false,
    pinned: ["pin"],
    unpinned: ["b", "a"],
  })

  expect(busy).toEqual({ type: "busy", archived: false, pinned: ["pin"], unpinned: ["a", "b"] })
  expect(
    SessionOrder.transition(busy, {
      type: "reconcile",
      busy: true,
      archived: false,
      pinned: ["pin"],
      unpinned: ["b", "a"],
    }),
  ).toBe(busy)

  const archived = SessionOrder.transition(busy, {
    type: "reconcile",
    busy: true,
    archived: true,
    pinned: [],
    unpinned: ["b", "a"],
  })

  expect(archived).toEqual({ type: "busy", archived: true, pinned: [], unpinned: ["b", "a"] })
  expect(
    SessionOrder.transition(archived, {
      type: "reconcile",
      busy: false,
      archived: true,
      pinned: [],
      unpinned: ["a", "b"],
    }),
  ).toEqual({ type: "idle", archived: true, pinned: [], unpinned: ["a", "b"] })
  expect(idle).toEqual({ type: "idle", archived: false, pinned: ["pin"], unpinned: ["a", "b"] })
})
