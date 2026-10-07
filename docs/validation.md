# Validation record

Date: **2026-10-07**. Authoring host: macOS / Apple Silicon.
Deployment target: **Ubuntu 24.04 LTS / Linux amd64 / CPU only / 8 GB total RAM**.

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
  port, and only `127.0.0.1:18789` published for the gateway. Both prompt mounts
  are read-only. Both services select `linux/amd64`.
- Official image manifests contain Linux amd64 images. The observed identities
  are recorded in [versions.json](versions.json).
- **6 generator tests passed**. They check multiple-user routing, invalid/wildcard
  IDs, secret references, private file permissions, preservation of the generated
  gateway token on rerun, and leaving state untouched after incomplete input.
  Environment values are parsed as data rather than executed as shell text.
- **8-page PDF** generated with ReportLab 4.4.9, text extracted with pypdf, and
  every page rendered with Poppler and visually reviewed. Code remains selectable;
  14 link annotations are present. Text geometry was also inspected for footer
  clearance; the final layout has no clipped code or overlapping content.

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

The local Docker daemon was unavailable. No container, model runner or Discord
connection was started. The target Linux host and a real bot token were not
provided. Therefore none of these is claimed as passing:

- Container activation, startup migrations, health and readiness.
- CPU text/vision inference or model tool-call reliability.
- Discord delivery, live user/channel restrictions and file actions.
- Filesystem escape refusal or read-only mount behavior at runtime.
- Persistence after a real container restart.
- Peak process/host memory, absence of swapping, or response speed on 8 GB.

Follow guide pages 5 and 6 on the target host. A passing schema and a 1.9 GB model
download do **not** establish whole-agent RAM fit or tool reliability. If the
profile fails, keep that outcome in the deployment record instead of treating
unmeasured hardware compatibility as guaranteed.
