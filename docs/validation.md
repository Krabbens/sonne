# Validation record

Date: **2026-10-07**. Authoring host: macOS / Apple Silicon.
Deployment target: **Ubuntu 24.04 LTS / Linux amd64 / CPU only / 8 GB total RAM**.
Revision 3 runtime checks: **Docker Desktop 4.72.0 / Engine 29.4.2 / VirtioFS**,
using the pinned Linux amd64 image on an Apple Silicon host (emulation).

## Verified locally

- **OpenClaw 2026.9.8 CLI** reports commit `fc23bc8`.
- Generated JSON validated with the actual pinned CLI using synthetic tokens and IDs.
- Installed official **`@openclaw/discord@2026.9.8`** into isolated temporary state,
  then regenerated the template config and validated it again: **`valid: true`,
  `warnings: []`**. Regeneration retained plugin discovery because installation
  records and files live in persistent state, separately from the template JSON.
- The JSON declares image input and native Ollama API, explicitly bounds runtime
  context and output, disables GPU use and has no cloud fallback.
- **Docker Compose 5.1.3** normalized the file successfully. Configuration uses
  Compose v2-compatible features; execution with Compose v2 was not tested here.
- Normalized Compose has 4 GiB and 2 GiB memory/swap limits, no Ollama published
  port, and only `127.0.0.1:18789` published for the gateway. The prompt directory
  is mounted read-only at `/workspace`, with a separate writable directory mount
  at `/workspace/files`. State is mounted separately. Both services select `linux/amd64`.
- Official image manifests contain Linux amd64 images. The observed identities
  are recorded in [versions.json](versions.json).
- **6 generator tests passed**. They check multiple-user routing, invalid/wildcard
  IDs, secret references, private file permissions, preservation of the generated
  gateway token on rerun, and leaving state untouched after incomplete input.
  Environment values are parsed as data rather than executed as shell text.
- **10-page PDF, revision 4** generated with ReportLab 4.4.9, text extracted with pypdf, and
  every page rendered with Poppler and visually reviewed. Code remains selectable;
  clickable source links are present. Text geometry was also inspected for footer
  clearance; the final layout has no clipped code or overlapping content.
- Revision 2 adds complete host-tool installation for fresh Ubuntu 24.04 amd64:
  Git, Python, editor, download/certificate support, monitoring tools, SSH client,
  Docker Engine and Compose. Docker repository and post-installation steps were
  checked against official Docker documentation. Bash code blocks passed
  syntax checks. Host apt installation and `hello-world` were not executed here.
- Revision 4 targets any user of the public project: ordinary HTTPS cloning,
  no GitHub login or token, user-relative paths and a user's own Discord setup.
  The public repository visibility and anonymous download were checked.
- Reproduced the original nested file-bind `mountpoint ... is outside of rootfs`
  failure in a disposable Compose project using the real pinned OpenClaw image.
  The revision 3 directory-mount layout starts successfully on the same Docker
  daemon. `tests/check_mounts.cjs` passes inside that container: both prompts are
  readable, writing or renaming either fails with `EROFS`, and temporary files
  can be created, read and deleted under `/workspace/files`. Config and runtime
  workspace paths match. This starts Node only, not a Discord gateway or model.
- Fixed npm cache permissions for host UIDs that differ from the image's node
  user (tested UID 501). `NPM_CONFIG_CACHE` now points inside writable persistent
  state, instead of the image-owned `/home/node/.npm`. The generator also creates
  a private runtime cache, mounted at `/home/node/.cache`, for OpenClaw's secure
  temporary-directory fallback. Both caches pass the container write check.
  See the official
  [npm configuration reference](https://docs.npmjs.com/cli/v11/using-npm/config/).
- Installed the official pinned Discord plugin in the real Docker image with
  synthetic tokens and regenerated config from the final template. A separate
  one-off container validated that config: **`valid: true`, `warnings: []`**.
  Plugin discovery survives between one-off containers through persistent state.

## Commands used

```bash
python3 -m unittest discover -s tests -v
docker compose --env-file tmp/qa/validation.env config --quiet
docker compose --env-file tmp/qa/validation.env config --format json
docker manifest inspect ghcr.io/openclaw/openclaw:2026.9.8
docker manifest inspect ollama/ollama:0.40.0
npm exec --yes --package=openclaw@2026.9.8 -- openclaw --version
```

For the CLI checks, `OPENCLAW_CONFIG_PATH` and `OPENCLAW_STATE_DIR` were directed
to ignored temporary paths. Synthetic `DISCORD_BOT_TOKEN` and
`OPENCLAW_GATEWAY_TOKEN` values were supplied. In that isolated environment:

```bash
npm exec --yes --package=openclaw@2026.9.8 -- openclaw plugins install \
  @openclaw/discord@2026.9.8 --pin --accept-capabilities --force
npm exec --yes --package=openclaw@2026.9.8 -- openclaw config validate --json
```

No real bot was created, contacted, or logged in during these checks.
The npm cache and temporary plugin installation are not repository contents.

## Not executed

Docker was unavailable for revisions 1 and 2; revision 3 adds real one-off
container checks on Docker Desktop. No real Discord connection or model inference
was used in validation. The 8 GB Linux target was not provided. None of the
following is claimed as passing:

- Full gateway startup, migrations, health and readiness.
- Recovery of every pre-existing failed plugin migration; fresh-state plugin
  installation and schema checks do not establish that recovery path.
- Ubuntu package installation, Docker service setup, group membership and
  `hello-world` on a fresh Linux host.
- CPU text/vision inference or model tool-call reliability.
- Discord delivery, live user/channel restrictions and file actions.
- OpenClaw tool-level filesystem escape refusal (OS mount protection is checked).
- Persistence after a real container restart.
- Peak process/host memory, absence of swapping, or response speed on 8 GB.

Follow guide pages 7 and 8 on the target host. A passing schema and a 1.9 GB model
download do **not** establish whole-agent RAM fit or tool reliability. If the
profile fails, keep that outcome in the deployment record instead of treating
unmeasured hardware compatibility as guaranteed.
