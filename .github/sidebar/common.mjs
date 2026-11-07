export function config(value) {
  if (!value || value.upstream !== "anomalyco/opencode" || value.branch !== "sidebar-pro" ||
      !stable(value.baseTag) || typeof value.mention !== "string" || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(value.mention) || value.mention.includes("\n")) {
    throw new Error("Invalid sidebar config")
  }
  return value
}

export function stable(tag) {
  return typeof tag === "string" && /^v2\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(tag) && !tag.includes("\n")
}

export function compare(a, b) {
  if (!stable(a) || !stable(b)) throw new Error("Invalid stable v2 tag")
  const left = a.slice(1).split(".").map(Number)
  const right = b.slice(1).split(".").map(Number)
  return left[1] - right[1] || left[2] - right[2]
}

export function latest(releases) {
  return releases.filter((r) => !r.draft && !r.prerelease && stable(r.tag_name))
    .sort((a, b) => compare(b.tag_name, a.tag_name))[0]?.tag_name
}

export function marker(tag) {
  if (!stable(tag)) throw new Error("Invalid tag")
  return `<!-- sidebar-upstream:${tag} -->`
}

export function selectIssue(issues, tag) {
  return issues.filter((i) => !i.pull_request && typeof i.body === "string" && i.body.includes(marker(tag)))
    .sort((a, b) => a.number - b.number)[0]
}

export async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${process.env.GH_TOKEN}`,
      "x-github-api-version": "2022-11-28", ...options.headers },
  })
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 500)}`)
  return response.json()
}

export async function pages(path) {
  const result = []
  for (let page = 1; page <= 30; page++) {
    const batch = await api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`)
    if (!Array.isArray(batch)) throw new Error("Expected GitHub API array")
    result.push(...batch)
    if (batch.length < 100) return result
  }
  throw new Error("GitHub API pagination limit exceeded")
}
