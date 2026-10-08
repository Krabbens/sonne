#!/usr/bin/env bash
# Fresh installation or resume of an installation created by this script.
set +x
set -Eeuo pipefail
umask 077

REF=8ffc0b70919edde56538391a94a18214a9aeb868
INSTALL_DIR="$HOME/agents/sonne"
ENV_FILE=
PREPARE_ONLY=0
MODEL_CHOICE=
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
while (($#)); do
  case "$1" in
    --dir) (($# >= 2)) || die 'Missing --dir value'; INSTALL_DIR=$2; shift 2 ;;
    --env-file) (($# >= 2)) || die 'Missing --env-file value'; ENV_FILE=$2; shift 2 ;;
    --model) (($# >= 2)) || die 'Missing --model value'; MODEL_CHOICE=$2; shift 2 ;;
    --prepare-only) PREPARE_ONLY=1; shift ;;
    --help|-h)
      printf '%s\n' 'Usage: bash install-sonne.sh [--model qwen|gemma] [--dir PATH] [--env-file FILE] [--prepare-only]' \
        'Ubuntu 24.04 or Debian 13; amd64 or arm64; run as a normal user.' \
        'qwen: Qwen3.5 2B Q4_K_M, approximately 8 GiB host RAM (default).' \
        'gemma: Gemma 4 E2B IT QAT, approximately 16 GiB host RAM.' \
        'First interactive run offers a model menu; later runs keep the saved choice.' \
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

if [[ -z $MODEL_CHOICE && -f $INSTALL_DIR/.state/sonne-model ]]; then
  MODEL_CHOICE=$(cat "$INSTALL_DIR/.state/sonne-model")
fi
if [[ -z $MODEL_CHOICE ]]; then
  if [[ -t 0 ]]; then
    printf '%s\n' 'Choose the local CPU model:' \
      '  1) Qwen3.5 2B Q4_K_M - 8 GiB RAM, about 1.9 GB download (default)' \
      '  2) Gemma 4 E2B IT QAT - 16 GiB RAM, about 4.3 GB download'
    while :; do
      read -r -p 'Model [1]: ' model_answer || die 'Model selection cancelled.'
      case "$model_answer" in
        ''|1|qwen) MODEL_CHOICE=qwen; break ;;
        2|gemma) MODEL_CHOICE=gemma; break ;;
        *) printf 'Enter 1 or 2.\n' ;;
      esac
    done
  else
    MODEL_CHOICE=qwen
  fi
fi
case "$MODEL_CHOICE" in
  qwen) required_ram_gib=8; required_disk_gib=15 ;;
  gemma) required_ram_gib=16; required_disk_gib=20 ;;
  *) die 'Unknown model. Use --model qwen or --model gemma.' ;;
esac
printf 'Selected model profile: %s\n' "$MODEL_CHOICE"

if ((PREPARE_ONLY)); then
  command -v git >/dev/null && command -v python3 >/dev/null || die 'Install git and python3 first.'
else
  ram_kib=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
  ((ram_kib >= (required_ram_gib - 1) * 1024 * 1024)) || \
    die "The $MODEL_CHOICE profile requires approximately $required_ram_gib GiB host RAM."
  if [[ ! -f $INSTALL_DIR/.sonne-auto-installer ]]; then
    ancestor=$INSTALL_DIR
    while [[ ! -d $ancestor ]]; do ancestor=$(dirname -- "$ancestor"); done
    free_kib=$(df -Pk "$ancestor" | awk 'NR==2 {print $4}')
    ((free_kib >= required_disk_gib * 1024 * 1024)) || \
      die "At least $required_disk_gib GiB free disk is required for initial setup."
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

compose() (
  unset DISCORD_BOT_TOKEN OPENCLAW_GATEWAY_TOKEN LOCAL_UID LOCAL_GID OPENCLAW_IMAGE OLLAMA_IMAGE
  "${DOCKER[@]}" compose -p sonne --env-file .env -f compose.yaml -f compose.override.yaml "$@"
)
if ((!PREPARE_ONLY)) && [[ -f .state/openclaw/openclaw.json ]]; then
  # Pause the gateway before regenerating a running installation's configuration.
  # A newly selected model may still need several minutes to download.
  compose stop openclaw
fi

python3 - "$ARCH" "$ENV_FILE" "$MODEL_CHOICE" <<'PY_CONFIG'
import getpass, importlib.util, json, os, re, tempfile
from pathlib import Path
import sys

def stop(message):
    raise SystemExit('Configuration: ' + message)

arch, supplied, selected_model = sys.argv[1:]
profiles = {
    'qwen': {'id': 'qwen3.5:2b-q4_K_M', 'name': 'Qwen3.5 2B Q4_K_M (local CPU)',
             'contextWindow': 262144, 'contextTokens': 65536, 'memory': '4g'},
    'gemma': {'id': 'gemma4:e2b-it-qat', 'name': 'Gemma 4 E2B IT QAT (local CPU)',
              'contextWindow': 131072, 'contextTokens': 32768, 'memory': '8g'},
}
profile = profiles[selected_model]
spec = importlib.util.spec_from_file_location('sonne_config', 'scripts/configure.py')
cfg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfg)
legacy_override = 'services:\n  ollama:\n    platform: linux/' + arch + '\n  openclaw:\n    platform: linux/' + arch + '\n    environment:\n      OLLAMA_API_KEY: ollama-local\n'
def model_override(settings):
    return ('services:\n  ollama:\n    platform: linux/' + arch + '\n'
            '    mem_limit: ' + settings['memory'] + '\n'
            '    memswap_limit: ' + settings['memory'] + '\n'
            '    environment:\n      OLLAMA_CONTEXT_LENGTH: "' + str(settings['contextTokens']) + '"\n'
            '  openclaw:\n    platform: linux/' + arch + '\n'
            '    environment:\n      OLLAMA_API_KEY: ollama-local\n')
override = model_override(profile)
override_path = Path('compose.override.yaml')
known_overrides = {legacy_override, *(model_override(settings) for settings in profiles.values())}
if override_path.exists() and override_path.read_text() not in known_overrides:
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
    override_path.write_text(override)
    if original in rules_text:
        rules.write_text(rules_text.replace(original, clarified, 1))
finally:
    if tty is not None:
        tty.close()
cfg.main()
# Bound vision encoder work on the CPU-only stack, including image summaries.
# imageMaxDimensionPx alone does not constrain media-understanding requests.
config_path = Path('.state/openclaw/openclaw.json')
config = json.loads(config_path.read_text())
vision_model = config['models']['providers']['ollama']['models'][0]
vision_model.update({key: profile[key] for key in ('id', 'name', 'contextWindow', 'contextTokens')})
vision_model['params']['num_ctx'] = profile['contextTokens']
vision_model['mediaInput'] = {'image': {'maxSidePx': 768, 'maxPixels': 262144}}
model_ref = 'ollama/' + profile['id']
for route in ('model', 'imageModel'):
    config['agents']['defaults'][route] = {'primary': model_ref, 'fallbacks': []}
config['agents']['defaults']['utilityModel'] = model_ref
for media_model in config['tools']['media']['models']:
    if media_model['provider'] == 'ollama':
        media_model['model'] = profile['id']
config['agents']['defaults']['imageMaxDimensionPx'] = 768
config['tools']['media']['image']['timeoutSeconds'] = 600
config_path.write_text(json.dumps(config, indent=2) + '\n')
config_path.chmod(0o600)
selection_path = Path('.state/sonne-model')
selection_path.write_text(selected_model + '\n')
selection_path.chmod(0o600)
print('Configured model: ' + profile['id'])
PY_CONFIG

MODEL_TAG=$(python3 -c 'import json; print(json.load(open(".state/openclaw/openclaw.json"))["models"]["providers"]["ollama"]["models"][0]["id"])')

if ((PREPARE_ONLY)); then
  printf 'Prepared local configuration in %s. No sudo, Docker or inference was used.\n' "$INSTALL_DIR"
  exit 0
fi
compose config --quiet
compose pull
plugin_marker=.state/openclaw/.sonne-discord-2026.9.8-installed
if [[ ! -f $plugin_marker ]]; then
  compose run --rm --no-deps -T openclaw node dist/index.js plugins install \
    @openclaw/discord@2026.9.8 --pin --accept-capabilities --force
  touch "$plugin_marker"
fi
# Pinned Discord plugin: normalize model-generated reply IDs before delivery.
compose run --rm --no-deps -T openclaw node - <<'JS_DISCORD_REPLY_FIX'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.env.OPENCLAW_STATE_DIR || '/home/node/.openclaw';
const projects = path.join(root, 'npm/projects');
const candidates = [];
for (const project of fs.readdirSync(projects)) {
  const pkg = path.join(projects, project, 'node_modules/@openclaw/discord');
  const metadata = path.join(pkg, 'package.json');
  if (!fs.existsSync(metadata) || JSON.parse(fs.readFileSync(metadata, 'utf8')).version !== '2026.9.8') continue;
  const setup = path.join(pkg, 'dist/.setup');
  for (const file of fs.readdirSync(setup)) {
    if (!file.endsWith('.mjs')) continue;
    const target = path.join(setup, file);
    const source = fs.readFileSync(target, 'utf8');
    if (source.includes('function resolveDiscordReplyMessageId(reply, isFirst)')) candidates.push({target, source});
  }
}
assert.equal(candidates.length, 1, 'Expected one pinned Discord reply-reference module');
const {target, source} = candidates[0];
const start = source.indexOf('function resolveDiscordReplyReference(params)');
const end = source.indexOf('//#endregion', start);
assert.ok(start >= 0 && end > start, 'Unsupported Discord reply-reference module');
const replacement = String.raw`// Sonne: normalize Discord reply IDs before constructing API payloads.
function normalizeSonneDiscordReplyId(messageId) {
  if (typeof messageId !== "string") return;
  const normalized = messageId.trim().replace(/^<(\d{1,20})>$/, "$1");
  return /^\d{1,20}$/.test(normalized) ? normalized : void 0;
}
function resolveDiscordReplyReference(params) {
  const messageId = normalizeSonneDiscordReplyId(params.replyToId);
  if (!messageId) return;
  const singleUse = params.replyToIdSource !== "explicit" && params.replyToMode !== void 0 && isSingleUseReplyToMode(params.replyToMode);
  return { messageId, scope: singleUse ? "first" : "all" };
}
function createReusableDiscordReplyReference(messageId) {
  const normalized = normalizeSonneDiscordReplyId(messageId);
  return normalized ? { messageId: normalized, scope: "all" } : void 0;
}
function resolveDiscordReplyMessageId(reply, isFirst) {
  return reply && (isFirst || reply.scope === "all") ? normalizeSonneDiscordReplyId(reply.messageId) : void 0;
}
`;
const patched = source.slice(0, start).replace(/\/\/ Sonne: normalize Discord reply IDs before constructing API payloads\.\nfunction normalizeSonneDiscordReplyId\(messageId\) \{[\s\S]*?\n\}\n$/, '') + replacement + source.slice(end);
const helpers = new Function('isSingleUseReplyToMode', replacement + '\nreturn {resolveDiscordReplyReference, createReusableDiscordReplyReference, resolveDiscordReplyMessageId};')(mode => mode === 'first');
const id = '1557654190090878978';
for (const input of [id, '<' + id + '>', ' <' + id + '> ']) {
  assert.equal(helpers.resolveDiscordReplyReference({replyToId: input}).messageId, id);
  assert.equal(helpers.createReusableDiscordReplyReference(input).messageId, id);
  assert.equal(helpers.resolveDiscordReplyMessageId({messageId: input, scope: 'all'}, false), id);
}
for (const input of [undefined, '', '<message_id>', 'not-an-id']) {
  assert.equal(helpers.resolveDiscordReplyReference({replyToId: input}), undefined);
  assert.equal(helpers.createReusableDiscordReplyReference(input), undefined);
  assert.equal(helpers.resolveDiscordReplyMessageId({messageId: input, scope: 'all'}, true), undefined);
}
assert.equal(helpers.resolveDiscordReplyMessageId({messageId: id, scope: 'first'}, false), undefined);
assert.equal(helpers.resolveDiscordReplyReference({replyToId: id, replyToMode: 'first'}).scope, 'first');
if (patched !== source) {
  const backup = path.join(root, 'sonne-hotfix-backups');
  fs.mkdirSync(backup, {recursive: true, mode: 0o700});
  const original = path.join(backup, path.basename(target) + '.original');
  if (!fs.existsSync(original)) fs.writeFileSync(original, source, {mode: 0o600, flag: 'wx'});
  fs.writeFileSync(target, patched);
}
console.log('Discord reply ID normalization applied; 23 offline checks passed.');
JS_DISCORD_REPLY_FIX
# Discord displays the bot account and its managed role with the same name.
# Recognize both while keeping the configured channel/user and mention gates.
compose run --rm --no-deps -T openclaw node - <<'JS_DISCORD_ROLE_MENTION'
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const root = process.env.OPENCLAW_STATE_DIR || '/home/node/.openclaw';
  const configPath = path.join(root, 'openclaw.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const discord = config.channels?.discord;
  const agent = config.agents?.entries?.sonne;
  const guildIds = Object.keys(discord?.guilds || {}).filter(id => /^\d{1,20}$/.test(id));
  if (!agent || !/^\d{1,20}$/.test(discord?.applicationId || '') || !guildIds.length || !process.env.DISCORD_BOT_TOKEN) {
    throw new Error('The Discord application, permitted server and bot token must be configured first.');
  }
  const rolePatterns = [];
  for (const guildId of guildIds) {
    const response = await fetch('https://discord.com/api/v10/guilds/' + guildId + '/roles', {
      headers: {Authorization: 'Bot ' + process.env.DISCORD_BOT_TOKEN},
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Cannot read Discord server roles (HTTP ' + response.status + '). Check the bot token and server membership.');
    const roles = await response.json();
    const botRoles = roles.filter(role => role.managed && role.tags?.bot_id === discord.applicationId && /^\d{1,20}$/.test(role.id));
    if (!botRoles.length) throw new Error('No managed role was found for this bot. Check the Application ID and Server ID.');
    rolePatterns.push(...botRoles.map(role => '<@&' + role.id + '>'));
  }
  const existing = agent.groupChat?.mentionPatterns ?? config.messages?.groupChat?.mentionPatterns ?? [];
  const patterns = [...new Set([...existing, ...rolePatterns])];
  if (JSON.stringify(agent.groupChat?.mentionPatterns) !== JSON.stringify(patterns)) {
    agent.groupChat = {...agent.groupChat, mentionPatterns: patterns};
    const temporary = configPath + '.sonne-role-mention.' + process.pid + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
      fs.renameSync(temporary, configPath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  console.log('Discord bot account and managed-role mentions are configured.');
})().catch(error => {
  console.error('Discord role mention configuration: ' + error.message);
  process.exitCode = 1;
});
JS_DISCORD_ROLE_MENTION
compose run --rm --no-deps -T openclaw node dist/index.js config validate --json
compose run --rm --no-deps -T openclaw node - < tests/check_mounts.cjs
compose up -d --wait --wait-timeout 180 ollama
compose exec -T ollama ollama pull "$MODEL_TAG"
compose up -d --wait --wait-timeout 180 openclaw
compose exec -T openclaw node dist/index.js infer model run --local --agent sonne \
  --model "ollama/$MODEL_TAG" --prompt 'Reply with exactly: sonne-ok' --json \
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
printf '\nInstalled in %s\nModel: %s\nNext: mention the bot in the permitted Discord channel.\n' "$INSTALL_DIR" "$MODEL_TAG"
