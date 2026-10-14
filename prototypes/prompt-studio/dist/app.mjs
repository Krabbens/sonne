import {DISCIPLINES, OWNER_DISCIPLINES, TEAM_FIELDS, PROJECT_FIELDS, INFORMATION_STARTERS, SOURCE_CATEGORIES, MAX_FILE, MAX_TOTAL, MAX_SOURCES, TEXT_LIMIT, MAX_DELIVERIES, MAX_COST_CATEGORIES, totalProjectCosts, REQUEST_TYPES, DELIVERY_STATUSES, deliveryStatusLabel, nextInformationDelivery, disciplinePriorities, moveDisciplinePriority, createProject, createShared, validateProject, validateShared, compilePrompt, compileTeamPrompt, compilePersonalPrompt, compileWorkspacePrompt, projectChanges, historyCSV, compareLines} from './model.mjs';

import {requestJSON, requestResponse} from './request.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const glyphs = {
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
 architecture:'<path d="m3 21 9-18 9 18M6 15h12M9 21v-6m6 6v-6"/>',
 structure:'<path d="M4 21V4h16v17M4 4l16 17M20 4 4 21M2 21h20M4 12h16"/>',
 coordination:'<rect x="8" y="3" width="8" height="5" rx="1"/><path d="M12 8v5M5 13h14v3M5 13v3"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/>',
 services:'<path d="M12 3v6m0 6v6M3 12h6m6 0h6"/><circle cx="12" cy="12" r="3"/>',
 facilities:'<path d="M4 21V9l8-6 8 6v12H4zm5 0v-7h6v7M8 10h.01m8 0h.01"/>',
 project:'<path d="M3 20V5h7l2 3h9v12zM3 11h18"/>',
 profile:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
 edit:'<path d="m16 3 5 5-12 12-6 1 1-6L16 3zm-2 2 5 5"/>',
 up:'<path d="m7 14 5-5 5 5"/>', down:'<path d="m7 10 5 5 5-5"/>',
 document:'<path d="M14 2H5v20h14V7zM14 2v5h5M8 12h8m-8 4h6"/>',
 history:'<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2"/>',
 grip:'<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name] || glyphs.document}</svg>`;
const date = value => new Date(value).toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const fileSize = n => n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const role = id => DISCIPLINES.find(d => d.id === id);
let state = createProject(false), shared = createShared(), history = [], view = 'home', tab = '', need = 'architecture', priorityFolder = '', profile = null;
let preview = new URL(location.href).searchParams.get('preview') === '1', connected = false, oauthConfigured = false, conflict = false, failed = false;
let revisions = {personal:0, shared:0}, applied = {personal:null, shared:null}, dirty = {personal:0, shared:0}, saved = {personal:0, shared:0};
const publicationRequests = {personal:null, shared:null};
const draftRequests = {personal:null, shared:null};
let queue = Promise.resolve(), timer, toastTimer, dragFrom = null, dragDeliveryFrom = null, metric = 'area', lastPreviewShared = createShared();
const uploaded = new Set();
const apiBase = scope => scope === 'shared' ? '/api/team' : '/api';
const workspace = scope => scope === 'shared' ? shared : state;
const headers = {'Content-Type':'application/json', 'X-Prompt-Studio':'1'};
const profileTitle = () => {
  const name = role(state.personal.discipline)?.name;
  return name ? `${name}’s profile` : 'Profile';
};

async function api(url, options = {}, config = {}) {
  try {return await requestJSON(url,options,config);}
  catch (error) {if (error.status === 409) conflict = true; throw error;}
}
function toast(text) {
  $('#toast').textContent = text; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000);
}
function changed(scope) {
  dirty[scope]++; if (scope === 'personal') state.updatedAt = new Date().toISOString();
  clearTimeout(timer); timer = setTimeout(persist, 650); status();
}
function status() {
  if ($('#save-status')) $('#save-status').textContent = preview ? 'Preview · not saved' : conflict ? 'Reload needed' : failed ? 'Not saved' : Object.keys(dirty).some(s => dirty[s] !== saved[s]) ? 'Saving…' : 'Saved';
  const notice = $('#storage-notice');
  if (notice) {
    notice.classList.toggle('hidden', !failed);
    notice.innerHTML = `${conflict ? 'This workspace changed in another tab or profile. Export your draft before reloading.' : 'The server could not save your changes.'} <button data-action="export">Export backup</button> <button data-action="reload">Reload</button>`;
  }
}
async function upload(source, scope) {
  const key = scope + ':' + source.id;
  if (uploaded.has(key)) return;
  if (!source.blob) throw new Error('Original file unavailable. Add it again.');
  const response = await requestResponse(apiBase(scope) + '/files/' + encodeURIComponent(source.id), {method:'PUT', headers:{'X-Prompt-Studio':'1','Content-Type':'application/octet-stream'}, body:source.blob}, {retry:true});
  if (!response.ok) throw new Error((await response.json()).error || 'File upload failed.');
  uploaded.add(key);
}
async function hydrateFiles(data, scope, previous = {sources:[]}) {
  for (const source of data.sources) {
    const cached = previous.sources.find(s => s.id === source.id)?.blob;
    if (cached) source.blob = cached;
    else {
      const response = await requestResponse(apiBase(scope) + '/files/' + encodeURIComponent(source.id));
      if (!response.ok) throw new Error('An original source file is unavailable.');
      source.blob = await response.blob();
    }
    uploaded.add(scope + ':' + source.id);
  }
  return data;
}
function persist() {
  clearTimeout(timer); timer = null;
  queue = queue.catch(() => {}).then(async () => {
    if (preview) {
      if (dirty.shared !== saved.shared) {
        const next = validateShared(shared), record = projectChanges(lastPreviewShared, next, {id:'preview',name:'Preview'}, ++revisions.shared);
        if (record) history.push(record);
        lastPreviewShared = structuredClone(next);
      }
      saved = {...dirty}; failed = false; status(); return true;
    }
    if (conflict) throw new Error('Reload the saved workspace before making more changes.');
    for (const scope of ['shared', 'personal']) {
      if (dirty[scope] === saved[scope]) continue;
      const count = dirty[scope], snapshot = structuredClone(workspace(scope));
      for (const source of snapshot.sources) await upload(source, scope);
      snapshot.sources = snapshot.sources.map(({blob, base64, ...source}) => source);
      if (draftRequests[scope]?.revision !== revisions[scope] || draftRequests[scope]?.count !== count) draftRequests[scope] = {revision:revisions[scope],count,requestId:crypto.randomUUID()};
      const result = await api(scope === 'shared' ? '/api/team' : '/api/workspace', {method:'PUT', headers, body:JSON.stringify({revision:revisions[scope],requestId:draftRequests[scope].requestId,workspace:snapshot})}, {retry:true});
      revisions[scope] = result.revision; saved[scope] = count;
      for (const source of workspace(scope).sources) if (result.sourcePaths?.[source.id]) source.agentPath = result.sourcePaths[source.id];
      if (scope === 'shared' && result.history) history = result.history;
    }
    failed = false; status(); return true;
  }).catch(error => {failed = true; status(); toast(error.message); return false;});
  return queue;
}
function download(name, blob) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function modal(title, body, wide = false) {
  const dialog = $('#dialog'); if (dialog.open) dialog.close();
  dialog.className = wide ? 'wide-dialog' : '';
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="Close dialog">${icon('close')}</button></div>${body}`;
  dialog.showModal();
}
const tabsFor = section => ({
 team:[['purpose','Purpose'],['owners','Owners'],['needs','Urgent tasks'],['challenges','Challenges'],['connection','Connection']],
 project:[['brief','Brief'],['performance','Performance'],['costs','Monitoring costs'],['files','Files'],['history','History']],
 profile:[['about','About you'],['priorities','Priorities'],...(DISCIPLINES.some(d => state.personal.needs[d.id].length) ? [['requests','Earlier requests']] : []),['notes','Your information'],['files','Files']],
 prompt:[['preview','Preview'],['changes','Changes'],['versions','Versions']]
}[section] || []);
async function navigate(next) {
  if (['prompt','project','team','profile'].includes(next)) {
    if (!await persist()) return;
    if (!preview && saved.shared === dirty.shared) {
      try {
        const count = dirty.shared, latest = await api('/api/team');
        const loaded = await hydrateFiles(validateShared(latest.workspace),'shared',shared);
        if (count === dirty.shared && count === saved.shared) {
          shared = loaded; history = latest.history; revisions.shared = latest.revision; applied.shared = latest.applied;
        }
      }
      catch (error) {failed = true; toast(error.message);}
    }
  }
  view = next; tab = tabsFor(next)[0]?.[0] || ''; render(); window.scrollTo({top:0,behavior:'instant'});
}
function field(f, values, group, scope = 'shared') {
  const id = group + '-' + f.id, value = values[f.id] ?? '', attrs = `id="${id}" data-group="${group}" data-key="${f.id}" data-scope="${scope}"`;
  const control = f.options ? `<select ${attrs}>${f.options.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : f.type === 'textarea' ? `<textarea ${attrs} rows="4" maxlength="20000" placeholder="${esc(f.placeholder || '')}">${esc(value)}</textarea>` : `<input ${attrs} ${f.type === 'number' ? 'type="number" min="0" step="any" inputmode="decimal"' : 'type="text"'} maxlength="300" value="${esc(value)}" placeholder="${esc(f.placeholder || '')}">`;
  const label = `<label for="${id}">${esc(f.label)}${f.unit || f.unitKey ? `<span class="field-unit">${esc(f.unit || values[f.unitKey])}</span>` : ''}</label>`;
  return `<div class="field ${f.type === 'textarea' ? 'wide' : ''}">${f.addCostCategory ? `<div class="cost-field-heading">${label}<button class="icon-button" data-action="add-cost-category" aria-label="Add other cost category" title="Add other cost category" ${shared.costCategories.length >= MAX_COST_CATEGORIES ? 'disabled' : ''}>${icon('plus')}</button></div>` : label}${control}</div>`;
}
const projectFields = ids => `<div class="form-grid">${ids.map(id => field(PROJECT_FIELDS.find(f => f.id === id), shared.project, 'project')).join('')}</div>`;
const teamFields = ids => `<div class="form-grid">${ids.map(id => field(TEAM_FIELDS.find(f => f.id === id), shared.team, 'team')).join('')}</div>`;
function sidebar() {
  return `<aside class="sidebar"><a class="brand" href="/" data-action="home" aria-label="Sonne home"><img class="brand-logo" src="/logo.png" alt="">Sonne</a><nav aria-label="Workspace navigation">${[['team','sun','Sonne & team'],['project','project','Project'],['profile','profile',profileTitle()]].map(([id,glyph,label]) => `<button class="nav-item ${view === id ? 'selected' : ''}" data-view="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></button>`).join('')}</nav><div class="sidebar-bottom"><button class="nav-item ${view === 'prompt' ? 'selected' : ''}" data-view="prompt">${icon('document')}<span>Review prompt</span></button><button class="prototype-link" data-action="account">${preview ? 'Leave preview' : 'Account & backup'}</button></div></aside>`;
}
function home() {
  return `<section class="home role-home"><div class="home-emblem" aria-hidden="true"><img src="/logo.png" alt=""></div><p class="eyebrow">Your team’s assistant</p><h1><button class="team-name-button" data-action="rename-team" title="Change team name">${esc(shared.team.name)}${icon('edit')}</button></h1><p>Choose your discipline to begin prompting</p><div class="role-grid">${DISCIPLINES.map(d => `<button class="role-card ${state.personal.discipline === d.id ? 'chosen' : ''}" data-role="${d.id}"><span class="role-avatar">${icon(d.icon)}</span><span>${esc(d.name)}</span></button>`).join('')}</div><button class="home-prompt-link" data-view="project">Open the project ${icon('arrow')}</button></section>`;
}
function teamNameDialog() {
  modal('Change team name',`<form id="team-name-form"><div class="field"><label for="team-name-input">Team name</label><input id="team-name-input" name="teamName" value="${esc(shared.team.name)}" maxlength="300" required></div><p class="help-text">${preview ? 'Preview changes stay in this tab.' : 'This name is shared with everyone on your team.'}</p><div class="dialog-tools"><button class="button secondary" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save name</button></div></form>`);
  $('#team-name-input').focus(); $('#team-name-input').select();
}
async function renameTeam(form) {
  const input = $('#team-name-input'), submit = $('button[type="submit"]', form);
  if (submit.disabled) return;
  const name = input.value.trim();
  input.setCustomValidity(name ? '' : 'Enter a team name.');
  if (!form.reportValidity()) return;
  submit.disabled = true;
  shared.team.name = name; changed('shared');
  if (await persist()) {
    $('#dialog').close(); render();
    toast(preview ? 'Team name updated in this preview.' : 'Team name saved for everyone.');
  } else submit.disabled = false;
}
function connection() {
  return `<div class="connection-list"><div><span>Server</span><strong>${esc(location.origin)}</strong></div><div><span>Prompt storage</span><strong>${preview ? 'Preview' : connected ? 'Connected' : 'Unavailable'}</strong></div><div><span>Discord sign-in</span><strong>${preview ? 'Preview' : oauthConfigured ? 'Configured' : 'Awaiting configuration'}</strong></div><div><span>Source repository</span><a href="https://github.com/Krabbens/sonne" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div></div><p class="help-text">The administrator manages server credentials in the Sonne installer. They are never included in a prompt.</p>`;
}
function teamPage() {
  if (tab === 'owners') return ownersPage();
  if (tab === 'needs') return informationPlan();
  return tab === 'connection' ? connection() : tab === 'challenges' ? teamFields(['tech','sustainability','ipd']) : teamFields(['name','character','tasks','deadlines','values']);
}
function ownersPage() {
  return `<p class="section-hint">One owner per discipline, separate from team members. Names, requirements and feedback save to Sonne’s memory and Project → History.</p><div class="owners-list">${OWNER_DISCIPLINES.map(d => {
    const owner = shared.owners[d.id];
    return `<section class="owner-row" aria-label="${esc(d.name)} owner"><div class="owner-identity"><label class="sr-only" for="owner-${d.id}-name">${esc(d.name)} owner’s name</label><input class="owner-name" id="owner-${d.id}-name" data-owner="${d.id}" data-owner-key="name" type="text" maxlength="300" autocomplete="off" placeholder="Name Surname" value="${esc(owner.name)}"><span class="owner-discipline">${esc(d.name)} owner</span></div><label class="sr-only" for="owner-${d.id}-feedback">${esc(d.name)} owner’s requirements and feedback</label><textarea class="owner-feedback" id="owner-${d.id}-feedback" data-owner="${d.id}" data-owner-key="feedback" rows="6" maxlength="20000" placeholder="Type in Owner's requirements and feedback">${esc(owner.feedback)}</textarea></section>`;
  }).join('')}</div>`;
}
const deliveryDate = value => new Date(value + 'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const priorityContext = () => view === 'profile' && tab === 'priorities' && role(state.personal.discipline) && role(priorityFolder) && priorityFolder !== state.personal.discipline ? {recipient:state.personal.discipline,provider:priorityFolder} : null;
function deliveryList(plan, folder = false) {
  return `<ol class="delivery-list" aria-label="${folder ? 'Discipline request' : 'Shared delivery'} priorities">${plan.map((item,i) => `<li draggable="true" data-delivery="${i}" class="${item.status === 'delivered' ? 'is-delivered' : ''}"><span class="delivery-rank">${i + 1}</span><div class="delivery-details"><div class="delivery-recipient"><strong>${folder ? item.type === 'action' ? 'Action' : 'Information' : esc(role(item.recipient).name)}</strong>${!folder ? `<span class="request-type">${item.type === 'action' ? 'Action' : 'Information'}</span>` : ''}<span class="delivery-status">${deliveryStatusLabel(item)}</span></div><p class="delivery-information">${esc(item.information)}</p><p class="delivery-task">Unlocks: ${esc(item.task)}</p><p class="delivery-meta">From ${esc(role(item.provider)?.name || 'To be agreed')}${item.neededBy ? ' · Needed by ' + deliveryDate(item.neededBy) : ' · Date to be agreed'}</p></div><div class="delivery-controls"><button class="icon-button" data-move-delivery="${i}" data-delta="-1" aria-label="Move request ${i + 1} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="icon-button" data-move-delivery="${i}" data-delta="1" aria-label="Move request ${i + 1} down" ${i === plan.length - 1 ? 'disabled' : ''}>${icon('down')}</button><button class="icon-button" data-edit-delivery="${item.id}" aria-label="Edit request ${i + 1}">${icon('edit')}</button><button class="icon-button" data-remove-delivery="${item.id}" aria-label="Remove request ${i + 1}">${icon('close')}</button></div></li>`).join('')}</ol>`;
}
function informationPlan() {
  const plan = shared.informationPlan, next = nextInformationDelivery(shared);
  return `<div class="delivery-heading"><p class="section-hint">Who needs input first? Order information and actions to unblock the team’s tasks. Drag or use the arrows.</p><button class="button secondary" data-action="add-delivery">${icon('plus')} Add request</button></div>${plan.length ? `<p class="delivery-next" role="status">${next ? `Next recipient: <strong>${esc(role(next.recipient).name)}</strong><span>${esc(next.information)} · ${deliveryStatusLabel(next)}</span>` : 'All listed requests are complete.'}</p>` : '<div class="empty-small">Add the information or action a discipline needs before its next task can start.</div>'}${deliveryList(plan)}<p class="help-text">Shared with your team and each discipline’s priority folders. The first unfinished request is next; completed requests are skipped. Apply the prompt so Sonne can use this order, deadlines and dependencies for pull planning.</p>`;
}
function disciplineFolders() {
  const recipient = role(state.personal.discipline);
  if (!recipient) return '<div class="empty-small">Choose your discipline in About you to open your priority folders.</div><button class="button secondary" data-tab="about">Choose your discipline</button>';
  const providers = DISCIPLINES.filter(d => d.id !== recipient.id), selected = providers.find(d => d.id === priorityFolder);
  const folders = `<div class="priority-folders" aria-label="Requests from other disciplines">${providers.map(d => {
    const requests = disciplinePriorities(shared,recipient.id,d.id), open = requests.filter(item => item.status !== 'delivered').length;
    return `<button class="priority-folder ${selected?.id === d.id ? 'selected' : ''}" data-priority-folder="${d.id}" aria-pressed="${selected?.id === d.id}"><span class="folder-symbol">${icon('project')}</span><span class="folder-title">${esc(d.name)}</span><span class="folder-count">${requests.length ? `${open} open · ${requests.length} total` : 'No requests yet'}</span>${icon('arrow')}</button>`;
  }).join('')}</div>`;
  const link = '<button class="text-button" data-action="team-plan">View the team’s pull plan ' + icon('arrow') + '</button>';
  const intro = '<p class="section-hint">Set priorities for the information and actions your discipline needs from each of the others.</p>';
  if (!selected) return intro + folders + '<div class="empty-small">Open a folder to add requests and put the most important first.</div>' + link;
  const requests = disciplinePriorities(shared,recipient.id,selected.id), next = requests.find(item => item.status !== 'delivered');
  return intro + folders + `<section class="priority-folder-content" aria-labelledby="priority-folder-title"><div class="delivery-heading"><div class="folder-heading"><h2 id="priority-folder-title">From ${esc(selected.name)}</h2><p class="section-hint">For ${esc(recipient.name)}. Highest priority first. Drag or use the arrows.</p></div><button class="button secondary" data-action="add-delivery">${icon('plus')} Add request</button></div>${requests.length ? `<p class="delivery-next" role="status">${next ? `Next needed: <strong>${esc(next.type === 'action' ? 'Action' : 'Information')}</strong><span>${esc(next.information)} · ${deliveryStatusLabel(next)}</span>` : 'All requests in this folder are complete.'}</p>` : '<div class="empty-small">Add information or an action you need from this discipline, and the task it unlocks.</div>'}${deliveryList(requests,true)}<p class="help-text">These requests are shared with the team. Folder ordering updates the same requests in the team’s pull plan. Apply the prompt so Sonne can plan around the priorities, deadlines and blocked tasks.</p>${link}</section>`;
}
function deliveryDialog(id) {
  if (!id && shared.informationPlan.length >= MAX_DELIVERIES) return toast('The shared plan supports up to 30 requests across all discipline folders.');
  const context = priorityContext();
  const item = id ? shared.informationPlan.find(item => item.id === id) : {id:crypto.randomUUID(),type:'information',information:'',recipient:context?.recipient || state.personal.discipline || 'architecture',provider:context?.provider || '',task:'',neededBy:'',status:'awaiting'};
  if (!item) return;
  const disciplines = selected => DISCIPLINES.map(d => `<option value="${d.id}" ${selected === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  modal(id ? 'Edit request' : 'Add request',`<form id="delivery-form" data-delivery-id="${item.id}" ${context ? `data-folder-recipient="${context.recipient}" data-folder-provider="${context.provider}"` : ''}><div class="form-grid"><div class="field"><label for="delivery-type">Request type</label><select id="delivery-type" name="type">${REQUEST_TYPES.map(t => `<option value="${t.id}" ${t.id === (item.type || 'information') ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div><div class="field"><label for="delivery-status">Status</label><select id="delivery-status" name="status">${DELIVERY_STATUSES.map(s => `<option value="${s.id}" ${s.id === item.status ? 'selected' : ''}>${deliveryStatusLabel({...item,status:s.id})}</option>`).join('')}</select></div><div class="field wide"><label for="delivery-information">${item.type === 'action' ? 'Action needed' : 'Information needed'}</label><input id="delivery-information" name="information" value="${esc(item.information)}" maxlength="300" placeholder="${item.type === 'action' ? 'e.g. Confirm the structural grid' : 'e.g. Final structural grid'}" required></div><div class="field"><label for="delivery-recipient">Recipient</label><select id="delivery-recipient" name="recipient" required ${context ? 'disabled' : ''}>${disciplines(item.recipient)}</select></div><div class="field"><label for="delivery-provider">Provided by</label><select id="delivery-provider" name="provider" ${context ? 'disabled' : ''}><option value="">To be agreed</option>${disciplines(item.provider)}</select></div><div class="field wide"><label for="delivery-task">Task this unlocks</label><input id="delivery-task" name="task" value="${esc(item.task)}" maxlength="300" placeholder="e.g. Coordinate service routes" required></div><div class="field"><label for="delivery-date">Needed by (optional)</label><input id="delivery-date" name="neededBy" type="date" value="${esc(item.neededBy)}"></div></div><p class="help-text">Shared with your team${context ? ' in this discipline folder and the team’s pull plan' : ''}.</p><div class="dialog-tools"><button class="button secondary" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save request</button></div></form>`);
  $('#delivery-information').focus();
}
async function saveDelivery(form) {
  const submit = $('button[type="submit"]',form); if (submit.disabled || !form.reportValidity()) return;
  const item = {id:form.dataset.deliveryId,...Object.fromEntries([...new FormData(form)].map(([key,value]) => [key,String(value).trim()]))};
  if (form.dataset.folderRecipient) {item.recipient = form.dataset.folderRecipient; item.provider = form.dataset.folderProvider;}
  const plan = [...shared.informationPlan], index = plan.findIndex(old => old.id === item.id);
  if (index < 0) plan.push(item); else plan[index] = item;
  try {shared.informationPlan = validateShared({...shared,informationPlan:plan}).informationPlan;} catch (error) {toast(error.message); return;}
  submit.disabled = true; changed('shared');
  if (await persist()) {$('#dialog').close(); render(); toast(preview ? 'Request updated in this preview.' : 'Shared request saved.');}
  else submit.disabled = false;
}
function moveDelivery(from,to) {
  const context = priorityContext();
  if (context) {
    if (moveDisciplinePriority(shared,context.recipient,context.provider,from,to)) {changed('shared'); render();}
    return;
  }
  const plan = shared.informationPlan;
  if (from < 0 || to < 0 || from >= plan.length || to >= plan.length || from === to) return;
  plan.splice(to,0,plan.splice(from,1)[0]); changed('shared'); render();
}
function removeDelivery(id) {
  const item = shared.informationPlan.find(item => item.id === id); if (!item) return;
  modal('Remove request?',`<p>${esc(item.information)}</p><div class="dialog-tools"><button class="button secondary" data-action="close">Cancel</button><button class="button primary" id="confirm-remove-delivery">Remove request</button></div>`);
  $('#confirm-remove-delivery').onclick = async () => {shared.informationPlan = shared.informationPlan.filter(item => item.id !== id); changed('shared'); if (await persist()) {$('#dialog').close(); render();}};
}
function costTotalText() {
  return shared.project.currency + ' ' + totalProjectCosts(shared).toLocaleString('en-GB',{maximumFractionDigits:2});
}
function updateCostTotal() {
  if ($('#cost-total')) $('#cost-total').textContent = costTotalText();
}
function costsPage() {
  const ids = ['currency','costStructure','costInteriors','costFinishes','costServices','costOther'];
  const fields = ids.map(id => field({...PROJECT_FIELDS.find(f => f.id === id), ...(id === 'costOther' ? {addCostCategory:true,placeholder:'Uncategorised amount'} : {})}, shared.project, 'project')).join('');
  const categories = shared.costCategories.map(c => `<div class="field"><div class="cost-field-heading"><label for="cost-category-${c.id}">${esc(c.name)}<span class="field-unit">${esc(shared.project.currency)}</span></label><span class="cost-category-actions"><button class="icon-button" data-edit-cost-category="${c.id}" aria-label="Edit ${esc(c.name)} category">${icon('edit')}</button><button class="icon-button" data-remove-cost-category="${c.id}" aria-label="Remove ${esc(c.name)} category">${icon('close')}</button></span></div><input id="cost-category-${c.id}" data-cost-category="${c.id}" type="number" min="0" max="1000000000000000" step="any" inputmode="decimal" value="${esc(c.amount)}" placeholder="Amount"></div>`).join('');
  return `<div class="form-grid cost-fields">${fields}</div><p class="help-text">Use + beside Other costs to add a category. Added categories are counted separately from the uncategorised amount.</p>${categories ? `<section class="cost-categories" aria-label="Other cost categories"><h2>Other cost categories</h2><div class="form-grid cost-fields">${categories}</div></section>` : ''}<p class="cost-total">Total of entered costs <strong id="cost-total">${esc(costTotalText())}</strong></p>`;
}
function costCategoryDialog(id) {
  if (!id && shared.costCategories.length >= MAX_COST_CATEGORIES) return toast('Maximum 30 other cost categories.');
  const category = id ? shared.costCategories.find(c => c.id === id) : {id:crypto.randomUUID(),name:'',amount:''};
  if (!category) return;
  modal(id ? 'Edit cost category' : 'Add cost category',`<form id="cost-category-form" data-category-id="${category.id}"><div class="form-grid"><div class="field wide"><label for="cost-category-name">Category name</label><input id="cost-category-name" name="name" value="${esc(category.name)}" maxlength="100" placeholder="e.g. Transport" required></div><div class="field wide"><label for="cost-category-amount">Amount<span class="field-unit">${esc(shared.project.currency)}</span></label><input id="cost-category-amount" name="amount" type="number" min="0" max="1000000000000000" step="any" inputmode="decimal" value="${esc(category.amount)}" placeholder="Optional amount"></div></div><div class="dialog-tools"><button class="button secondary" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save category</button></div></form>`);
  $('#cost-category-name').focus();
}
async function saveCostCategory(form) {
  const submit = $('button[type="submit"]',form);
  if (submit.disabled || !form.reportValidity()) return;
  const category = {id:form.dataset.categoryId,name:$('#cost-category-name').value.trim(),amount:$('#cost-category-amount').value};
  const categories = [...shared.costCategories], index = categories.findIndex(c => c.id === category.id);
  if (index < 0) categories.push(category); else categories[index] = category;
  try {shared.costCategories = validateShared({...shared,costCategories:categories}).costCategories;} catch (error) {toast(error.message); return;}
  submit.disabled = true; changed('shared');
  if (await persist()) {$('#dialog').close(); render(); toast(preview ? 'Cost category updated in this preview.' : 'Cost category saved.');}
  else submit.disabled = false;
}
function removeCostCategory(id) {
  const category = shared.costCategories.find(c => c.id === id); if (!category) return;
  modal('Remove cost category?',`<p>${esc(category.name)} will be removed from the current costs. Its earlier values remain in History.</p><div class="dialog-tools"><button class="button secondary" data-action="close">Cancel</button><button class="button primary" id="confirm-remove-cost-category">Remove category</button></div>`);
  $('#confirm-remove-cost-category').onclick = async () => {shared.costCategories = shared.costCategories.filter(c => c.id !== id); changed('shared'); if (await persist()) {$('#dialog').close(); render();}};
}
function projectPage() {
  if (tab === 'files') return files('shared');
  if (tab === 'history') return projectHistory();
  if (tab === 'costs') return costsPage();
  if (tab === 'performance') return projectFields(['carbon','carbonUnit','energy','energyUnit','solarGain','solarUnit']);
  return projectFields(['name','stage','overview','location','area','volume','constructionTime','timeUnit','other']);
}
function informationNeeds() {
  const list = state.personal.needs[need];
  return `<p class="section-hint">Your earlier private requests are preserved here. Set the team’s delivery order in Sonne & team → Urgent tasks.</p><label class="need-select"><span>Information I need from</span><select id="need-discipline">${DISCIPLINES.map(d => `<option value="${d.id}" ${d.id === need ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label><p class="section-hint">Highest priority for you first. Drag or use the arrows.</p><ol class="priority-list" aria-label="Personal information priorities">${list.map((text,i) => `<li draggable="true" data-priority="${i}"><span class="drag-handle">${icon('grip')}</span><span class="priority-number">${i + 1}</span><input class="priority-edit" aria-label="Priority ${i + 1}" data-priority-text="${i}" maxlength="300" value="${esc(text)}"><div class="priority-controls"><button class="icon-button" data-move="${i}" data-delta="-1" aria-label="Move priority ${i + 1} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="icon-button" data-move="${i}" data-delta="1" aria-label="Move priority ${i + 1} down" ${i === list.length - 1 ? 'disabled' : ''}>${icon('down')}</button><button class="icon-button" data-remove-priority="${i}" aria-label="Remove priority ${i + 1}">${icon('close')}</button></div></li>`).join('')}</ol><form id="priority-form" class="add-priority"><label class="sr-only" for="new-priority">New information priority</label><input id="new-priority" name="priority" maxlength="300" placeholder="Add an information request" required><button class="icon-button add" aria-label="Add priority">${icon('plus')}</button></form>${!list.length ? '<button class="text-button" data-action="starter">Use a starter list</button><p class="help-text">Starter suggestions are editable examples. Your team’s survey lists can replace them.</p>' : ''}`;
}
function personalPage() {
  if (tab === 'files') return files('personal');
  if (tab === 'priorities') return disciplineFolders();
  if (tab === 'requests') return informationNeeds();
  if (tab === 'notes') return `<p class="section-hint">Add information from your discipline as separate notes.</p><div class="note-list">${state.personal.notes.map(n => `<article class="discipline-note"><div class="note-heading"><input aria-label="Note title" data-note="${n.id}" data-note-key="title" maxlength="200" placeholder="Note title" value="${esc(n.title)}"><button class="icon-button" data-remove-note="${n.id}" aria-label="Remove note ${esc(n.title || 'Untitled')}">${icon('close')}</button></div><textarea aria-label="Note text" data-note="${n.id}" data-note-key="text" maxlength="20000" rows="4" placeholder="What should Sonne know?">${esc(n.text)}</textarea></article>`).join('')}</div><button class="button secondary" data-action="add-note">${icon('plus')} Add a note</button>${hasLegacy() ? '<button class="text-button legacy-link" data-action="legacy">Review earlier discipline brief</button>' : ''}`;
  return `<div class="form-grid"><div class="field wide"><label for="my-discipline">Your discipline</label><select id="my-discipline"><option value="">Choose your discipline</option>${DISCIPLINES.map(d => `<option value="${d.id}" ${state.personal.discipline === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>${[['introduction','Introduce yourself','Your role, experience and responsibilities.'],['goals','Your goals in the project','What do you want to achieve?'],['values','Your values','What should guide decisions in your work?']].map(([id,label,placeholder]) => field({id,label,placeholder,type:'textarea'},state.personal,'personal','personal')).join('')}</div>`;
}
const hasLegacy = () => DISCIPLINES.some(d => Object.values(state.disciplines[d.id].values).some(Boolean) || state.disciplines[d.id].priorities.length || state.disciplines[d.id].topics.length) || state.project.overview || state.project.name !== 'Untitled project';
function files(scope) {
  const sources = workspace(scope).sources;
  return `<div class="upload-area" id="drop-zone" data-scope="${scope}"><span>Drop files here or</span><label class="button secondary" for="source-upload">${icon('plus')} Add files</label><input class="sr-only" type="file" id="source-upload" multiple data-scope="${scope}" aria-label="Upload ${scope === 'shared' ? 'project' : 'discipline'} files"></div><p class="file-info">PDF, Excel, images and text. Up to 20 files, 10 MB each, 30 MB total.</p><div class="source-cards">${sources.length ? sources.map(s => `<article class="source-card"><span class="source-file-icon">${icon('document')}</span><button class="source-open" data-file="${s.id}" data-scope="${scope}"><strong>${esc(s.name)}</strong><small>${esc(s.category)} · ${fileSize(s.size)}</small>${s.note ? `<span class="source-description">${esc(s.note)}</span>` : ''}</button><button class="icon-button" data-remove-file="${s.id}" data-scope="${scope}" aria-label="Remove ${esc(s.name)}">${icon('close')}</button></article>`).join('') : '<div class="empty-small">Add a room schedule, site plan or other reference.</div>'}</div>`;
}
function historyFields() {
  const fields = new Map(PROJECT_FIELDS.filter(f => f.type === 'number').map(f => [f.id,f]));
  for (const record of history) for (const [id, value] of Object.entries(record.metrics || {})) if (id.startsWith('costCategory:') && value.label) fields.set(id,{id,label:value.label});
  for (const c of shared.costCategories) fields.set('costCategory:' + c.id,{id:'costCategory:' + c.id,label:'Other costs · ' + c.name});
  return [...fields.values()];
}
function chart() {
  const points = history.filter(r => r.metrics?.[metric]?.value !== '' && Number.isFinite(+r.metrics?.[metric]?.value));
  const unit = points.at(-1)?.metrics[metric].unit || '', matching = points.filter(r => r.metrics[metric].unit === unit);
  if (!matching.length) return '<div class="empty-small">Changes to this value will appear here.</div>';
  const values = matching.map(r => +r.metrics[metric].value), min = Math.min(...values), max = Math.max(...values), span = max - min || Math.max(max,1);
  const xy = values.map((v,i) => [35 + i * 550 / Math.max(1,values.length - 1), 155 - (v - min) * 110 / span]);
  const label = historyFields().find(f => f.id === metric)?.label || metric;
  return `<figure class="history-chart"><figcaption>${esc(label)} · ${esc(unit)}</figcaption><svg viewBox="0 0 620 185" role="img" aria-label="${esc(label)} over ${matching.length} recorded updates in ${esc(unit)}"><path d="M35 160H585" stroke="#e1dbc9"/><polyline points="${xy.map(p => p.join(',')).join(' ')}" fill="none" stroke="#5e4b3b" stroke-width="2"/>${xy.map(([x,y],i) => `<circle cx="${x}" cy="${y}" r="3" fill="#5e4b3b"><title>${esc(date(matching[i].at))}: ${values[i]} ${esc(unit)}</title></circle>`).join('')}<text x="35" y="22">${esc(max.toLocaleString('en-GB'))}</text><text x="35" y="179">${esc(date(matching[0].at))}</text><text x="585" y="179" text-anchor="end">${esc(date(matching.at(-1).at))}</text></svg></figure>`;
}
function projectHistory() {
  return `<div class="history-tools"><label><span class="sr-only">Value to chart</span><select id="history-metric">${historyFields().map(f => `<option value="${f.id}" ${metric === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></label><button class="button secondary" data-action="history-export">Export CSV</button></div>${chart()}<p class="help-text">Each saved project change records its date, author and values. Charts keep different units and currencies separate.</p><div class="history-records">${history.slice(-30).reverse().map(r => `<article><div><strong>${esc(date(r.at))}</strong><span>${esc(r.by.name)}</span></div><p>${r.changes.map(c => `${esc(c.label)}: ${esc(c.before || '—')}${c.before && c.beforeUnit ? ' ' + esc(c.beforeUnit) : ''} → ${esc(c.after || '—')}${c.after && c.unit ? ' ' + esc(c.unit) : ''}`).join('<br>')}</p></article>`).join('') || '<div class="empty-small">No project changes yet.</div>'}</div>${history.length > 30 ? '<p class="help-text">Showing the latest 30 updates. CSV includes the full history.</p>' : ''}`;
}
function promptPage() {
  const text = compileWorkspacePrompt(state,shared,profile), latest = state.versions.at(-1);
  if (tab === 'versions') return `<div class="version-list">${state.versions.slice().reverse().map(v => `<article class="version-card"><button class="version-open" data-version="${v.id}"><strong>${esc(v.title)}</strong><small>${esc(date(v.createdAt))}</small></button></article>`).join('') || '<div class="empty-small">Applying your profile creates a saved version.</div>'}</div>`;
  if (tab === 'changes') return latest ? `<div class="diff-view">${compareLines(latest.prompt,text).map(l => `<div class="diff-line ${l.type}"><span>${l.type === 'added' ? '+' : l.type === 'removed' ? '−' : ' '}</span><code>${esc(l.text)}</code></div>`).join('')}</div>` : '<div class="empty-small">Apply your profile to create the first comparison.</div>';
  return `<pre class="prompt-text" tabindex="0">${esc(text)}</pre><p class="help-text">Apply the team instructions, project brief and your personal brief. Owners, performance, costs, project files and history save to Sonne’s memory automatically. ${applied.personal ? 'Your profile was last applied ' + esc(date(applied.personal.at)) + '.' : ''}</p>`;
}
function page() {
  const titles = {team:'Sonne & team', project:'Project', profile:profileTitle(), prompt:'Review prompt'};
  const descriptions = {team:'Shared goals and information priorities for your team.',project:'One project brief, shared by the team.',profile:'Your perspective, priorities and discipline information.',prompt:'Shared context and your personal brief.'};
  const tabs = tabsFor(view);
  const memorySection = (view === 'project' && tab !== 'brief') || (view === 'team' && tab === 'owners');
  const saveHint = preview ? 'Changes stay in this tab.' : memorySection ? connected ? 'Saved to Sonne’s memory as you edit.' : 'Sonne’s memory is unavailable.' : 'Drafts save as you edit.';
  return `<section class="studio-page"><div class="page-heading"><div><h1>${titles[view]}</h1><p class="page-description">${descriptions[view]}</p></div>${view === 'prompt' ? `<div class="page-actions"><button class="button secondary" data-action="copy">Copy</button><button id="apply-prompt" class="button primary" data-action="apply" ${preview || !connected ? 'disabled' : ''}>Apply to Sonne ${icon('arrow')}</button></div>` : ''}</div><div class="tabs" role="tablist" aria-label="${titles[view]} sections">${tabs.map(([id,label]) => `<button class="tab ${tab === id ? 'active' : ''}" role="tab" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}" data-tab="${id}">${label}</button>`).join('')}</div><div class="studio-content" role="tabpanel">${view === 'team' ? teamPage() : view === 'project' ? projectPage() : view === 'profile' ? personalPage() : promptPage()}</div>${view !== 'prompt' ? '<div class="editor-footer"><span class="section-hint">' + saveHint + '</span>' + (memorySection ? '' : '<button class="button primary" data-view="prompt">Review prompt ' + icon('arrow') + '</button>') + '</div>' : ''}</section>`;
}
function render() {
  $('#app').innerHTML = `<div class="app-frame">${sidebar()}<div class="main-shell"><header class="topbar"><button class="project-name" data-view="project">${esc(shared.project.name)}</button><button class="profile-name" data-action="account">${esc(preview ? 'Preview' : profile?.name || 'Account')}</button><span class="saved" id="save-status" role="status"></span></header><main id="main" tabindex="-1">${preview ? '<p class="preview-notice">Preview — changes stay in this tab. <a href="/">Back to sign in</a></p>' : ''}<div id="storage-notice" class="storage-notice hidden"></div>${view === 'home' ? home() : page()}</main></div></div>`;
  status();
}
function move(from,to) {
  const list = state.personal.needs[need];
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
  list.splice(to,0,list.splice(from,1)[0]); changed('personal'); render();
}
async function addFiles(fileList,scope) {
  const files = [...fileList], data = workspace(scope);
  if (files.some(f => f.size > MAX_FILE)) return toast('A file exceeds 10 MB.');
  if (data.sources.length + files.length > MAX_SOURCES || data.sources.reduce((n,s) => n + s.size,0) + files.reduce((n,f) => n + f.size,0) > MAX_TOTAL) return toast('File allowance exceeded: 20 files and 30 MB per section.');
  try {
    const added = await Promise.all(files.map(async file => {
      const text = /\.(txt|md|markdown|csv|json)$/i.test(file.name) ? await file.text() : null;
      return {id:crypto.randomUUID(), name:file.name, size:file.size, type:file.type, discipline:scope === 'shared' ? 'project' : state.personal.discipline || 'architecture', category:scope === 'shared' ? 'Project information' : 'Discipline information', note:'', text:text === null ? null : text.slice(0,TEXT_LIMIT), truncated:text !== null && text.length > TEXT_LIMIT, blob:file.slice()};
    }));
    if (data !== workspace(scope)) return toast('The workspace changed during upload. Add the files again.');
    data.sources.push(...added); changed(scope);
    const ok = await persist(); render(); if (ok) toast('Files added. Open a file to add its description.');
  } catch (error) {toast(error.message || 'A file could not be read.');}
}
function fileDialog(id,scope) {
  const source = workspace(scope).sources.find(s => s.id === id);
  if (!source) return;
  modal(source.name,`<div class="field"><label for="file-category">Category</label><select id="file-category" data-source-key="category" data-source-id="${id}" data-scope="${scope}">${SOURCE_CATEGORIES.map(c => `<option ${source.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div><div class="field spaced"><label for="file-description">Description and relevance</label><textarea id="file-description" data-source-key="note" data-source-id="${id}" data-scope="${scope}" maxlength="2000" rows="4" placeholder="What does this file contain? How should Sonne use it?">${esc(source.note)}</textarea></div>${source.text !== null ? `<pre class="source-text">${esc(source.text)}</pre>` : '<p class="help-text">Original file stored as a reference. No text has been extracted.</p>'}<button class="button secondary spaced" data-download-file="${id}" data-scope="${scope}">Download original</button>`,true);
}
async function exportBackup() {
  const encode = async input => {
    const data = structuredClone(input);
    for (const s of data.sources) {
      if (!s.blob) throw new Error('An original file is unavailable.');
      const bytes = new Uint8Array(await s.blob.arrayBuffer()); let binary = '';
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i,i + 32768));
      s.base64 = btoa(binary); delete s.blob;
    }
    return data;
  };
  try {download('sonne-workspace-backup.json',new Blob([JSON.stringify({format:'sonne-workspace',version:2,personal:await encode(state),shared:await encode(shared),history},null,2)],{type:'application/json'})); toast('Backup exported with both scopes, history and original files.');}
  catch (error) {toast(error.message);}
}
async function importPersonal(file) {
  try {
    if (file.size > 90 * 1024 * 1024) throw new Error('The backup is too large.');
    const input = JSON.parse(await file.text()), restored = validateProject(input.personal || input);
    for (const s of restored.sources) {
      if (typeof s.base64 !== 'string' || s.base64.length > Math.ceil(MAX_FILE / 3) * 4) throw new Error('An attached file is invalid.');
      const bytes = Uint8Array.from(atob(s.base64),c => c.charCodeAt(0));
      if (bytes.length !== s.size) throw new Error('An attached file is incomplete.');
      s.blob = new Blob([bytes],{type:s.type}); s.id = crypto.randomUUID(); delete s.base64; delete s.agentPath;
    }
    modal('Replace your personal brief?', '<p>This imports the personal profile and its files. Shared team and project information will stay as it is. Export a backup first if needed.</p><div class="dialog-tools"><button class="button secondary" data-action="export">Export backup</button><button class="button primary" id="confirm-import">Replace my brief</button></div>');
    $('#confirm-import').onclick = async () => {state = restored; changed('personal'); if (await persist()) {$('#dialog').close(); view = 'profile'; tab = 'about'; render(); toast('Personal brief imported.');}};
  } catch (error) {toast(error.message || 'Invalid backup.');}
}
async function applyPrompt() {
  if (preview || !connected) return;
  if (!await persist()) return;
  if ([compileTeamPrompt(shared),compilePersonalPrompt(state,profile)].some(text => text.length > 40000)) return toast('A brief exceeds 40,000 characters. Shorten the team context or personal information before applying.');
  let teamApplied = applied.shared?.revision === revisions.shared;
  const button = $('#apply-prompt'); if (button) {button.disabled = true; button.textContent = 'Applying…';}
  try {
    const operation = scope => {
      if (publicationRequests[scope]?.revision !== revisions[scope]) publicationRequests[scope] = {revision:revisions[scope],requestId:crypto.randomUUID()};
      return publicationRequests[scope];
    };
    if (!teamApplied) {
      const team = await api('/api/team/apply',{method:'POST',headers,body:JSON.stringify(operation('shared'))},{retry:true});
      revisions.shared = team.revision; applied.shared = team.applied; teamApplied = true;
    }
    const result = await api('/api/apply',{method:'POST',headers,body:JSON.stringify(operation('personal'))},{retry:true});
    revisions.personal = result.revision; applied.personal = result.applied; state.versions = result.workspace.versions;
    render(); toast('Team context and your personal brief applied. Sonne will load them on the next Discord request.');
  } catch (error) {render(); toast((teamApplied ? 'Team context was applied. Your personal brief could not be applied: ' : '') + error.message);}
}
function account() {
  if (preview) return location.assign('/');
  modal('Your account',`<p>${esc(profile?.name)}<br><span class="help-text">Discord ID: ${esc(profile?.id)}</span></p><div class="dialog-tools"><button class="button secondary" data-action="export">Export backup</button><label class="button secondary" for="import-profile">Import profile</label><input id="import-profile" type="file" accept=".json,application/json" class="sr-only" aria-label="Import personal profile"></div><p class="help-text">A backup includes shared data, your profile and original files. Profile import replaces only your personal brief.</p><button class="button secondary full spaced" data-action="sign-out">Sign out</button>`);
}
document.addEventListener('click',async event => {
  const button = event.target.closest('button,a[data-action]'); if (!button) return;
  if (button.dataset.view) return navigate(button.dataset.view);
  if (button.dataset.role) {state.personal.discipline = button.dataset.role; changed('personal'); return navigate('profile');}
  if (button.dataset.tab) {await persist(); tab = button.dataset.tab; render(); return;}
  if (button.dataset.priorityFolder !== undefined) {if (!await persist()) return; priorityFolder = button.dataset.priorityFolder; render(); return;}
  if (button.dataset.moveDelivery !== undefined) return moveDelivery(+button.dataset.moveDelivery,+button.dataset.moveDelivery + +button.dataset.delta);
  if (button.dataset.editDelivery) return deliveryDialog(button.dataset.editDelivery);
  if (button.dataset.removeDelivery) return removeDelivery(button.dataset.removeDelivery);
  if (button.dataset.editCostCategory) return costCategoryDialog(button.dataset.editCostCategory);
  if (button.dataset.removeCostCategory) return removeCostCategory(button.dataset.removeCostCategory);
  if (button.dataset.move !== undefined) return move(+button.dataset.move,+button.dataset.move + +button.dataset.delta);
  if (button.dataset.removePriority !== undefined) {state.personal.needs[need].splice(+button.dataset.removePriority,1); changed('personal'); render(); return;}
  if (button.dataset.file) return fileDialog(button.dataset.file,button.dataset.scope);
  if (button.dataset.downloadFile) {const s = workspace(button.dataset.scope).sources.find(s => s.id === button.dataset.downloadFile); if (s?.blob) download(s.name,s.blob); return;}
  if (button.dataset.removeFile) {
    const scope = button.dataset.scope, source = workspace(scope).sources.find(s => s.id === button.dataset.removeFile);
    modal('Remove this file?',`<p>${esc(source.name)} will be removed from the current brief. Earlier prompt snapshots keep their text references.</p><button class="button primary" id="confirm-remove">Remove file</button>`);
    $('#confirm-remove').onclick = async () => {workspace(scope).sources = workspace(scope).sources.filter(s => s.id !== source.id); changed(scope); await persist(); $('#dialog').close(); render();}; return;
  }
  if (button.dataset.removeNote) {state.personal.notes = state.personal.notes.filter(n => n.id !== button.dataset.removeNote); changed('personal'); render(); return;}
  if (button.dataset.version) {const v = state.versions.find(v => v.id === button.dataset.version); modal(v.title,`<pre class="source-text">${esc(v.prompt)}</pre>`,true); return;}
  switch (button.dataset.action) {
    case 'home': event.preventDefault(); return navigate('home');
    case 'rename-team': return teamNameDialog();
    case 'add-delivery': return deliveryDialog();
    case 'add-cost-category': return costCategoryDialog();
    case 'team-plan': await navigate('team'); if (view === 'team') {tab = 'needs'; render();} return;
    case 'close': $('#dialog').close(); render(); return;
    case 'account': return account();
    case 'starter': state.personal.needs[need] = [...INFORMATION_STARTERS[need]]; changed('personal'); render(); return;
    case 'add-note': if (state.personal.notes.length >= 30) return toast('Maximum 30 notes.'); state.personal.notes.push({id:crypto.randomUUID(),title:'',text:''}); changed('personal'); render(); $('.discipline-note:last-child input')?.focus(); return;
    case 'legacy': modal('Earlier discipline brief',`<pre class="source-text">${esc(compilePrompt(state))}</pre>`,true); return;
    case 'copy': try {await navigator.clipboard.writeText(compileWorkspacePrompt(state,shared,profile)); toast('Prompt copied.');} catch {download('PROMPT',new Blob([compileWorkspacePrompt(state,shared,profile)],{type:'text/plain'}));} return;
    case 'apply': return applyPrompt();
    case 'export': return exportBackup();
    case 'history-export': if (preview) download('sonne-project-history.csv',new Blob([historyCSV(history)],{type:'text/csv;charset=utf-8'})); else {const link = document.createElement('a'); link.href = '/api/team/history.csv'; link.download = 'sonne-project-history.csv'; link.click();} return;
    case 'reload': modal('Reload saved data?','<p>Unsaved changes will be replaced. Export a backup first if needed.</p><button class="button primary" id="confirm-reload">Reload saved data</button>'); $('#confirm-reload').onclick = () => location.reload(); return;
    case 'sign-out': if (!await persist()) return; try {await api('/api/logout',{method:'POST',headers}); location.reload();} catch (error) {toast(error.message);} return;
  }
});
function edit(event) {
  const el = event.target;
  if (el.id === 'team-name-input') el.setCustomValidity('');
  if (el.dataset.group) {
    const values = el.dataset.group === 'personal' ? state.personal : shared[el.dataset.group];
    values[el.dataset.key] = el.value; changed(el.dataset.scope);
    updateCostTotal();
  } else if (el.dataset.costCategory) {
    const category = shared.costCategories.find(c => c.id === el.dataset.costCategory); category.amount = el.value; changed('shared'); updateCostTotal();
  } else if (el.dataset.owner) {
    shared.owners[el.dataset.owner][el.dataset.ownerKey] = el.value; changed('shared');
  } else if (el.dataset.priorityText !== undefined) {
    if (!el.value.trim()) return; state.personal.needs[need][+el.dataset.priorityText] = el.value; changed('personal');
  } else if (el.dataset.note) {
    const note = state.personal.notes.find(n => n.id === el.dataset.note); note[el.dataset.noteKey] = el.value; changed('personal');
  } else if (el.dataset.sourceKey) {
    const source = workspace(el.dataset.scope).sources.find(s => s.id === el.dataset.sourceId); source[el.dataset.sourceKey] = el.value; changed(el.dataset.scope);
  }
}
document.addEventListener('input',edit);
document.addEventListener('focusout',event => {
  const el = event.target;
  if (el.dataset.priorityText !== undefined && !el.value.trim()) {
    el.value = state.personal.needs[need][+el.dataset.priorityText];
    toast('Use the remove button to delete an information need.');
  }
});
document.addEventListener('change',event => {
  const el = event.target;
  if (el.id === 'my-discipline') {state.personal.discipline = el.value; changed('personal'); render(); $('#my-discipline').focus();}
  else if (el.id === 'need-discipline') {need = el.value; render();}
  else if (el.id === 'delivery-type') {
    const action = el.value === 'action';
    $('label[for="delivery-information"]').textContent = action ? 'Action needed' : 'Information needed';
    $('#delivery-information').placeholder = action ? 'e.g. Confirm the structural grid' : 'e.g. Final structural grid';
    for (const option of $('#delivery-status').options) option.textContent = deliveryStatusLabel({type:el.value,status:option.value});
  }
  else if (el.id === 'history-metric') {metric = el.value; render();}
  else if (el.id === 'source-upload') {addFiles(el.files,el.dataset.scope); el.value = '';}
  else if (el.id === 'import-profile' && el.files[0]) {importPersonal(el.files[0]); el.value = '';}
  else if (el.matches('select[data-group],select[data-source-key]')) {edit(event); if (el.dataset.key?.endsWith('Unit') || el.dataset.key === 'currency') render();}
});
document.addEventListener('submit',event => {
  event.preventDefault();
  if (event.target.id === 'team-name-form') {renameTeam(event.target); return;}
  if (event.target.id === 'delivery-form') {saveDelivery(event.target); return;}
  if (event.target.id === 'cost-category-form') {saveCostCategory(event.target); return;}
  if (event.target.id !== 'priority-form') return;
  const text = String(new FormData(event.target).get('priority')).trim(), list = state.personal.needs[need];
  if (!text) return; if (list.length >= 30) return toast('Maximum 30 information needs per discipline.');
  list.push(text); changed('personal'); render(); $('#new-priority').focus();
});
document.addEventListener('dragstart',event => {const row = event.target.closest('[data-priority],[data-delivery]'); if (!row) return; if (row.dataset.delivery !== undefined) dragDeliveryFrom = +row.dataset.delivery; else dragFrom = +row.dataset.priority; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain',String(dragDeliveryFrom ?? dragFrom)); row.classList.add('dragging');});
document.addEventListener('dragover',event => {if (event.target.closest('#drop-zone') || (dragFrom !== null && event.target.closest('[data-priority]')) || (dragDeliveryFrom !== null && event.target.closest('[data-delivery]'))) event.preventDefault();});
document.addEventListener('drop',event => {const zone = event.target.closest('#drop-zone'), row = event.target.closest('[data-priority]'), delivery = event.target.closest('[data-delivery]'); if (zone) {event.preventDefault(); addFiles(event.dataTransfer.files,zone.dataset.scope);} else if (delivery && dragDeliveryFrom !== null) {event.preventDefault(); moveDelivery(dragDeliveryFrom,+delivery.dataset.delivery);} else if (row && dragFrom !== null) {event.preventDefault(); move(dragFrom,+row.dataset.priority);} dragFrom = null; dragDeliveryFrom = null;});
document.addEventListener('dragend',() => {dragFrom = null; dragDeliveryFrom = null; document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));});
document.addEventListener('keydown',event => {
  if (!event.target.matches('[role="tab"]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault(); const tabs = tabsFor(view), i = tabs.findIndex(([id]) => id === tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tab = tabs[next][0]; render(); $(`[data-tab="${tab}"]`).focus();
});
window.addEventListener('pagehide',() => {if (timer) persist();});
async function signIn(message = '') {
  const messages = {cancelled:'Sign-in was cancelled. Try again when ready.',expired:'Your sign-in request expired. Please try again.',failed:'Discord sign-in could not be completed. Please try again.',not_allowed:'This Discord account does not have access. Contact your administrator.',busy:'Too many sign-in attempts. Please try again in a minute.'};
  try {oauthConfigured = (await api('/api/auth')).configured;} catch {message = 'The server is unavailable. Please try again.';}
  if (!message) message = oauthConfigured ? messages[new URL(location.href).searchParams.get('auth')] || '' : 'Discord sign-in is not configured yet. Contact your administrator.';
  $('#app').innerHTML = `<main class="login-page"><a class="brand" href="/"><img class="brand-logo" src="/logo.png" alt="">Sonne</a><section class="login-content" aria-labelledby="login-heading"><h1 id="login-heading">Your workspace.</h1><p>One team. Your own perspective.</p>${oauthConfigured ? `<a class="button primary full" href="/auth/discord">Sign in with Discord ${icon('arrow')}</a>` : '<button class="button primary full" disabled>Sign in with Discord</button>'}<p class="login-error" role="alert">${esc(message)}</p><a class="preview-link" href="/?preview=1">Explore the workspace ${icon('arrow')}</a></section></main>`;
  if (location.search) window.history.replaceState(null,'','/');
}
async function boot() {
  if (preview) {render(); return;}
  try {
    const response = await requestResponse('/api/workspace');
    if (response.status === 401) return signIn();
    if (!response.ok) throw new Error('The workspace is unavailable.');
    const personal = await response.json(), team = await api('/api/team');
    state = validateProject(personal.workspace); shared = validateShared(team.workspace); history = team.history;
    profile = personal.profile; connected = personal.connected && team.connected; revisions = {personal:personal.revision,shared:team.revision}; applied = {personal:personal.applied,shared:team.applied};
    oauthConfigured = (await api('/api/auth')).configured;
    await hydrateFiles(shared,'shared'); await hydrateFiles(state,'personal');
    render();
  } catch (error) {await signIn(error.message);}
}
await boot();
