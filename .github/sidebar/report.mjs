import { readFile } from "node:fs/promises"
import { api, config, pages, selectIssue, stable } from "./common.mjs"
import { formatReport } from "./format-report.mjs"

const cfg = config(JSON.parse(await readFile(".github/sidebar/config.json", "utf8")))
const encoded = process.env.REPORT || ""
if (encoded && (encoded.length > 50000 || !/^[a-zA-Z0-9+/]+=*$/.test(encoded))) throw new Error("Invalid check report")
const data = encoded ? JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) : {
  tag: process.env.EXPECTED_TAG, sha: process.env.EXPECTED_SHA, base: cfg.baseTag, ok: false,
  checks: [{ name: "workflow setup or execution", ok: false, detail: "Check job failed or timed out before producing a report; see workflow logs." }],
}
if (!stable(data.tag) || data.tag !== process.env.EXPECTED_TAG || data.sha !== process.env.EXPECTED_SHA ||
    !/^[a-f0-9]{40}$/.test(data.sha) || data.base !== cfg.baseTag || typeof data.ok !== "boolean" ||
    !Array.isArray(data.checks) || data.checks.length > 20 || !data.checks.every((c) =>
      typeof c.name === "string" && c.name.length <= 100 && typeof c.ok === "boolean" &&
      typeof c.detail === "string" && c.detail.length <= 5000)) throw new Error("Invalid check report contents")
const issues = await pages(`/repos/${process.env.GITHUB_REPOSITORY}/issues?state=all`)
const issue = selectIssue(issues, data.tag)
const probe = data.tag === cfg.baseTag
const title = probe ? `Sidebar Pro compatibility probe: ${data.tag}` : `Sidebar Pro compatibility with upstream ${data.tag}`
const run = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
const body = formatReport({ data, cfg, repository: process.env.GITHUB_REPOSITORY, run, encoded, issue })
const endpoint = `/repos/${process.env.GITHUB_REPOSITORY}/issues${issue ? `/${issue.number}` : ""}`
await api(endpoint, { method: issue ? "PATCH" : "POST", body: JSON.stringify({ title, body }), headers: { "content-type": "application/json" } })
console.log(`${issue ? "Updated" : "Created"} compatibility issue for ${data.tag}`)
