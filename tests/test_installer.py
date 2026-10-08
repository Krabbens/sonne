"""Exercise the standalone installer's generated configuration and Linux CLI."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / 'scripts/install-sonne.sh'
SOURCE = INSTALLER.read_text()
CONFIG_BLOCK = SOURCE.split("<<'PY_CONFIG'\n", 1)[1].split('\nPY_CONFIG', 1)[0]
REF = SOURCE.split('REF=', 1)[1].splitlines()[0]
ENV = (
    'DISCORD_BOT_TOKEN=synthetic-installer-token\n'
    'DISCORD_APPLICATION_ID=111111111111111111\n'
    'DISCORD_GUILD_ID=222222222222222222\n'
    'DISCORD_CHANNEL_ID=333333333333333333\n'
    'DISCORD_USER_IDS=444444444444444444\n'
)


@unittest.skipIf(os.getuid() == 0, 'The installer intentionally refuses root')
class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.project = self.root / 'installation'
        self.project.mkdir()
        for directory in ('scripts', 'templates'):
            shutil.copytree(ROOT / directory, self.project / directory)
        # The standalone installer targets its pinned source, not newer prompts.
        rules = subprocess.run(['git', 'show', REF + ':templates/workspace/AGENTS.md'],
                               cwd=ROOT, capture_output=True, text=True, check=True).stdout
        (self.project / 'templates/workspace/AGENTS.md').write_text(rules)
        self.env_file = self.root / 'input.env'
        self.env_file.write_text(ENV)

    def configure(self, model, check=True):
        return subprocess.run(
            [sys.executable, '-', 'arm64', str(self.env_file), model],
            input=CONFIG_BLOCK, cwd=self.project, capture_output=True,
            text=True, check=check)

    def config(self):
        return json.loads((self.project / '.state/openclaw/openclaw.json').read_text())

    def test_model_choice_routes_every_model_consumer_and_resource_limit(self):
        for choice, tag, context, memory in (
            ('qwen', 'qwen3.5:2b-q4_K_M', 65536, '4g'),
            ('gemma', 'gemma4:e2b-it-qat', 32768, '8g'),
        ):
            with self.subTest(model=choice):
                result = self.configure(choice)
                config = self.config()
                model = config['models']['providers']['ollama']['models'][0]
                self.assertEqual(model['id'], tag)
                self.assertEqual(model['input'], ['text', 'image'])
                self.assertEqual(model['contextTokens'], context)
                self.assertEqual(model['params']['num_ctx'], context)
                self.assertEqual(model['params']['num_gpu'], 0)
                self.assertFalse(model['reasoning'])
                defaults = config['agents']['defaults']
                for route in ('model', 'imageModel'):
                    self.assertEqual(defaults[route], {'primary': 'ollama/' + tag, 'fallbacks': []})
                self.assertEqual(defaults['utilityModel'], 'ollama/' + tag)
                self.assertEqual(config['tools']['media']['models'][0]['model'], tag)
                self.assertEqual(config['tools']['allow'], ['read', 'write', 'edit', 'view_image'])
                self.assertTrue(config['channels']['discord']['guilds']['222222222222222222']['requireMention'])
                override = (self.project / 'compose.override.yaml').read_text()
                self.assertIn('mem_limit: ' + memory, override)
                self.assertIn('memswap_limit: ' + memory, override)
                self.assertIn('OLLAMA_CONTEXT_LENGTH: "' + str(context) + '"', override)
                self.assertEqual((self.project / '.state/sonne-model').read_text().strip(), choice)
                self.assertNotIn('synthetic-installer-token', result.stdout + result.stderr)
                self.assertNotIn('synthetic-installer-token', json.dumps(config))

    def test_switching_models_preserves_user_files_and_gateway_token(self):
        self.configure('qwen')
        env_before = (self.project / '.env').read_text()
        note = self.project / 'workspace/files/note.txt'
        note.write_text('Keep this user file.')
        for model in ('gemma', 'gemma', 'qwen'):
            self.configure(model)
            self.assertEqual(note.read_text(), 'Keep this user file.')
            self.assertEqual((self.project / '.env').read_text(), env_before)
            for relative in ('.env', '.state/sonne-model', '.state/openclaw/openclaw.json'):
                self.assertEqual((self.project / relative).stat().st_mode & 0o777, 0o600)

    def test_legacy_override_is_migrated_but_custom_override_is_preserved(self):
        override = self.project / 'compose.override.yaml'
        override.write_text('services:\n  ollama:\n    platform: linux/arm64\n  openclaw:\n    platform: linux/arm64\n    environment:\n      OLLAMA_API_KEY: ollama-local\n')
        self.configure('gemma')
        before = (self.project / '.state/openclaw/openclaw.json').read_bytes()
        override.write_text('services:\n  ollama:\n    mem_limit: 12g\n')
        result = self.configure('qwen', check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Existing Compose override differs', result.stderr)
        self.assertEqual((self.project / '.state/openclaw/openclaw.json').read_bytes(), before)
        self.assertIn('mem_limit: 12g', override.read_text())

    def test_incomplete_credentials_do_not_save_a_model_or_config(self):
        self.env_file.write_text('DISCORD_BOT_TOKEN=replace-me\n')
        result = self.configure('gemma', check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.project / '.state').exists())

    @unittest.skipUnless(sys.platform.startswith('linux'), 'Full CLI needs Linux')
    def test_prepare_cli_default_saved_choice_override_and_interactive_menu(self):
        shutil.rmtree(self.project)
        subprocess.run(['git', 'clone', '--quiet', '--shared', '--no-checkout', str(ROOT), str(self.project)], check=True)
        subprocess.run(['git', 'checkout', '--quiet', '--detach', REF], cwd=self.project, check=True)
        (self.project / '.sonne-auto-installer').write_text(REF + '\n')
        forbidden = self.root / 'forbidden-tools'
        forbidden.mkdir()
        for tool in ('sudo', 'docker'):
            script = forbidden / tool
            script.write_text('#!/bin/sh\nexit 99\n')
            script.chmod(0o755)
        process_env = {**os.environ, 'PATH': str(forbidden) + os.pathsep + os.environ['PATH']}
        command = ['bash', str(INSTALLER), '--dir', str(self.project), '--env-file', str(self.env_file), '--prepare-only']
        for args, expected in (([], 'qwen'), (['--model', 'gemma'], 'gemma'), ([], 'gemma'), (['--model', 'qwen'], 'qwen')):
            result = subprocess.run(command + args, stdin=subprocess.DEVNULL, capture_output=True, text=True, env=process_env, check=True)
            self.assertIn('No sudo, Docker or inference was used.', result.stdout)
            self.assertEqual((self.project / '.state/sonne-model').read_text().strip(), expected)
        (self.project / '.state/sonne-model').unlink()
        import pty
        master, slave = pty.openpty()
        try:
            process = subprocess.Popen(command, stdin=slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=process_env)
            os.write(master, b'2\n')
            stdout, stderr = process.communicate(timeout=60)
            self.assertEqual(process.returncode, 0, stderr)
            self.assertIn('Choose the local CPU model', stdout)
            self.assertEqual((self.project / '.state/sonne-model').read_text().strip(), 'gemma')
        finally:
            os.close(master)
            os.close(slave)
        before = (self.project / '.state/openclaw/openclaw.json').read_bytes()
        result = subprocess.run(command + ['--model', 'unknown'], capture_output=True, text=True, env=process_env)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.project / '.state/openclaw/openclaw.json').read_bytes(), before)

    @unittest.skipUnless(sys.platform.startswith('linux'), 'Hardware guard needs Linux')
    def test_gemma_memory_guard_runs_before_sudo_or_destination_changes(self):
        memory = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines()
                          if line.startswith('MemTotal:')))
        if memory >= 15 * 1024 * 1024:
            self.skipTest('Host has enough memory for the Gemma profile')
        destination = self.root / 'not-created'
        result = subprocess.run(['bash', str(INSTALLER), '--model', 'gemma', '--dir', str(destination)],
                                stdin=subprocess.DEVNULL, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('requires approximately 16 GiB host RAM', result.stderr)
        self.assertFalse(destination.exists())


if __name__ == '__main__':
    unittest.main()
