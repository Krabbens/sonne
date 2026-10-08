#!/usr/bin/env bash
# Fresh installation or resume of an installation created by this script.
set +x
set -Eeuo pipefail
umask 077

REF=8ffc0b70919edde56538391a94a18214a9aeb868
INSTALL_DIR="$HOME/agents/sonne"
ENV_FILE=
PREPARE_ONLY=0
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
while (($#)); do
  case "$1" in
    --dir) (($# >= 2)) || die 'Missing --dir value'; INSTALL_DIR=$2; shift 2 ;;
    --env-file) (($# >= 2)) || die 'Missing --env-file value'; ENV_FILE=$2; shift 2 ;;
    --prepare-only) PREPARE_ONLY=1; shift ;;
    --help|-h)
      printf '%s\n' 'Usage: bash install-sonne.sh [--dir PATH] [--env-file FILE] [--prepare-only]' \
        'Ubuntu 24.04 or Debian 13; amd64 or arm64; run as a normal user.' \
        'Default destination: ~/agents/sonne. Existing unrelated folders are refused.' \
        '--prepare-only requires git/python3; creates local config without sudo or Docker.'
      exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done
trap 'printf "Setup stopped. Review the error above, fix it, then re-run this script.\n" >&2' ERR
[[ $(uname -s) == Linux ]] || die 'Run this script on the target Linux host.'
[[ $(id -u) != 0 ]] || die 'Run without sudo; the script requests sudo when needed.'
[[ -r /etc/os-release ]] || die 'Cannot identify the operating system.'
. /etc/os-release
case "$ID:${VERSION_ID:-}" in
  ubuntu:24.04) SUITE=noble ;;
  debian:13|debian:13.*) SUITE=trixie ;;
  *) die 'Supported targets: Ubuntu 24.04 LTS and Debian 13.' ;;
esac
ARCH=$(dpkg --print-architecture)
[[ $ARCH == amd64 || $ARCH == arm64 ]] || die 'Only amd64 and arm64 are supported.'
INSTALL_DIR=$(realpath -m -- "$INSTALL_DIR")
[[ -z $ENV_FILE || -r $ENV_FILE ]] || die 'The supplied environment file is not readable.'
[[ -z $ENV_FILE ]] || ENV_FILE=$(realpath -- "$ENV_FILE")
if [[ -e $INSTALL_DIR ]]; then
  [[ -f $INSTALL_DIR/.sonne-auto-installer && -d $INSTALL_DIR/.git ]] || \
    die 'Destination already exists. Choose a new --dir; existing installations are not overwritten.'
  [[ $(cat "$INSTALL_DIR/.sonne-auto-installer") == "$REF" ]] || die 'Installer marker mismatch.'
fi

if ((PREPARE_ONLY)); then
  command -v git >/dev/null && command -v python3 >/dev/null || die 'Install git and python3 first.'
else
  ram_kib=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
  ((ram_kib >= 7 * 1024 * 1024)) || die 'This profile requires an approximately 8 GiB host.'
  if [[ ! -f $INSTALL_DIR/.sonne-auto-installer ]]; then
    ancestor=$INSTALL_DIR
    while [[ ! -d $ancestor ]]; do ancestor=$(dirname -- "$ancestor"); done
    free_kib=$(df -Pk "$ancestor" | awk 'NR==2 {print $4}')
    ((free_kib >= 15 * 1024 * 1024)) || die 'At least 15 GiB free disk is required for initial setup.'
  fi
  sudo -v
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl git nano python3 procps ripgrep openssh-client
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    for package in docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc; do
      [[ $(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true) != 'install ok installed' ]] || \
        die "Conflicting package: $package. Review Docker's official instructions before proceeding."
    done
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF_DOCKER
Types: deb
URIs: https://download.docker.com/linux/$ID
Suites: $SUITE
Components: stable
Architectures: $ARCH
Signed-By: /etc/apt/keyrings/docker.asc
EOF_DOCKER
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker
  fi
  DOCKER=(docker)
  if ! docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
    if ! "${DOCKER[@]}" info >/dev/null 2>&1; then sudo systemctl start docker; fi
    "${DOCKER[@]}" info >/dev/null
    sudo groupadd -f docker
    sudo usermod -aG docker "$(id -un)"
    printf 'Using sudo for Docker now. Log out/in before future Docker commands without sudo.\n'
  fi
  # Compose's project name is fixed in the pinned source. Never replace another stack.
  for container in $("${DOCKER[@]}" ps -aq --filter label=com.docker.compose.project=sonne); do
    owner=$("${DOCKER[@]}" inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$container")
    [[ $owner == "$INSTALL_DIR" ]] || die 'Another sonne Compose project exists; preserve it and use the manual guide.'
  done
fi

if [[ ! -d $INSTALL_DIR/.git ]]; then
  mkdir -p -- "$(dirname -- "$INSTALL_DIR")"
  git clone --no-checkout https://github.com/Krabbens/sonne.git "$INSTALL_DIR"
  git -C "$INSTALL_DIR" checkout --detach "$REF"
  printf '%s\n' "$REF" > "$INSTALL_DIR/.sonne-auto-installer"
fi
cd "$INSTALL_DIR"
[[ $(git rev-parse HEAD) == "$REF" ]] || die 'Source revision changed; use the manual upgrade procedure.'
git diff --quiet HEAD -- compose.yaml scripts/configure.py templates/openclaw.json || \
  die 'Core files have local changes; preserve them and use the manual procedure.'

python3 - "$ARCH" "$ENV_FILE" <<'PY_CONFIG'
import getpass, importlib.util, os, re, tempfile
from pathlib import Path
import sys

def stop(message):
    raise SystemExit('Configuration: ' + message)

arch, supplied = sys.argv[1:]
spec = importlib.util.spec_from_file_location('sonne_config', 'scripts/configure.py')
cfg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfg)
override = 'services:\n  ollama:\n    platform: linux/' + arch + '\n  openclaw:\n    platform: linux/' + arch + '\n    environment:\n      OLLAMA_API_KEY: ollama-local\n'
override_path = Path('compose.override.yaml')
if override_path.exists() and override_path.read_text() != override:
    stop('Existing Compose override differs. Preserve it and use the manual guide.')
rules = Path('templates/workspace/AGENTS.md')
original = 'Work only inside /workspace. Put user-created files in files/.\n'
clarified = (
    'Work only inside /workspace. All writable user files live in /workspace/files.\n'
    'For write and edit tools, use absolute paths under /workspace/files/.\n'
    'A user path such as files/note.txt means /workspace/files/note.txt.\n'
    'Keep the files/ directory in the path. For a new filename with no directory,\n'
    'use /workspace/files/<filename>. The /workspace directory itself is read-only.\n'
    'If a write reports EROFS, check that the path includes /workspace/files/.\n'
)
rules_text = rules.read_text()
if original not in rules_text and clarified not in rules_text:
    stop('Working rules differ. Merge the path correction using the manual guide.')
env = Path('.env')
if env.is_symlink():
    stop('Refusing a symlinked .env.')
source = env if env.exists() else Path(supplied) if supplied else Path('.env.example')
values = cfg.read_env(source)
fields = [
    ('DISCORD_BOT_TOKEN', 'Discord bot token'),
    ('DISCORD_APPLICATION_ID', 'Application ID'),
    ('DISCORD_GUILD_ID', 'Server ID'),
    ('DISCORD_CHANNEL_ID', 'Channel ID'),
    ('DISCORD_USER_IDS', 'Permitted User IDs (comma-separated)'),
]
if env.exists() and supplied:
    incoming = cfg.read_env(Path(supplied))
    if any(values.get(k) != incoming.get(k) for k, _ in fields):
        stop('Existing .env differs; edit it locally instead of replacing its credentials.')
tty = None
try:
    for key, label in fields:
        def valid(value):
            if key == 'DISCORD_BOT_TOKEN':
                return bool(value) and not value.startswith(('replace-', 'your-')) and not re.search(r'''[\s'"\x00]''', value)
            return all(cfg.ID.fullmatch(x) for x in value.split(','))
        while not valid(values.get(key, '')):
            if supplied:
                stop('The supplied environment file has missing or invalid Discord values.')
            if tty is None:
                try:
                    tty = open('/dev/tty', 'r')
                except OSError:
                    stop('No terminal available. Supply a completed file with --env-file.')
            if key == 'DISCORD_BOT_TOKEN':
                values[key] = getpass.getpass(label + ': ', stream=sys.stderr).strip()
            else:
                print(label + ': ', end='', file=sys.stderr, flush=True)
                answer = tty.readline()
                if not answer:
                    stop('Input cancelled.')
                values[key] = answer.strip()
    for key, expected in [('OPENCLAW_IMAGE', 'ghcr.io/openclaw/openclaw:2026.9.8'), ('OLLAMA_IMAGE', 'ollama/ollama:0.40.0')]:
        if values.get(key) not in (None, '', expected):
            stop('Image settings differ from the pinned stack; use the manual upgrade procedure.')
        values[key] = expected
    lines = source.read_text().splitlines()
    for key in [k for k, _ in fields] + ['OPENCLAW_IMAGE', 'OLLAMA_IMAGE']:
        lines = [line for line in lines if not line.startswith(key + '=')]
        lines.append(key + '=' + values[key])
    state = Path('.state'); state.mkdir(mode=0o700, exist_ok=True); state.chmod(0o700)
    with tempfile.NamedTemporaryFile(mode='w', dir=state, delete=False) as stream:
        stream.write('\n'.join(lines) + '\n')
        temporary = Path(stream.name)
    temporary.replace(env); env.chmod(0o600)
    if not override_path.exists():
        override_path.write_text(override)
    if original in rules_text:
        rules.write_text(rules_text.replace(original, clarified, 1))
finally:
    if tty is not None:
        tty.close()
cfg.main()
PY_CONFIG

if ((PREPARE_ONLY)); then
  printf 'Prepared local configuration in %s. No sudo, Docker or inference was used.\n' "$INSTALL_DIR"
  exit 0
fi
compose() (
  unset DISCORD_BOT_TOKEN OPENCLAW_GATEWAY_TOKEN LOCAL_UID LOCAL_GID OPENCLAW_IMAGE OLLAMA_IMAGE
  "${DOCKER[@]}" compose -p sonne --env-file .env -f compose.yaml -f compose.override.yaml "$@"
)
compose config --quiet
compose pull
plugin_marker=.state/openclaw/.sonne-discord-2026.9.8-installed
if [[ ! -f $plugin_marker ]]; then
  compose run --rm --no-deps -T openclaw node dist/index.js plugins install \
    @openclaw/discord@2026.9.8 --pin --accept-capabilities --force
  touch "$plugin_marker"
fi
compose run --rm --no-deps -T openclaw node dist/index.js config validate --json
compose run --rm --no-deps -T openclaw node - < tests/check_mounts.cjs
compose up -d --wait --wait-timeout 180 ollama
compose exec -T ollama ollama pull qwen3.5:2b-q4_K_M
compose up -d --wait --wait-timeout 180 openclaw
compose exec -T openclaw node dist/index.js infer model run --local --agent sonne \
  --model ollama/qwen3.5:2b-q4_K_M --prompt 'Reply with exactly: sonne-ok' --json \
  > .state/openclaw/installer-model-probe.json
compose exec -T openclaw node dist/index.js channels status \
  --channel discord --probe --json --timeout 15000 > .state/openclaw/installer-discord-probe.json
python3 - <<'PY_VERIFY'
import json
from pathlib import Path
state = Path('.state/openclaw')
model = json.loads((state/'installer-model-probe.json').read_text())
if model.get('ok') is not True or not any(x.get('text', '').strip() == 'sonne-ok' for x in model.get('outputs', [])):
    raise SystemExit('Model probe failed; inspect the private probe file and local service logs.')
status = json.loads((state/'installer-discord-probe.json').read_text())
discord = status.get('channels', {}).get('discord', {})
if not discord.get('running') or discord.get('probe', {}).get('ok') is not True or status.get('statusIssues'):
    raise SystemExit('Discord probe failed; check the token, intents, allowlist and channel permissions.')
print('Local model routing and Discord probe passed. Verify a real mention and file/image tasks next.')
PY_VERIFY
compose ps
printf '\nInstalled in %s\nNext: mention the bot in the permitted Discord channel.\n' "$INSTALL_DIR"
