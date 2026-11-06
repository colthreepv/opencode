import { test } from "node:test"
import { deepStrictEqual, equal, throws } from "node:assert/strict"
import { compare, config, latest, marker, selectIssue, stable } from "./common.mjs"

test("stable v2 tags and semantic release ordering", () => {
  for (const tag of ["v1.99.1", "v2.1.0-rc.1", "v2.01.2", "v2.3.4\n", "v2.3.4;echo"]) equal(stable(tag), false)
  equal(compare("v2.10.0", "v2.9.100"), 1)
  equal(latest([
    { tag_name: "v2.10.0", draft: true }, { tag_name: "v2.99.0", prerelease: true },
    { tag_name: "v1.99.0" }, { tag_name: "v2.9.3" }, { tag_name: "v2.9.10" },
  ]), "v2.9.10")
})

test("validates configuration and selects one exact issue including closed issues", () => {
  const good = { upstream: "anomalyco/opencode", baseTag: "v2.2.5", branch: "sidebar-projects", mention: "colthreepv" }
  deepStrictEqual(config(good), good)
  for (const bad of [{ ...good, upstream: "other/repo" }, { ...good, baseTag: "v1.0.0" },
    { ...good, branch: "other" }, { ...good, mention: "x\n@all" }]) throws(() => config(bad))
  const issues = [
    { number: 4, body: marker("v2.2.5"), pull_request: {} },
    { number: 7, body: marker("v2.2.50") },
    { number: 6, body: marker("v2.2.5"), state: "closed" },
    { number: 5, body: marker("v2.2.5") },
  ]
  equal(selectIssue(issues, "v2.2.5").number, 5)
  equal(selectIssue(issues, "v2.2.6"), undefined)
})
