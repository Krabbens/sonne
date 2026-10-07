#!/usr/bin/env python3
"""Generate Sonne's local config. Python standard library only; never prints secrets."""
import copy
import json
import os
from pathlib import Path
import re
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]
ID = re.compile(r"[0-9]{17,20}\Z")


def read_env(path):
    values = {}
    for number, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError(f"Invalid .env assignment at line {number}")
        if value.startswith(("'", '"')) or any(c.isspace() for c in value):
            raise ValueError(f"Use an unquoted value without spaces for {key}")
        values[key] = value
    return values


def render_config(values, template):
    required = ("DISCORD_APPLICATION_ID", "DISCORD_GUILD_ID", "DISCORD_CHANNEL_ID")
    for key in required:
        if not ID.fullmatch(values.get(key, "")):
            raise ValueError(f"Set {key} to its numeric Discord ID")
    users = list(dict.fromkeys(values.get("DISCORD_USER_IDS", "").split(",")))
    if not users or not all(ID.fullmatch(user) for user in users):
        raise ValueError("Set DISCORD_USER_IDS to comma-separated numeric user IDs")
    token = values.get("DISCORD_BOT_TOKEN", "")
    if not token or token.startswith("replace-"):
        raise ValueError("Set DISCORD_BOT_TOKEN locally; do not send it in chat")
    mapping = {
        "__APPLICATION_ID__": values["DISCORD_APPLICATION_ID"],
        "__GUILD_ID__": values["DISCORD_GUILD_ID"],
        "__CHANNEL_ID__": values["DISCORD_CHANNEL_ID"],
        "__USER_IDS__": users,
    }

    def replace(value):
        if isinstance(value, dict):
            return {mapping.get(k, k): replace(v) for k, v in value.items()}
        if isinstance(value, list):
            return [replace(v) for v in value]
        return copy.deepcopy(mapping.get(value, value)) if isinstance(value, str) else value

    return replace(template)


def main():
    if os.getuid() == 0:
        raise ValueError("Run configure.py as your normal Linux user, without sudo")
    env_path = ROOT / ".env"
    if not env_path.exists():
        raise ValueError("Copy .env.example to .env and fill the Discord values first")
    values = read_env(env_path)
    template = json.loads((ROOT / "templates/openclaw.json").read_text())
    config = render_config(values, template)
    # Match bind-mount ownership to the non-root container user.
    replacements = {
        "LOCAL_UID": str(os.getuid()),
        "LOCAL_GID": str(os.getgid()),
        "OPENCLAW_GATEWAY_TOKEN": values.get("OPENCLAW_GATEWAY_TOKEN") or secrets.token_hex(32),
    }
    lines = env_path.read_text().splitlines()
    for key, value in replacements.items():
        lines = [line for line in lines if not line.startswith(key + "=")]
        lines.append(key + "=" + value)
    env_path.write_text("\n".join(lines) + "\n")
    env_path.chmod(0o600)
    state = ROOT / ".state/openclaw"
    state.mkdir(parents=True, exist_ok=True)
    (ROOT / ".state").chmod(0o700)
    state.chmod(0o700)
    cache = state / "cache"
    cache.mkdir(exist_ok=True)
    cache.chmod(0o700)
    (ROOT / "workspace/files").mkdir(parents=True, exist_ok=True)
    (ROOT / "workspace").chmod(0o700)
    # Do not persist the actual token in the JSON config: it contains env SecretRefs.
    target = state / "openclaw.json"
    target.write_text(json.dumps(config, indent=2) + "\n")
    target.chmod(0o600)
    print("Created local config and workspace; secrets were not printed.")
    print("Re-run this script after changing IDs or templates/openclaw.json.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        print(f"Configuration failed: {exc}", file=sys.stderr)
        sys.exit(1)
