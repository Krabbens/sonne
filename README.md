# Sonne

OpenClaw + Ollama + Qwen3.5 2B Q4_K_M, served through a restricted Discord channel.
CPU only, targeting a **Linux amd64 host with 8 GB total RAM**.

**Read the [10-page English deployment guide](output/pdf/sonne-openclaw-cpu-8gb.pdf)**
or its [Markdown source](docs/guide.md). It starts with host-tool installation on
a fresh Ubuntu system, then covers Docker, repository access, bot setup, the
system prompt, acceptance checks, memory measurement and maintenance.

This is a documented deployment profile, **not a measured 8 GB benchmark**.
OpenClaw 2026.9.8 configuration validation and static checks are verified locally.
Container startup, model inference, Discord delivery and RAM fit require the
target Linux host and your own bot token. See [validation status](docs/validation.md).

## Prerequisites

- An installed Ubuntu 24.04 LTS system, Intel/AMD x86-64, and a normal non-root
  Linux user with sudo access. Docker, Git and Python installation is included.
- An otherwise lightly loaded 8 GB machine; approximately 15 GB free disk as an
  initial allowance for images, the model, state and updates. Check actual disk use.
- A Discord application, one server/channel, and numeric IDs for allowed users.
- Internet for initial downloads and Discord. Model inference is local; messages
  and attachments are transported by Discord.

## Install the host tools first

Follow guide [section 2](docs/guide.md#2-install-the-host-tools-and-docker) on the
Ubuntu host. It installs Git, Python 3, nano, curl, certificate support, the
memory-monitoring utilities, ripgrep and the SSH client, then configures Docker's
official apt repository and installs Docker Engine with the Compose plugin.

Then follow [section 3](docs/guide.md#3-verify-docker-and-download-sonne) to grant
the trusted operator Docker access, log out and back in, run `hello-world`, and
download this private repository using a read-only GitHub token. No separate
host installation of Node.js, npm, OpenClaw or Ollama is needed.

## Quick start after host installation

Start in the checkout created by guide section 3. The guide also explains how to
create the Discord bot and obtain its IDs and token before filling `.env`.

```bash
cd ~/agents/sonne
cp .env.example .env
nano .env
python3 scripts/configure.py
docker compose config --quiet
docker compose pull
docker compose run --rm --no-deps openclaw \
  node dist/index.js plugins install @openclaw/discord@2026.9.8 \
  --pin --accept-capabilities --force
docker compose run --rm --no-deps openclaw \
  node dist/index.js config validate --json
docker compose up -d ollama
docker compose exec -T ollama ollama pull qwen3.5:2b-q4_K_M
docker compose up -d openclaw
docker compose ps
```

Now mention the bot in the configured channel. Everyone on `DISCORD_USER_IDS`
shares the channel conversation and `workspace/files/`. DMs are disabled.
No public inbound port is required for Discord. The optional admin UI is bound
to `127.0.0.1:18789` and requires the gateway token stored in your local `.env`.

## What is configured

- OpenClaw `2026.9.8`, Ollama `0.40.0`, Qwen `qwen3.5:2b-q4_K_M`.
- Official external Discord plugin `@openclaw/discord@2026.9.8`, installed into
  persistent state before startup. `--force` confirms the npm source during this
  first installation; do not use it casually to overwrite a working plugin.
- Native Ollama endpoint `http://ollama:11434`, 16,384-token context, 1,024-token
  output cap, `num_gpu: 0`, thinking off, one model and one turn at a time.
- Hard memory caps of 4 GiB for Ollama and 2 GiB for OpenClaw. Equal memory/swap
  limits prevent these containers from using swap when the host supports the limits.
- Only `read`, `write`, `edit`, `view_image`; filesystem scope is the workspace.
- Operator-managed prompts are mounted read-only. No shell tool, browser,
  embedding model, scheduled heartbeat, Docker socket or cloud fallback.
- A single Discord guild/channel allowlist plus numeric user allowlist.

The 1.9 GB download is not the RAM requirement. Context, vision processing,
runtime allocations, Docker and the host also consume memory. The guide explains
how to accept or reject the profile on your machine.

## Change the prompt or access list

Edit `templates/workspace/SOUL.md` (persona) or `AGENTS.md` (working rules), then
run `docker compose up -d --force-recreate openclaw`. Host files can be edited by the operator;
their copies inside the container are read-only. Existing conversation context
may still contain old instructions; verify a fresh session from the admin UI.

After changing Discord IDs in `.env` or `templates/openclaw.json`, run
`python3 scripts/configure.py` and `docker compose up -d --force-recreate openclaw`.
The generator replaces the generated config, so make lasting edits in the template.

## Repository contents

- `compose.yaml`: the two services, network, mounts and resource limits.
- `.env.example`: local secrets and IDs; `templates/`: config and editable prompts.
- `scripts/configure.py`: dependency-free config generation with numeric ID checks.
- `docs/`: guide source, validation status, source links and version notes.
- `examples/vision-check.png`: synthetic image for the acceptance test.
- `scripts/build_pdf.py`: rebuild the PDF with ReportLab.

Real `.env`, `.state/`, `workspace/`, model weights and conversation history are
excluded from Git. Model weights are downloaded from Ollama, not redistributed here.

## Validate or rebuild

```bash
python3 -m unittest discover -s tests -v
docker compose config --quiet
docker compose run --rm --no-deps openclaw \
  node dist/index.js config validate --json

python3 -m venv .venv
.venv/bin/pip install -r requirements-pdf.txt
.venv/bin/python scripts/build_pdf.py
```

Upstream OpenClaw: <https://github.com/openclaw/openclaw>.
Ollama: <https://github.com/ollama/ollama>.
Model: <https://ollama.com/library/qwen3.5:2b-q4_K_M>.
