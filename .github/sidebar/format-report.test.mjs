import { test } from "node:test"
import { equal, match, doesNotMatch } from "node:assert/strict"
import { formatReport } from "./format-report.mjs"

const cfg = { baseTag: "v2.2.5", upstream: "anomalyco/opencode", mention: "colthreepv" }
const input = {
  cfg, repository: "colthreepv/opencode", run: "https://github.com/colthreepv/opencode/actions/runs/42", encoded: true, issue: true,
  data: { tag: "v2.2.5", base: "v2.2.5", sha: "a".repeat(40), ok: false, checks: [
    { name: "install", ok: true, detail: "ignored" },
    { name: "bad </summary> @all `|\nname", ok: false, detail: "\u001b[31mfirst\u001b[0m\r\n````\n</details><script>@all</script>\nlast" },
  ] },
}

test("renders checks with real newlines and safely contains hostile failure output", () => {
  const body = formatReport(input)
  match(body, /<!-- sidebar-upstream:v2\.2\.5 -->\n<!-- sidebar-fork:a{40} -->/)
  match(body, /## Same-base compatibility probe: failed/)
  match(body, /\[aaaaaaa\]\(https:\/\/github\.com\/colthreepv\/opencode\/commit\/a{40}\)/)
  match(body, /- \[x\] install\n- \[ \] bad/)
  match(body, /<summary>bad &#60;\/summary&#62; &#64;all &#96;&#124; name — failure details<\/summary>/)
  match(body, /`````text\nfirst\n````\n&#60;\/details&#62;&#60;script&#62;@all&#60;\/script&#62;\nlast\n`````\n<\/details>/)
  doesNotMatch(body, /\x1b|<script>|\\n/)
  equal((body.match(/<details>/g) || []).length, 1)
})

test("only mentions on creation and omits the fork marker for setup failures", () => {
  const body = formatReport({ ...input, encoded: false, issue: false })
  match(body, /<!-- sidebar-upstream:v2\.2\.5 -->\n@colthreepv\n/)
  doesNotMatch(body, /<!-- sidebar-fork:/)
})
