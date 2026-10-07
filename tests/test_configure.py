"""Check ID routing, secret references and rejection of open access inputs."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("configure", ROOT / "scripts/configure.py")
configure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure)


class ConfigureTests(unittest.TestCase):
    def setUp(self):
        self.template = json.loads((ROOT / "templates/openclaw.json").read_text())
        self.values = {
            "DISCORD_APPLICATION_ID": "111111111111111111",
            "DISCORD_GUILD_ID": "222222222222222222",
            "DISCORD_CHANNEL_ID": "333333333333333333",
            "DISCORD_USER_IDS": "444444444444444444,555555555555555555,444444444444444444",
            "DISCORD_BOT_TOKEN": "synthetic-test-value-not-a-real-token",
        }

    def test_multiple_users_route_to_one_channel_without_persisting_token(self):
        config = configure.render_config(self.values, self.template)
        discord = config["channels"]["discord"]
        guild = discord["guilds"][self.values["DISCORD_GUILD_ID"]]
        self.assertEqual(guild["users"], ["444444444444444444", "555555555555555555"])
        self.assertEqual(list(guild["channels"]), [self.values["DISCORD_CHANNEL_ID"]])
        self.assertTrue(guild["requireMention"])
        self.assertEqual(discord["dmPolicy"], "disabled")
        self.assertEqual(discord["token"]["source"], "env")
        self.assertNotIn(self.values["DISCORD_BOT_TOKEN"], json.dumps(config))
        self.assertNotIn("__GUILD_ID__", json.dumps(config))
        self.assertIn("__GUILD_ID__", self.template["channels"]["discord"]["guilds"])

    def test_rejects_wildcards_empty_users_and_non_numeric_ids(self):
        for key, value in [("DISCORD_USER_IDS", "*"), ("DISCORD_USER_IDS", ""),
                           ("DISCORD_USER_IDS", "444444444444444444,"),
                           ("DISCORD_GUILD_ID", "my-server")]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                configure.render_config({**self.values, key: value}, self.template)

    def test_placeholder_token_is_rejected(self):
        with self.assertRaises(ValueError):
            configure.render_config({**self.values, "DISCORD_BOT_TOKEN": "replace-me"}, self.template)

    def test_env_parser_treats_values_as_data(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / ".env"
            path.write_text("# comment\nDISCORD_BOT_TOKEN=$(touch_never_execute)\n")
            self.assertEqual(configure.read_env(path)["DISCORD_BOT_TOKEN"], "$(touch_never_execute)")
            path.write_text("export DISCORD_BOT_TOKEN=value\n")
            with self.assertRaises(ValueError):
                configure.read_env(path)

    @unittest.skipIf(os.getuid() == 0, "The setup intentionally refuses root")
    def test_setup_creates_private_files_and_keeps_gateway_token_on_rerun(self):
        with tempfile.TemporaryDirectory() as folder:
            project = Path(folder)
            (project / "scripts").mkdir()
            (project / "templates").mkdir()
            shutil.copy2(ROOT / "scripts/configure.py", project / "scripts/configure.py")
            shutil.copy2(ROOT / "templates/openclaw.json", project / "templates/openclaw.json")
            env = project / ".env"
            env.write_text("\n".join(k + "=" + v for k, v in self.values.items()) + "\n")
            command = [sys.executable, str(project / "scripts/configure.py")]
            result = subprocess.run(command, check=True, capture_output=True, text=True)
            first = configure.read_env(env)
            self.assertNotIn(self.values["DISCORD_BOT_TOKEN"], result.stdout)
            self.assertEqual(env.stat().st_mode & 0o777, 0o600)
            config_path = project / ".state/openclaw/openclaw.json"
            self.assertEqual(config_path.stat().st_mode & 0o777, 0o600)
            self.assertTrue((project / "workspace/files").is_dir())
            self.assertNotIn(self.values["DISCORD_BOT_TOKEN"], config_path.read_text())
            subprocess.run(command, check=True, capture_output=True)
            second = configure.read_env(env)
            self.assertEqual(first["OPENCLAW_GATEWAY_TOKEN"], second["OPENCLAW_GATEWAY_TOKEN"])
            self.assertEqual(second["LOCAL_UID"], str(os.getuid()))

    @unittest.skipIf(os.getuid() == 0, "The setup intentionally refuses root")
    def test_incomplete_setup_leaves_environment_and_state_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            project = Path(folder)
            (project / "scripts").mkdir()
            (project / "templates").mkdir()
            shutil.copy2(ROOT / "scripts/configure.py", project / "scripts/configure.py")
            shutil.copy2(ROOT / "templates/openclaw.json", project / "templates/openclaw.json")
            env = project / ".env"
            original = "DISCORD_APPLICATION_ID=replace-me\n"
            env.write_text(original)
            result = subprocess.run([sys.executable, str(project / "scripts/configure.py")],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(env.read_text(), original)
            self.assertFalse((project / ".state").exists())


if __name__ == "__main__":
    unittest.main()
