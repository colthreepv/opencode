import { appendFile, readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"

// This script was copied from the workflow revision before checking out candidate code.
const cfg = JSON.parse(await readFile(process.env.SIDEBAR_CONFIG, "utf8"))
const result = { tag: process.env.TAG, sha: process.env.FORK_SHA, base: cfg.baseTag, checks: [] }
const safeEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true",
  GIT_COMMITTER_NAME: "Sidebar Pro compatibility check",
  GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
}
delete safeEnv.GITHUB_OUTPUT
delete safeEnv.GITHUB_ENV
delete safeEnv.GITHUB_PATH
delete safeEnv.GITHUB_STEP_SUMMARY
function command(name, args, cwd) {
  const p = spawnSync(args[0], args.slice(1), { cwd, env: safeEnv, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
  const text = `${p.stdout || ""}${p.stderr || ""}${p.error || ""}`
  console.log(`\n--- ${name}: ${p.status === 0 ? "passed" : "failed"} ---\n${text.slice(-12000)}`)
  result.checks.push({ name, ok: p.status === 0, detail: p.status === 0 ? "" : text.slice(-2500) })
  return p.status === 0
}
const git = (...args) => command(`git ${args[0]}`, ["git", ...args])
let ok = git("checkout", "--detach", result.sha) &&
  git("fetch", "--no-tags", `https://github.com/${cfg.upstream}.git`, `refs/tags/${result.base}:refs/tags/sidebar-base`) &&
  git("fetch", "--no-tags", `https://github.com/${cfg.upstream}.git`, `refs/tags/${result.tag}:refs/tags/sidebar-candidate`) &&
  git("-c", "core.hooksPath=/dev/null", "rebase", "--onto", "refs/tags/sidebar-candidate", "refs/tags/sidebar-base")
if (!ok) {
  const conflicts = spawnSync("git", ["diff", "--name-only", "--diff-filter=U", "-z"], { encoding: "utf8", env: safeEnv })
  const names = (conflicts.stdout || "").split("\0").filter(Boolean).slice(0, 100)
  if (names.length) result.checks.push({ name: "conflicted files", ok: false, detail: JSON.stringify(names, null, 2) })
} else {
  const installed = command("frozen install", ["bun", "install", "--frozen-lockfile"])
  ok = installed
  if (installed) {
    for (const name of ["app", "ui", "desktop"]) {
      if (!command(`${name} typecheck:tsc`, ["bun", "run", "typecheck:tsc"], `packages/${name}`)) ok = false
    }
    if (!command("app unit tests", ["bun", "run", "test:unit"], "packages/app")) ok = false
    if (!command("web build", ["bun", "run", "build"], "packages/app")) ok = false
  }
}
result.ok = ok
const encoded = Buffer.from(JSON.stringify(result)).toString("base64")
await appendFile(process.env.GITHUB_OUTPUT, `report=${encoded}\n`)
process.exitCode = ok ? 0 : 1
