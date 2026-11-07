import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const config: { upstream: string; baseTag: string } = await Bun.file(
  path.join(root, ".github/sidebar/config.json"),
).json()
if (config.upstream !== "anomalyco/opencode" || !/^v\d+\.\d+\.\d+$/.test(config.baseTag))
  throw new Error("Expected an official stable V2 base tag")

const target = process.platform === "win32" ? "windows-x64" : "linux-x64"
if (process.arch !== "x64" || !["win32", "linux"].includes(process.platform))
  throw new Error("This workflow builds native Windows/Linux x64 packages")

const commit = (await run(["git", "rev-parse", "HEAD"], root, true)).trim()
const version = config.baseTag.slice(1)
const buildVersion = `${version}-personal.${process.env.GITHUB_RUN_NUMBER ?? "0"}`
const assetName = `opencode-${target}-baseline.${process.platform === "win32" ? "zip" : "tar.gz"}`
const query = `.assets[] | select(.name == ${JSON.stringify(assetName)}) | [.browser_download_url, .digest] | @tsv`
const [url, digest] = (
  await run(["gh", "api", `repos/${config.upstream}/releases/tags/${config.baseTag}`, "--jq", query], root, true)
)
  .trim()
  .split("\t")
if (
  !url?.startsWith(`https://github.com/${config.upstream}/releases/download/`) ||
  !/^sha256:[a-f0-9]{64}$/.test(digest ?? "")
)
  throw new Error("Expected one upstream CLI archive with a SHA256 digest")

const temp = await mkdtemp(path.join(tmpdir(), "opencode-personal-"))
try {
  const archive = path.join(temp, assetName)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`CLI download failed: ${response.status}`)
  await Bun.write(archive, response)
  const sha256 = new Bun.CryptoHasher("sha256").update(await Bun.file(archive).bytes()).digest("hex")
  if (`sha256:${sha256}` !== digest) throw new Error("Upstream CLI archive SHA256 mismatch")
  await run(["tar", "-xf", archive, "-C", temp])
  const binaryName = process.platform === "win32" ? "opencode.exe" : "opencode"
  const binaries = (await readdir(temp, { recursive: true, withFileTypes: true })).filter(
    (entry) => entry.isFile() && entry.name === binaryName,
  )
  if (binaries.length !== 1) throw new Error("Expected exactly one upstream CLI executable")
  const binary = path.join(binaries[0].parentPath, binaryName)
  if (process.platform !== "win32") await run(["chmod", "+x", binary])
  const reported = (await run([binary, "--version"], root, true)).trim()
  if (reported !== version && !reported.endsWith(` v${version}`)) throw new Error(`Unexpected CLI version: ${reported}`)
  const cli = path.join(root, "packages/cli/dist", `cli-${target}-baseline`)
  await mkdir(path.join(cli, "bin"), { recursive: true })
  await copyFile(binary, path.join(cli, "bin", binaryName))
  await Bun.write(path.join(cli, "package.json"), JSON.stringify({ version }))

  process.env.OPENCODE_CHANNEL = "dev"
  process.env.OPENCODE_VERSION = buildVersion
  process.env.OPENCODE_TARGET = target
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false"
  process.env.XZ_DEFAULTS = "-T0"
  delete process.env.OPENCODE_DESKTOP_APP
  const desktop = path.join(root, "packages/desktop")
  await run(["bun", "run", "build"], desktop)
  // Windows gets a real NSIS installer; Linux uses the existing AppImage/deb/rpm packager.
  if (process.platform === "win32")
    await run(
      ["bunx", "electron-builder", "--win", "--x64", "--publish", "never", "--config", "electron-builder.config.ts"],
      desktop,
    )
  if (process.platform !== "win32") await run(["bun", "run", "pack"], desktop)

  const source = path.join(desktop, "dist")
  const output = path.join(root, "dist/personal-artifact", target)
  await mkdir(output, { recursive: true })
  const files = (await readdir(source)).filter((name) =>
    process.platform === "win32" ? name.endsWith(".exe") : /\.(AppImage|deb|rpm)$/.test(name),
  )
  if (files.length !== (process.platform === "win32" ? 1 : 3))
    throw new Error(`Missing desktop packages: ${files.join(", ")}`)
  const artifacts = await Promise.all(
    files.map(async (file) => {
      const name = file.replace("opencode-desktop-", "opencode-personal-")
      await copyFile(path.join(source, file), path.join(output, name))
      return {
        name,
        sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(output, name)).bytes()).digest("hex"),
      }
    }),
  )
  await Bun.write(path.join(output, "SHA256SUMS"), artifacts.map((file) => `${file.sha256}  ${file.name}\n`).join(""))
  await Bun.write(
    path.join(output, "build-manifest.json"),
    JSON.stringify(
      {
        sourceCommit: commit,
        sourceRef: process.env.GITHUB_REF_NAME,
        baseTag: config.baseTag,
        target,
        buildVersion,
        cli: { version, url, sha256 },
        artifacts,
      },
      null,
      2,
    ),
  )
  console.log(`Built personal ${commit} for ${target}: ${files.join(", ")}`)
} finally {
  await rm(temp, { recursive: true, force: true })
}

async function run(command: string[], cwd = root, capture = false) {
  const child = Bun.spawn(command, { cwd, stdout: capture ? "pipe" : "inherit", stderr: "inherit" })
  const text = capture ? await new Response(child.stdout).text() : ""
  if ((await child.exited) !== 0) throw new Error(`Command failed: ${command.join(" ")}`)
  return text
}
