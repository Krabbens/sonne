#!/usr/bin/env bash
set -euo pipefail
SOURCE_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
RUNTIME_DIR=$HOME/agents/sonne
PREPARE_ONLY=0
CONFIGURE_LOGIN=0
while (($#)); do
  case "$1" in
    --dir) [[ $# -ge 2 ]] || { printf 'Missing --dir value.\n' >&2; exit 1; }; RUNTIME_DIR=$2; shift 2 ;;
    --prepare-only) PREPARE_ONLY=1; shift ;;
    --configure-login) CONFIGURE_LOGIN=1; shift ;;
    *) printf 'Usage: bash scripts/enable-prompt-studio.sh [--dir RUNTIME] [--prepare-only] [--configure-login]\n' >&2; exit 1 ;;
  esac
done
[[ $EUID -ne 0 ]] || { printf 'Run as the normal Sonne installation user.\n' >&2; exit 1; }
python3 - "$SOURCE_ROOT" "$RUNTIME_DIR" "$CONFIGURE_LOGIN" <<'PY'
import datetime, getpass, json, os, re, shutil, tempfile
from pathlib import Path
from urllib.parse import urlsplit
import sys
source = Path(sys.argv[1]).resolve()
runtime = Path(sys.argv[2]).expanduser().resolve()
configure_login = sys.argv[3] == '1'
def private_write(file, text):
    fd, temporary = tempfile.mkstemp(prefix='.studio-', dir=file.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
        os.chmod(temporary, 0o600)
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
config_path = runtime / '.state/openclaw/openclaw.json'
if (runtime/'.env').is_symlink():
    raise SystemExit('Refusing a symlinked .env.')
if not all(p.is_file() for p in (runtime/'.env', runtime/'compose.yaml', config_path, runtime/'templates/workspace/SOUL.md')):
    raise SystemExit('A configured Sonne runtime with SOUL.md is required. Run the installer first.')
config = json.loads(config_path.read_text())
defaults = config['agents']['defaults']
agent = config['agents'].get('entries', {}).get('sonne', {})
if agent.get('workspace', defaults.get('workspace')) != '/workspace':
    raise SystemExit('This integration requires the standard Sonne /workspace mount.')
if agent.get('contextInjection', defaults.get('contextInjection', 'always')) != 'always':
    raise SystemExit('Enable normal bootstrap injection before using Prompt Studio.')
destination = runtime/'prototypes/prompt-studio'
if destination != source/'prototypes/prompt-studio':
    destination.mkdir(parents=True, exist_ok=True)
    for name in ('server.mjs', 'discord-auth.mjs', 'Dockerfile', '.dockerignore', '.gitignore', 'README.md', 'compose.prompt-studio.yaml'):
        shutil.copy2(source/'prototypes/prompt-studio'/name, destination/name)
    shutil.copytree(source/'prototypes/prompt-studio/dist', destination/'dist', dirs_exist_ok=True)
    shutil.copytree(source/'prototypes/prompt-studio/openclaw-plugin', destination/'openclaw-plugin', dirs_exist_ok=True)
shutil.copy2(source/'prototypes/prompt-studio/compose.prompt-studio.yaml', runtime/'compose.prompt-studio.yaml')
if source != runtime:
    (runtime/'scripts').mkdir(exist_ok=True)
    shutil.copy2(source/'scripts/enable-prompt-studio.sh', runtime/'scripts/enable-prompt-studio.sh')
state = runtime/'.state/prompt-studio'
state.mkdir(parents=True, exist_ok=True, mode=0o700)
state.chmod(0o700)
values = {}
for line in (runtime/'.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('\"\'')
ids = list(dict.fromkeys(values.get('DISCORD_USER_IDS', '').split(',')))
if not ids or len(ids) > 100 or not all(re.fullmatch(r'\d{1,20}', user) for user in ids):
    raise SystemExit('Configure 1–100 permitted Discord User IDs before creating profiles.')
client_id = values.get('DISCORD_APPLICATION_ID', '')
if not re.fullmatch(r'\d{1,20}', client_id):
    raise SystemExit('Configure a valid DISCORD_APPLICATION_ID before enabling Discord sign-in.')
public_url = values.get('PROMPT_STUDIO_URL') or 'http://localhost:' + values.get('PROMPT_STUDIO_PORT', '9080')
secret = values.get('DISCORD_OAUTH_CLIENT_SECRET', '')
if configure_login:
    try:
        with open('/dev/tty', 'r') as tty:
            print('Prompt Studio URL [' + public_url + ']: ', end='', file=sys.stderr, flush=True)
            answer = tty.readline()
            if not answer:
                raise SystemExit('Input cancelled. Existing login configuration was retained.')
            public_url = answer.strip() or public_url
        entered = getpass.getpass('Discord OAuth2 Client Secret' + (' [Enter to keep existing]' if secret else '') + ': ').strip()
        secret = entered or secret
    except OSError:
        raise SystemExit('No terminal available. Set DISCORD_OAUTH_CLIENT_SECRET and PROMPT_STUDIO_URL in the private runtime .env.')
    if not secret:
        raise SystemExit('No OAuth2 Client Secret supplied. Existing login configuration was retained.')
parsed = urlsplit(public_url)
if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password
        or parsed.query or parsed.fragment or parsed.path not in ('', '/')
        or (parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'))):
    raise SystemExit('PROMPT_STUDIO_URL must be an HTTPS origin, or a localhost HTTP origin, without a path or credentials.')
try:
    if parsed.port is not None and not 1 <= parsed.port <= 65535:
        raise ValueError('Invalid port')
except ValueError:
    raise SystemExit('PROMPT_STUDIO_URL has an invalid port.')
public_url = public_url.rstrip('/')
if len(secret) > 1024 or re.search(r'''[\s'"\x00$`#\\]''', secret):
    raise SystemExit('DISCORD_OAUTH_CLIENT_SECRET contains invalid characters. Enter the secret exactly as shown by Discord.')
if configure_login:
    lines = (runtime/'.env').read_text().splitlines()
    for key, value in [('DISCORD_OAUTH_CLIENT_SECRET', secret), ('PROMPT_STUDIO_URL', public_url)]:
        lines = [line for line in lines if not line.startswith(key + '=')]
        lines.append(key + '=' + value)
    private_write(runtime/'.env', '\n'.join(lines) + '\n')
callback = public_url + '/auth/discord/callback'
private_write(state/'oauth.json', json.dumps({'clientId': client_id, 'clientSecret': secret, 'redirectUri': callback}, indent=2) + '\n')
accounts_path = state/'accounts.json'
accounts = json.loads(accounts_path.read_text()) if accounts_path.exists() else {'version': 1, 'users': []}
existing = {user['id']: user for user in accounts['users']}
private_write(accounts_path, json.dumps({'version': 1, 'users': [{'id': user, 'name': existing.get(user, {}).get('name', user)} for user in ids]}, indent=2) + '\n')
(state/'active').mkdir(exist_ok=True, mode=0o700)
(state/'active/shared').mkdir(exist_ok=True, mode=0o700)
(runtime/'workspace/files/prompt-studio/shared/.sonne-memory').mkdir(parents=True, exist_ok=True, mode=0o700)
private_write(state/'active/users.json', json.dumps(ids) + '\n')
plugin = runtime/'.state/openclaw/extensions/sonne-personal-prompts'
shutil.copytree(source/'prototypes/prompt-studio/openclaw-plugin', plugin, dirs_exist_ok=True)
before = json.dumps(config, sort_keys=True)
defaults['bootstrapMaxChars'] = max(40000, defaults.get('bootstrapMaxChars', 0))
defaults['bootstrapTotalMaxChars'] = max(80000, defaults.get('bootstrapTotalMaxChars', 0))
plugins = config.setdefault('plugins', {})
allowed = plugins.get('allow')
if allowed is not None and 'sonne-personal-prompts' not in allowed:
    allowed.append('sonne-personal-prompts')
plugins.setdefault('entries', {})['sonne-personal-prompts'] = {
    'enabled': True,
    'hooks': {'allowPromptInjection': True, 'allowConversationAccess': True},
    'config': {'promptsDir': '/personal-prompts'},
}
if before != json.dumps(config, sort_keys=True):
    backup = state/'backups'
    backup.mkdir(exist_ok=True, mode=0o700)
    filename = 'openclaw-before-enablement-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '.json'
    original = backup/filename
    original.write_bytes(config_path.read_bytes()); original.chmod(0o600)
    fd, temporary = tempfile.mkstemp(prefix='.studio-config-', dir=config_path.parent)
    with os.fdopen(fd, 'w') as stream:
        json.dump(config, stream, indent=2); stream.write('\n')
    os.chmod(temporary, 0o600); os.replace(temporary, config_path)
print('Prepared personal Prompt Studio profiles. Shared agent instructions have not been changed.')
print('Prompt Studio: ' + public_url)
print('Register this OAuth2 redirect in the Discord Developer Portal: ' + callback)
print('Discord sign-in is configured.' if secret else 'Discord sign-in is disabled until an OAuth2 Client Secret is configured. Run this helper with --configure-login.')
PY
if ((PREPARE_ONLY)); then exit 0; fi
cd -- "$RUNTIME_DIR"
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker);
  else printf 'Docker is unavailable for this user. Prepared files were retained.\n' >&2; exit 1; fi
fi
COMPOSE=("${DOCKER[@]}" compose -p sonne --env-file .env -f compose.yaml)
if [[ -f compose.override.yaml ]]; then COMPOSE+=(-f compose.override.yaml); fi
COMPOSE+=(-f compose.prompt-studio.yaml)
"${COMPOSE[@]}" run --rm --no-deps -T openclaw node dist/index.js config validate --json
"${COMPOSE[@]}" up -d --build --force-recreate --wait --wait-timeout 180 prompt-studio openclaw
printf 'Prompt Studio is running. Once Discord sign-in is configured, select Apply to Sonne to update your personal prompt.\n'
