"""Check the installer's credential phase against its pinned core templates."""
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[3]
SOURCE = (ROOT / 'scripts/install-sonne.sh').read_text()
CONFIG = SOURCE.split("<<'PY_CONFIG'\n", 1)[1].split('\nPY_CONFIG', 1)[0]
REF = SOURCE.split('REF=', 1)[1].splitlines()[0]
ENV = (
    'DISCORD_BOT_TOKEN=synthetic-bot-secret\n'
    'DISCORD_APPLICATION_ID=111111111111111111\n'
    'DISCORD_GUILD_ID=222222222222222222\n'
    'DISCORD_CHANNEL_ID=333333333333333333\n'
    'DISCORD_USER_IDS=444444444444444444\n'
)
OAUTH = 'DISCORD_OAUTH_CLIENT_SECRET=synthetic-oauth-secret\nPROMPT_STUDIO_URL=http://localhost:9080\n'


@unittest.skipIf(os.getuid() == 0, 'The installer intentionally refuses root')
class InstallerCredentialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = {}
        for filename in ('scripts/configure.py', 'templates/openclaw.json',
                         'templates/workspace/AGENTS.md', 'templates/workspace/SOUL.md'):
            cls.core[filename] = subprocess.run(
                ['git', 'show', REF + ':' + filename], cwd=ROOT,
                capture_output=True, text=True, check=True).stdout

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.project = Path(self.temporary.name) / 'runtime'
        self.project.mkdir()
        for filename, text in self.core.items():
            file = self.project / filename
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(text)
        (self.project / '.env.example').write_text('')
        self.input_file = Path(self.temporary.name) / 'private.env'

    def configure(self, text=None, prepare=False, model='qwen'):
        if text is not None:
            self.input_file.write_text(text)
        return subprocess.run(
            [sys.executable, '-', 'arm64', str(self.input_file) if text is not None else '', model, '1' if prepare else '0'],
            input=CONFIG, cwd=self.project, capture_output=True, text=True, timeout=15)

    def test_full_configuration_saves_oauth_with_other_credentials_and_reuses_it(self):
        first = self.configure(ENV + OAUTH)
        self.assertEqual(first.returncode, 0, first.stderr)
        env = self.project / '.env'
        saved = env.read_text()
        self.assertIn('DISCORD_OAUTH_CLIENT_SECRET=synthetic-oauth-secret', saved)
        self.assertEqual(env.stat().st_mode & 0o777, 0o600)
        rerun = self.configure(model='gemma')
        self.assertEqual(rerun.returncode, 0, rerun.stderr)
        self.assertEqual(env.read_text(), saved)
        self.assertNotIn('synthetic-oauth-secret', first.stdout + first.stderr + rerun.stdout + rerun.stderr)

    def test_full_configuration_requires_secret_before_writing_configuration(self):
        result = self.configure(ENV)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('DISCORD_OAUTH_CLIENT_SECRET', result.stderr)
        self.assertFalse((self.project / '.env').exists())
        self.assertFalse((self.project / '.state').exists())

    def test_preparation_can_omit_oauth_then_full_setup_can_complete_it(self):
        result = self.configure(ENV, prepare=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        env = self.project / '.env'
        original_bot = next(line for line in env.read_text().splitlines() if line.startswith('DISCORD_BOT_TOKEN='))
        result = self.configure(ENV + OAUTH)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(original_bot, env.read_text())
        saved = env.read_text()
        conflict = self.configure(ENV + OAUTH.replace('synthetic-oauth-secret', 'different-secret'))
        self.assertNotEqual(conflict.returncode, 0)
        self.assertEqual(env.read_text(), saved)

    def test_invalid_secrets_and_public_http_origins_do_not_write_configuration(self):
        for text in [ENV + OAUTH.replace('synthetic-oauth-secret', 'replace-with-secret'),
                     ENV + OAUTH.replace('synthetic-oauth-secret', 'bad$secret'),
                     ENV + OAUTH.replace('http://localhost:9080', 'http://public.example'),
                     ENV + OAUTH.replace('http://localhost:9080', 'https://:9080'),
                     ENV + OAUTH.replace('http://localhost:9080', 'https://studio.example/path')]:
            with self.subTest(text=text):
                result = self.configure(text)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.project / '.env').exists())

    @unittest.skipUnless(hasattr(os, 'fork'), 'Terminal test needs a POSIX host')
    def test_initial_terminal_prompts_include_both_hidden_secrets_ids_and_web_address(self):
        import pty
        pid, terminal = pty.fork()
        if pid == 0:
            os.chdir(self.project)
            os.execv(sys.executable, [sys.executable, '-c', CONFIG, 'arm64', '', 'qwen', '0'])
        output = b''
        prompts = [
            (b'Discord bot token: ', b'synthetic-bot-secret\n'),
            (b'Discord OAuth2 Client Secret: ', b'synthetic-oauth-secret\n'),
            (b'Application ID: ', b'111111111111111111\n'),
            (b'Server ID: ', b'222222222222222222\n'),
            (b'Channel ID: ', b'333333333333333333\n'),
            (b'Permitted User IDs (comma-separated): ', b'444444444444444444\n'),
            (b'Prompt Studio URL [http://localhost:9080]: ', b'\n'),
        ]
        reaped = False
        try:
            for prompt, answer in prompts:
                deadline = time.monotonic() + 10
                while prompt not in output:
                    self.assertLess(time.monotonic(), deadline, output.decode(errors='replace'))
                    if select.select([terminal], [], [], 0.1)[0]:
                        output += os.read(terminal, 65536)
                os.write(terminal, answer)
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if select.select([terminal], [], [], 0.1)[0]:
                    try:
                        chunk = os.read(terminal, 65536)
                        if chunk:
                            output += chunk
                    except OSError:
                        pass
                finished, status = os.waitpid(pid, os.WNOHANG)
                if finished:
                    reaped = True
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0, output.decode(errors='replace'))
                    break
            self.assertTrue(reaped, 'Credential prompt process did not finish.')
        finally:
            os.close(terminal)
            if not reaped:
                os.kill(pid, signal.SIGTERM)
                os.waitpid(pid, 0)
        for secret in [b'synthetic-bot-secret', b'synthetic-oauth-secret']:
            self.assertNotIn(secret, output)
        saved = (self.project / '.env').read_text()
        self.assertIn('DISCORD_OAUTH_CLIENT_SECRET=synthetic-oauth-secret', saved)
        self.assertIn('PROMPT_STUDIO_URL=http://localhost:9080', saved)


if __name__ == '__main__':
    unittest.main()
