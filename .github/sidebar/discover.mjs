import { appendFile, readFile } from "node:fs/promises"
import { api, compare, config, latest, pages, selectIssue, stable } from "./common.mjs"

const cfg = config(JSON.parse(await readFile(".github/sidebar/config.json", "utf8")))
const requested = process.env.RELEASE_TAG || ""
if (requested && !stable(requested)) throw new Error("Manual tag must be a stable v2 semantic tag")
const releases = await pages(`/repos/${cfg.upstream}/releases`)
const tag = requested || latest(releases)
if (!tag || !releases.some((r) => r.tag_name === tag && !r.draft && !r.prerelease)) throw new Error("Stable release not found")
const ref = await api(`/repos/${process.env.GITHUB_REPOSITORY}/commits/${encodeURIComponent(cfg.branch)}`)
const sha = ref.sha
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid fork commit")
const issues = await pages(`/repos/${process.env.GITHUB_REPOSITORY}/issues?state=all`)
const issue = selectIssue(issues, tag)
const seen = issue?.body.includes(`<!-- sidebar-fork:${sha} -->`) ?? false
if (requested && compare(tag, cfg.baseTag) < 0) throw new Error("Manual tag cannot precede the base tag")
const run = requested ? true : compare(tag, cfg.baseTag) > 0 && !seen
console.log(`${tag} vs ${cfg.baseTag}: ${run ? "checking" : "already checked or not newer"}`)
await appendFile(process.env.GITHUB_OUTPUT, `run=${run}\ntag=${tag}\nsha=${sha}\n`)
