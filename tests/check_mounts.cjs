// Run inside a one-off OpenClaw container: node - < tests/check_mounts.cjs
// Starts no gateway, contacts no Discord account and uses only disposable data.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, 'utf8'));
assert.equal(config.agents.defaults.workspace, '/workspace');
assert.equal(process.env.OPENCLAW_WORKSPACE_DIR, '/workspace');

for (const name of ['SOUL.md', 'AGENTS.md']) {
  const path = `/workspace/${name}`;
  const original = fs.readFileSync(path, 'utf8');
  assert.ok(original.trim(), `${name} must be readable and non-empty`);
  // Write identical content if permissions are accidentally too broad.
  assert.throws(() => fs.writeFileSync(path, original), {code: 'EROFS'});
  let renamed = false;
  try {
    assert.throws(() => {
      fs.renameSync(path, `${path}.mount-check`);
      renamed = true;
    }, {code: 'EROFS'});
  } finally {
    if (renamed) fs.renameSync(`${path}.mount-check`, path);
  }
}

function checkWritableDirectory(parent) {
  const directory = fs.mkdtempSync(`${parent}/.sonne-mount-check-`);
  try {
    const path = `${directory}/probe.txt`;
    fs.writeFileSync(path, 'SONNE MOUNT OK\n', {flag: 'wx'});
    assert.equal(fs.readFileSync(path, 'utf8'), 'SONNE MOUNT OK\n');
  } finally {
    fs.rmSync(directory, {recursive: true});
  }
}
checkWritableDirectory('/workspace/files');
checkWritableDirectory('/home/node/.cache');
assert.ok(process.env.NPM_CONFIG_CACHE, 'npm cache must be configured');
fs.mkdirSync(process.env.NPM_CONFIG_CACHE, {recursive: true});
checkWritableDirectory(process.env.NPM_CONFIG_CACHE);
console.log('PASS: prompts read-only; files and runtime/npm caches writable; workspace paths match.');
