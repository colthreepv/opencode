import { copyFile, mkdir, readdir } from "node:fs/promises"
import path from "node:path"

type Manifest = {
  sourceCommit: string
  sourceRef: string
  baseTag: string
  target: string
  buildVersion: string
  cli: { version: string; url: string; sha256: string }
  artifacts: { name: string; sha256: string }[]
}

const repository = process.env.GITHUB_REPOSITORY
const runID = process.env.ARTIFACT_RUN
if (repository !== "colthreepv/opencode" || !/^\d+$/.test(runID ?? "")) throw new Error("Expected a personal CI run")
const run: { head_sha: string; head_branch: string; run_number: number; conclusion: string | null; path: string } =
  JSON.parse(await gh(["api", `repos/${repository}/actions/runs/${runID}`]))
// The current workflow is still running its publish job; an older build must already have succeeded.
if (
  run.head_branch !== "personal" ||
  run.path !== ".github/workflows/personal-desktop.yml" ||
  (runID !== process.env.GITHUB_RUN_ID && run.conclusion !== "success")
)
  throw new Error("Artifacts must come from a successful personal desktop build")

const input = "dist/release-input"
const output = "dist/release-assets"
await mkdir(output, { recursive: true })
const builds = await Promise.all(
  (await readdir(input)).map(async (directory) => {
    const manifest: Manifest = await Bun.file(path.join(input, directory, "build-manifest.json")).json()
    if (manifest.sourceCommit !== run.head_sha || manifest.sourceRef !== "personal")
      throw new Error("Package source differs from the selected personal build")
    for (const artifact of manifest.artifacts) {
      if (!/^opencode-personal-[a-z0-9_-]+\.(exe|AppImage|deb|rpm)$/.test(artifact.name))
        throw new Error("Unexpected package filename")
      const file = path.join(input, directory, artifact.name)
      if (new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex") !== artifact.sha256)
        throw new Error(`Checksum mismatch: ${artifact.name}`)
      await copyFile(file, path.join(output, artifact.name))
    }
    return manifest
  }),
)
if (
  builds.length !== 2 ||
  !["windows-x64", "linux-x64"].every((target) => builds.some((build) => build.target === target))
)
  throw new Error("Expected both Windows and Linux packages")
const base = builds[0].baseTag
const tag = `${base}-personal.${run.run_number}`
if (
  !/^v\d+\.\d+\.\d+$/.test(base) ||
  builds.some((build) => build.baseTag !== base || `v${build.buildVersion}` !== tag)
)
  throw new Error("Package versions differ")
const artifacts = builds.flatMap((build) => build.artifacts)
if (artifacts.length !== 4) throw new Error("Expected four installable packages")
await Bun.write(
  path.join(output, "build-manifest.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      releaseTag: tag,
      sourceCommit: run.head_sha,
      workflowRun: `https://github.com/${repository}/actions/runs/${runID}`,
      builds,
    },
    null,
    2,
  ),
)
const manifestHash = new Bun.CryptoHasher("sha256")
  .update(await Bun.file(path.join(output, "build-manifest.json")).bytes())
  .digest("hex")
await Bun.write(
  path.join(output, "SHA256SUMS"),
  [...artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`), `${manifestHash}  build-manifest.json`].join(
    "\n",
  ) + "\n",
)
await Bun.write(
  "dist/personal-release-notes.md",
  `OpenCode Personal based on official **${base}**.

Includes Sidebar Pro, stable conversation ordering, read/unread reminders, independent editor launches, file-link line centering and word wrap.

### Install
- **Windows x64:** run \`opencode-personal-win-x64.exe\` (unsigned NSIS installer).
- **Debian/Ubuntu x64:** \`sudo apt install ./opencode-personal-linux-amd64.deb\`
- **RPM Linux x64:** install \`opencode-personal-linux-x86_64.rpm\` with your package manager.
- **Portable Linux x64:** \`chmod +x opencode-personal-linux-x86_64.AppImage\`, then run it.

The app is named **OpenCode Dev**, with a separate identity and automatic updater disabled. Packages update an existing installation with that identity.

Source: [\`${run.head_sha.slice(0, 10)}\`](https://github.com/${repository}/commit/${run.head_sha}) · [Windows/Linux build](https://github.com/${repository}/actions/runs/${runID})

\`SHA256SUMS\` and \`build-manifest.json\` include package hashes and build provenance. Community fork, not an official OpenCode release.
`,
)
const assets = (await readdir(output)).map((name) => path.join(output, name))
const existing = Bun.spawn(["gh", "release", "view", tag, "--repo", repository], { stdout: "ignore", stderr: "ignore" })
if ((await existing.exited) === 0) {
  await gh(["release", "upload", tag, "--repo", repository, "--clobber", ...assets])
  await gh([
    "release",
    "edit",
    tag,
    "--repo",
    repository,
    "--draft=false",
    "--latest",
    "--notes-file",
    "dist/personal-release-notes.md",
  ])
} else {
  await gh([
    "release",
    "create",
    tag,
    "--repo",
    repository,
    "--target",
    run.head_sha,
    "--title",
    `OpenCode Personal ${tag}`,
    "--latest",
    "--notes-file",
    "dist/personal-release-notes.md",
    ...assets,
  ])
}
console.log(`Published https://github.com/${repository}/releases/tag/${tag}`)

async function gh(args: string[]) {
  const child = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "inherit" })
  const text = await new Response(child.stdout).text()
  if ((await child.exited) !== 0) throw new Error(`gh ${args[0]} failed`)
  return text
}
