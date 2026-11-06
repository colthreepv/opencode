import { expect, test } from "bun:test"
import { dockSize } from "./dock"

test("dock reserves the first attention row while ongoing and attention both overflow", () => {
  const input = {
    container: 400,
    attention: true,
    attentionHeight: 300,
    firstAttentionHeight: 76,
    collapsed: false,
    ongoing: true,
    ongoingHeight: 500,
  }
  expect(dockSize(input)).toEqual({ min: 56, max: 200, ongoing: 96, attention: 104, height: 200 })
  expect(dockSize({ ...input, height: 80 })).toEqual({ min: 56, max: 200, ongoing: 28, attention: 52, height: 80 })
  expect(dockSize({ ...input, collapsed: true })).toEqual({ min: 56, max: 200, ongoing: 172, attention: 28, height: 200 })
  expect(dockSize({ ...input, ongoing: false })).toEqual({ min: 52, max: 200, ongoing: 24, attention: 176, height: 200 })
})
