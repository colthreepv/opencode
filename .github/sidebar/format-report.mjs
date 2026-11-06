import { marker } from "./common.mjs"

// Check names and logs come from the candidate checkout and must not introduce Markdown or HTML.
const escape = (text) => text.replace(/[&<>@`*_\[\]\\|]/g, (char) => `&#${char.codePointAt(0)};`)
const clean = (text) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r\n?/g, "\n")

export function formatReport({ data, cfg, repository, run, encoded, issue }) {
  const probe = data.tag === cfg.baseTag
  const checks = data.checks.map((check) => `- [${check.ok ? "x" : " "}] ${escape(clean(check.name).replace(/\n/g, " "))}${check.ok ? "" : " — failed"}`).join("\n")
  const failures = data.checks.filter((check) => !check.ok && check.detail).map((check) => {
    const log = clean(check.detail).replace(/[&<>]/g, (char) => `&#${char.codePointAt(0)};`)
    const longest = Math.max(0, ...Array.from(log.matchAll(/`+/g), (match) => match[0].length))
    const fence = "`".repeat(Math.max(3, longest + 1))
    return `<details>\n<summary>${escape(clean(check.name).replace(/\n/g, " "))} — failure details</summary>\n\n${fence}text\n${log}\n${fence}\n</details>`
  }).join("\n\n")
  return `${marker(data.tag)}\n${encoded ? `<!-- sidebar-fork:${data.sha} -->\n` : ""}${issue ? "" : `@${cfg.mention}\n\n`}` +
    `## ${probe ? "Same-base compatibility probe" : "Upstream compatibility"}: ${data.ok ? "passed" : "failed"}\n\n` +
    `Base: [${data.base}](https://github.com/${cfg.upstream}/releases/tag/${data.base}) · Candidate: [${data.tag}](https://github.com/${cfg.upstream}/releases/tag/${data.tag}) · Fork: [${data.sha.slice(0, 7)}](https://github.com/${repository}/commit/${data.sha}) · [Workflow run](${run})\n\n` +
    `### Checks\n\n${checks}\n${failures ? `\n${failures}\n` : ""}`
}
