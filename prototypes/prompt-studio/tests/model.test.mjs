import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, compilePrompt, movePriority, compareLines, DISCIPLINES } from '../dist/model.mjs';

test('all discipline values compile in a stable, explicit order', () => {
  const project = createProject(false);
  project.project.name = 'Test project';
  project.project.overview = 'One coordinated brief.';
  for (const d of DISCIPLINES) project.disciplines[d.id].values.objective = `Objective for ${d.id}`;
  const first = compilePrompt(project);
  assert.equal(first, compilePrompt(project));
  let previous = 0;
  for (const d of DISCIPLINES) {
    const position = first.indexOf('### ' + d.name);
    assert.ok(position > previous); previous = position;
    assert.ok(first.includes(`Objective for ${d.id}`));
  }
  assert.ok(first.includes('No cross-discipline precedence has been assigned.'));
});

test('empty disciplines stay explicit and no sample content leaks into a blank project', () => {
  const prompt = compilePrompt(createProject(false));
  assert.equal((prompt.match(/No requirements supplied/g) || []).length, DISCIPLINES.length);
  assert.ok(!prompt.includes('1,200'));
  assert.ok(!prompt.includes('Research pavilion'));
});

test('reordering priorities affects the output and invalidates review status', () => {
  const project = createProject(false);
  project.disciplines.architecture.priorities = ['First', 'Second', 'Third'];
  project.disciplines.architecture.ready = true;
  assert.equal(movePriority(project, 'architecture', 2, 0), true);
  assert.equal(project.disciplines.architecture.ready, false);
  assert.ok(compilePrompt(project).includes('1. Third\n2. First\n3. Second'));
  assert.equal(movePriority(project, 'architecture', -1, 3), false);
  assert.deepEqual(project.disciplines.architecture.priorities, ['Third', 'First', 'Second']);
});

test('sources distinguish original file references from supplied text', () => {
  const project = createProject(false);
  project.sources = [
    { id: '1', name: 'plan.pdf', type: 'application/pdf', size: 4, discipline: 'architecture', category: 'Reference', note: 'Check adjacencies.', text: null, truncated: false },
    { id: '2', name: 'requirements.md', type: 'text/markdown', size: 4, discipline: 'structure', category: 'Constraint', note: '', text: 'A 6 m clear span.', truncated: true }
  ];
  const prompt = compilePrompt(validateProject(project));
  assert.ok(prompt.includes('Associated sources: plan.pdf'));
  assert.ok(prompt.includes('Relevance: Check adjacencies.'));
  assert.ok(prompt.includes('File contents are not included'));
  assert.ok(prompt.includes('first 12,000 characters only'));
  assert.ok(prompt.includes('--- BEGIN SOURCE EXCERPT ---\nA 6 m clear span.'));
});

test('imports reject corrupt structure, unsafe enum values and excessive attachments', () => {
  const mutations = [
    p => p.schemaVersion = 2,
    p => p.project.name = '',
    p => p.disciplines.architecture.topics = ['Unrecognised topic'],
    p => p.disciplines.architecture.values.format = 'Unrecognised format',
    p => p.disciplines.structure.priorities = Array(31).fill('Requirement'),
    p => p.sources = [{ id: 'x', name: 'file', discipline: '__proto__', category: 'Reference', size: 0, type: '', note: '', text: null }],
    p => p.versions = [{ id: 'x', title: 'Review', prompt: '', createdAt: 'invalid-date' }]
  ];
  for (const mutate of mutations) { const p = createProject(); mutate(p); assert.throws(() => validateProject(p)); }
});

test('project validation preserves compiled content and original attachment blobs', () => {
  const project = createProject();
  project.sources.push({ id: 'text', name: 'brief.txt', discipline: 'coordination', category: 'Design brief', type: 'text/plain', size: 5, note: 'Summary', text: 'Hello', truncated: false, blob: new Blob(['Hello']) });
  project.versions.push({ id: 'v1', title: 'First review', prompt: compilePrompt(project), createdAt: '2026-10-11T12:00:00Z' });
  const restored = validateProject(structuredClone(project));
  assert.equal(compilePrompt(restored), compilePrompt(project));
  assert.equal(restored.sources[0].blob.size, 5);
  assert.equal(restored.versions[0].prompt, compilePrompt(project));
});

test('line comparison reconstructs both versions and reports additions and removals', () => {
  const before = 'Header\nOld text\nKeep\n', after = 'Header\nNew text\nKeep\nExtra\n';
  const diff = compareLines(before, after);
  assert.equal(diff.filter(x => x.type !== 'added').map(x => x.text).join('\n'), before);
  assert.equal(diff.filter(x => x.type !== 'removed').map(x => x.text).join('\n'), after);
  assert.ok(diff.some(x => x.type === 'removed' && x.text === 'Old text'));
  assert.ok(diff.some(x => x.type === 'added' && x.text === 'Extra'));
});

test('large source comparisons use a bounded fallback', () => {
  const before = 'a\n'.repeat(800), after = 'b\n'.repeat(800);
  assert.deepEqual(compareLines(before, after), [{ type: 'removed', text: before }, { type: 'added', text: after }]);
});
