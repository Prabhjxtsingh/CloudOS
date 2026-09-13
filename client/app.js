const loginScreen = document.querySelector('#login-screen');
const desktop = document.querySelector('#desktop');
const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');
const fileList = document.querySelector('#file-list');
const largeFileList = document.querySelector('#large-file-list');
const overviewView = document.querySelector('#overview-view');
const secondaryView = document.querySelector('#secondary-view');
const viewTitle = document.querySelector('#view-title');
const secondaryTitle = document.querySelector('#secondary-title');
const secondaryEyebrow = document.querySelector('#secondary-eyebrow');
const secondaryDescription = document.querySelector('#secondary-description');
const toast = document.querySelector('#toast');
const launcherMenu = document.querySelector('#launcher-menu');
const windowLayer = document.querySelector('#window-layer');
const runningApps = document.querySelector('#running-apps');
const appSearch = document.querySelector('#app-search');
let currentSession;
let toastTimer;
let windowSequence = 0;
let selectedFileId = 'notes';
let eventSource;
let currentFolderId = null;
let currentFolderName = 'My files';

const viewCopy = {
  overview: { title: 'Good morning, Dev.', eyebrow: '', secondaryTitle: '', description: '' },
  files: { title: 'Your files.', eyebrow: 'FILES', secondaryTitle: 'My files', description: 'Persistent storage for your cloud workspace.' },
  apps: { title: 'Your toolkit.', eyebrow: 'APPLICATIONS', secondaryTitle: 'Applications', description: 'Tools ready to run inside your cloud workspace.' },
  activity: { title: 'A clear trail.', eyebrow: 'ACTIVITY', secondaryTitle: 'Recent activity', description: 'A simple record of what changed in your workspace.' },
  settings: { title: 'Make it yours.', eyebrow: 'PREFERENCES', secondaryTitle: 'Settings', description: 'Workspace preferences will live here as the platform grows.' },
  team: { title: 'Work together.', eyebrow: 'ORGANIZATION', secondaryTitle: 'Team', description: 'People, roles, and access for your CloudOS organization.' },
  admin: { title: 'See the whole picture.', eyebrow: 'ADMINISTRATION', secondaryTitle: 'Admin overview', description: 'A live operational view of your organization.' }
};

async function startSession() {
  const savedSessionId = window.localStorage.getItem('cloudos-session-id');
  const email = document.querySelector('#email').value;
  const endpoint = savedSessionId ? `/api/sessions?id=${encodeURIComponent(savedSessionId)}&email=${encodeURIComponent(email)}` : `/api/sessions?email=${encodeURIComponent(email)}`;
  const response = await fetch(endpoint, { method: 'POST' });
  if (!response.ok) throw new Error('Unable to start session');
  const session = await response.json();
  window.localStorage.setItem('cloudos-session-id', session.id);
  return session;
}

async function loadFiles() {
  const endpoint = currentFolderId ? `/api/files?parentId=${encodeURIComponent(currentFolderId)}` : '/api/files';
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Unable to load files');
  const payload = await response.json();
  renderFiles(payload.files);
}

function fileIcon(file) {
  return file.type === 'folder' ? '□' : '▤';
}

function fileMarkup(file, detailed = false) {
  const actions = detailed ? `<span class="file-actions-inline"><button type="button" data-file-action="download" title="Download">↓</button><button type="button" data-file-action="share" title="Share">↗</button><button type="button" data-file-action="restore" title="Restore version">↺</button><button type="button" data-file-action="rename" title="Rename">✎</button><button type="button" data-file-action="delete" title="Delete">×</button></span>` : '';
  return `<div class="file-row ${detailed ? 'detailed' : ''}" data-file-id="${file.id}" tabindex="0"><span class="file-icon ${file.type}">${fileIcon(file)}</span><div class="file-name"><strong>${escapeHtml(file.name)}</strong><span>${file.type === 'folder' ? 'Folder' : 'Document'}</span></div>${detailed ? `<span class="file-meta">${file.size}</span><span class="file-meta">${file.updated}</span>${actions}` : `<span class="file-date">${file.updated}</span>`}</div>`;
}

function renderFiles(files) {
  fileList.innerHTML = files.slice(0, 4).map((file) => fileMarkup(file)).join('');
  largeFileList.innerHTML = `<div class="file-breadcrumb"><button class="text-button" id="root-folder-button" type="button">My files</button>${currentFolderId ? `<span>/</span><strong>${escapeHtml(currentFolderName)}</strong><button class="text-button" id="up-folder-button" type="button">↑ Back</button>` : ''}</div><div class="file-actions"><button class="secondary-button" id="upload-file-button" type="button">↑ Upload</button><button class="secondary-button" id="new-folder-button" type="button">＋ Folder</button><input id="upload-file-input" type="file" hidden></div><div class="file-table-head"><span>Name</span><span>Size</span><span>Updated</span><span></span></div>${files.map((file) => fileMarkup(file, true)).join('')}`;
  const fileWindow = document.querySelector('[data-app-window="files"]');
  if (fileWindow) {
    fileWindow.querySelector('.window-file-list').innerHTML = `<div class="file-breadcrumb"><button class="text-button window-root-folder" type="button">My files</button>${currentFolderId ? `<span>/ ${escapeHtml(currentFolderName)}</span><button class="text-button window-up-folder" type="button">↑ Back</button>` : ''}</div><div class="file-actions"><button class="secondary-button window-upload-file" type="button">↑ Upload</button><button class="secondary-button window-new-folder" type="button">＋ Folder</button></div>${files.map((file) => fileMarkup(file, true)).join('')}`;
    bindFileWindow(fileWindow);
  }
}

function connectRealtime() {
  eventSource?.close();
  eventSource = new EventSource('/api/events');
  eventSource.addEventListener('file_created', async (event) => { await loadFiles(); showToast(`${JSON.parse(event.data).name} was added from another session.`); });
  eventSource.addEventListener('file_updated', async (event) => { await loadFiles(); showToast(`${JSON.parse(event.data).name} was updated live.`); });
  eventSource.addEventListener('settings_updated', (event) => { const settings = JSON.parse(event.data); applyTheme(settings.theme); viewTitle.textContent = `${settings.workspaceName} is live.`; });
  eventSource.addEventListener('session', () => showToast('Session state updated live.'));
  eventSource.addEventListener('organization_updated', () => { if (secondaryTitle.textContent === 'Team') loadTeamView(); });
  eventSource.addEventListener('audit_created', () => { if (secondaryTitle.textContent === 'Admin overview') loadAdminView(); });
}

function applyTheme(theme) {
  document.body.classList.toggle('night-mode', theme === 'dark');
}

async function loadSettings() {
  const response = await fetch('/api/settings');
  if (!response.ok) return;
  const settings = await response.json();
  applyTheme(settings.theme);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}


const appDefinitions = {
  files: { title: 'Files', icon: '□', tone: 'teal' },
  terminal: { title: 'Terminal', icon: '>_', tone: 'navy' },
  editor: { title: 'Text Editor', icon: '✎', tone: 'coral' },
  settings: { title: 'Settings', icon: '⚙', tone: 'yellow' }
};

function appContent(appName, windowId) {
  if (appName === 'terminal') return `<div class="terminal-output" id="terminal-output-${windowId}"><p>CloudOS Terminal <span>v0.1 local</span></p><p>Type <strong>help</strong> to see available commands.</p></div><form class="terminal-form" data-window="${windowId}"><span>dev@cloudos:~$</span><input type="text" autocomplete="off" aria-label="Terminal command"><button type="submit" aria-label="Run command">↵</button></form>`;
  if (appName === 'editor') return `<div class="editor-toolbar"><span class="editor-file-name">Loading file...</span><button type="button" class="text-button editor-save" data-window="${windowId}">Save note</button></div><textarea class="editor-input" id="editor-input-${windowId}" aria-label="Text editor">Loading file...</textarea>`;
  if (appName === 'settings') return '<div class="window-settings"><label>Workspace name<input class="settings-workspace-name" value="Dev workspace"></label><label>Appearance<select class="settings-theme"><option value="light">Day mode</option><option value="dark">Night mode</option></select></label><label>Session persistence<input class="settings-persistence" type="checkbox" checked></label><label>Notifications<input class="settings-notifications" type="checkbox" checked></label><button class="secondary-button window-action" type="button">Apply changes</button></div>';
  return `<div class="window-file-list">${largeFileList.innerHTML || '<p class="window-empty">Loading workspace files...</p>'}</div>`;
}

function openApp(appName) {
  const definition = appDefinitions[appName];
  if (!definition) return;
  closeLauncher();
  const existingWindow = document.querySelector(`[data-app-window="${appName}"]`);
  if (existingWindow) {
    existingWindow.classList.remove('minimized');
    existingWindow.style.zIndex = ++windowSequence;
    if (appName === 'editor') loadEditorFile(existingWindow);
    return;
  }
  const windowId = `window-${Date.now()}`;
  const appWindow = document.createElement('article');
  appWindow.className = 'app-window';
  appWindow.dataset.appWindow = appName;
  appWindow.style.zIndex = ++windowSequence;
  appWindow.innerHTML = `<header class="window-titlebar"><div><span class="app-tile ${definition.tone}">${definition.icon}</span><strong>${definition.title}</strong></div><div class="window-controls"><button type="button" class="window-minimize" aria-label="Minimize ${definition.title}">−</button><button type="button" class="window-close" aria-label="Close ${definition.title}">×</button></div></header><div class="window-content">${appContent(appName, windowId)}</div>`;
  windowLayer.appendChild(appWindow);
  appWindow.addEventListener('pointerdown', () => { appWindow.style.zIndex = ++windowSequence; });
  bindWindowMovement(appWindow);
  appWindow.querySelector('.window-close').addEventListener('click', () => { appWindow.remove(); document.querySelector(`[data-running-app="${appName}"]`)?.remove(); });
  appWindow.querySelector('.window-minimize').addEventListener('click', () => { appWindow.classList.add('minimized'); });
  const taskButton = document.createElement('button');
  taskButton.className = 'task-app running-app';
  taskButton.dataset.runningApp = appName;
  taskButton.type = 'button';
  taskButton.textContent = `${definition.icon} ${definition.title}`;
  taskButton.addEventListener('click', () => { appWindow.classList.remove('minimized'); appWindow.style.zIndex = ++windowSequence; });
  runningApps.appendChild(taskButton);
  if (appName === 'terminal') bindTerminal(appWindow);
  if (appName === 'editor') bindEditor(appWindow);
  if (appName === 'settings') bindSettings(appWindow);
  if (appName === 'files') bindFileWindow(appWindow);
}

function bindWindowMovement(appWindow) {
  const titlebar = appWindow.querySelector('.window-titlebar');
  let dragState;
  titlebar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const layerRect = windowLayer.getBoundingClientRect();
    const windowRect = appWindow.getBoundingClientRect();
    dragState = { offsetX: event.clientX - windowRect.left, offsetY: event.clientY - windowRect.top, layerRect };
    titlebar.setPointerCapture(event.pointerId);
  });
  titlebar.addEventListener('pointermove', (event) => {
    if (!dragState) return;
    const nextLeft = Math.max(0, Math.min(dragState.layerRect.width - appWindow.offsetWidth, event.clientX - dragState.layerRect.left - dragState.offsetX));
    const nextTop = Math.max(0, Math.min(dragState.layerRect.height - appWindow.offsetHeight, event.clientY - dragState.layerRect.top - dragState.offsetY));
    appWindow.style.left = `${nextLeft}px`;
    appWindow.style.top = `${nextTop}px`;
  });
  titlebar.addEventListener('pointerup', () => { dragState = undefined; });
  titlebar.addEventListener('pointercancel', () => { dragState = undefined; });
}

function closeLauncher() {
  launcherMenu.hidden = true;
  appSearch.value = '';
  document.querySelectorAll('.launcher-app').forEach((app) => { app.hidden = false; });
}

function bindTerminal(appWindow) {
  const form = appWindow.querySelector('.terminal-form');
  const output = appWindow.querySelector('.terminal-output');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    const command = input.value.trim();
    if (!command) return;
    const response = await fetch('/api/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
    const result = await response.json();
    if (command === 'clear') output.innerHTML = '';
    else output.insertAdjacentHTML('beforeend', `<p><span>dev@cloudos:~$</span> ${escapeHtml(command)}</p><p>${escapeHtml(result.output)}</p>`);
    input.value = '';
    output.scrollTop = output.scrollHeight;
  });
}

function bindEditor(appWindow) {
  loadEditorFile(appWindow);
  appWindow.querySelector('.editor-save').addEventListener('click', async () => {
    const content = appWindow.querySelector('.editor-input').value;
    const response = await fetch(`/api/files/${selectedFileId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    if (response.ok) { await loadFiles(); showToast('Note saved to your workspace.'); }
  });
}

async function loadEditorFile(appWindow) {
  const response = await fetch(`/api/files/${selectedFileId}`);
  if (!response.ok) return;
  const payload = await response.json();
  appWindow.querySelector('.editor-file-name').textContent = payload.file.name;
  appWindow.querySelector('.editor-input').value = payload.file.content || '';
}

function bindFileWindow(appWindow) {
  appWindow.querySelectorAll('.file-row').forEach((row) => row.setAttribute('role', 'button'));
  appWindow.querySelector('.window-new-folder')?.addEventListener('click', createFolder);
  appWindow.querySelector('.window-upload-file')?.addEventListener('click', () => document.querySelector('#upload-file-input')?.click());
  appWindow.querySelector('.window-root-folder')?.addEventListener('click', () => { currentFolderId = null; currentFolderName = 'My files'; loadFiles(); });
  appWindow.querySelector('.window-up-folder')?.addEventListener('click', goUpFolder);
}

function openFile(fileId) {
  selectedFileId = fileId;
  if (findFileType(fileId) === 'folder') {
    currentFolderId = fileId;
    currentFolderName = document.querySelector(`[data-file-id="${fileId}"] strong`)?.textContent || 'Folder';
    loadFiles();
    return;
  }
  openApp('editor');
}

function goUpFolder() {
  currentFolderId = null;
  currentFolderName = 'My files';
  loadFiles();
}

function findFileType(fileId) {
  const row = document.querySelector(`[data-file-id="${fileId}"]`);
  return row?.querySelector('.file-icon')?.classList.contains('folder') ? 'folder' : 'text';
}

async function createFolder() {
  const name = window.prompt('Folder name', 'New folder');
  if (!name) return;
  const response = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type: 'folder', parentId: currentFolderId }) });
  if (response.ok) { await loadFiles(); showToast(`${name} folder created.`); }
}

async function uploadSelectedFile(file) {
  if (!file) return;
  const content = await file.text();
  const response = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, content, parentId: currentFolderId }) });
  if (response.ok) { await loadFiles(); showToast(`${file.name} uploaded to CloudOS.`); }
}

async function handleFileAction(fileId, action) {
  if (action === 'download') { window.location.href = `/api/files/${fileId}/download`; return; }
  if (action === 'share') {
    const permission = window.prompt('Share permission: view or edit', 'view');
    if (!permission) return;
    const response = await fetch(`/api/files/${fileId}/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permission }) });
    if (response.ok) {
      const share = await response.json();
      const url = `${window.location.origin}${share.url}`;
      await navigator.clipboard?.writeText(url);
      showToast(`Share link copied: ${url}`);
    }
    return;
  }
  if (action === 'restore') {
    const versionsResponse = await fetch(`/api/files/${fileId}/versions`);
    if (!versionsResponse.ok) return;
    const versions = (await versionsResponse.json()).versions;
    if (!versions.length) { showToast('No previous versions available.'); return; }
    const choice = window.prompt(`Restore version number:\n${versions.map((version, index) => `${index + 1}. ${new Date(version.createdAt).toLocaleString()}`).join('\n')}`, '1');
    const version = versions[Number(choice) - 1];
    if (!version) return;
    const response = await fetch(`/api/files/${fileId}/versions/${version.id}/restore`, { method: 'POST' });
    if (response.ok) { await loadFiles(); showToast('Previous version restored.'); }
    return;
  }
  if (action === 'rename') {
    const currentName = document.querySelector(`[data-file-id="${fileId}"] strong`)?.textContent;
    const name = window.prompt('New file name', currentName);
    if (!name || name === currentName) return;
    const response = await fetch(`/api/files/${fileId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (response.ok) { await loadFiles(); showToast('File renamed.'); }
    return;
  }
  if (action === 'delete' && window.confirm('Delete this item from CloudOS?')) {
    const response = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
    if (response.ok) { await loadFiles(); showToast('Item moved out of the workspace.'); }
  }
}

async function bindSettings(appWindow) {
  const settingsResponse = await fetch('/api/settings');
  if (settingsResponse.ok) {
    const settings = await settingsResponse.json();
    appWindow.querySelector('.settings-workspace-name').value = settings.workspaceName;
    appWindow.querySelector('.settings-theme').value = settings.theme || 'light';
    appWindow.querySelector('.settings-persistence').checked = settings.sessionPersistence;
    appWindow.querySelector('.settings-notifications').checked = settings.notifications;
  }
  appWindow.querySelector('.window-action').addEventListener('click', async () => {
    const settings = { workspaceName: appWindow.querySelector('.settings-workspace-name').value, theme: appWindow.querySelector('.settings-theme').value, sessionPersistence: appWindow.querySelector('.settings-persistence').checked, notifications: appWindow.querySelector('.settings-notifications').checked };
    const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    if (response.ok) { applyTheme(settings.theme); showToast('Workspace preferences updated live.'); }
  });
}

async function loadTeamView() {
  const response = await fetch('/api/organization');
  if (!response.ok) return;
  const organization = await response.json();
  largeFileList.innerHTML = `<div class="business-heading"><div><span class="plan-badge">${escapeHtml(organization.plan)}</span><h4>${escapeHtml(organization.name)}</h4><p>${organization.members.length} people in this workspace</p></div><form class="invite-form" id="invite-member-form"><input name="name" placeholder="Name" required><input name="email" type="email" placeholder="Email" required><select name="role"><option value="member">Member</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select><button class="secondary-button" type="submit">Invite</button></form></div><div class="member-table"><div class="member-table-head"><span>Person</span><span>Role</span><span>Status</span></div>${organization.members.map((member) => `<div class="member-row"><div><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.email)}</small></div><span class="role-badge ${member.role}">${escapeHtml(member.role)}</span><span class="member-status ${member.status}">${escapeHtml(member.status)}</span></div>`).join('')}</div>`;
  document.querySelector('#invite-member-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const invite = await fetch('/api/organization/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), email: form.get('email'), role: form.get('role') }) });
    if (invite.ok) { await loadTeamView(); showToast('Invitation added to the organization.'); }
    else { const result = await invite.json(); showToast(result.error || 'Could not invite member.'); }
  });
}

async function loadAdminView() {
  const [summaryResponse, auditResponse] = await Promise.all([fetch('/api/admin/summary'), fetch('/api/audit')]);
  if (!summaryResponse.ok || !auditResponse.ok) return;
  const summary = await summaryResponse.json();
  const audit = await auditResponse.json();
  const storage = `${Math.max(1, Math.ceil(summary.metrics.storageBytes / 1024))} KB`;
  largeFileList.innerHTML = `<div class="admin-metrics"><article><span>USERS</span><strong>${summary.metrics.users}</strong><small>${summary.metrics.activeUsers} active now</small></article><article><span>CLOUD PCS</span><strong>${summary.metrics.cloudPcs}</strong><small>local-dev capacity</small></article><article><span>STORAGE</span><strong>${storage}</strong><small>persisted workspace data</small></article><article><span>AUDIT EVENTS</span><strong>${summary.metrics.auditEvents}</strong><small>latest 100 retained</small></article></div><div class="admin-columns"><section><p class="eyebrow">ACTIVE SESSIONS</p>${summary.sessions.length ? summary.sessions.map((session) => `<div class="session-row"><span class="status-dot"></span><div><strong>${escapeHtml(session.user)}</strong><small>${escapeHtml(session.host)}</small></div><span>${escapeHtml(session.status)}</span></div>`).join('') : '<p class="empty-state compact">No sessions yet.</p>'}</section><section><p class="eyebrow">AUDIT TRAIL</p>${audit.events.length ? audit.events.slice(0, 6).map((event) => `<div class="audit-row"><strong>${escapeHtml(event.action)}</strong><small>${escapeHtml(event.actor)} · ${new Date(event.createdAt).toLocaleString()}</small><span>${escapeHtml(event.details)}</span></div>`).join('') : '<p class="empty-state compact">No audit events yet.</p>'}</section></div>`;
}

function setView(view) {
  const copy = viewCopy[view] || viewCopy.overview;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  viewTitle.textContent = copy.title;
  if (view === 'overview') {
    overviewView.hidden = false;
    secondaryView.hidden = true;
    return;
  }
  overviewView.hidden = true;
  secondaryView.hidden = false;
  secondaryEyebrow.textContent = copy.eyebrow;
  secondaryTitle.textContent = copy.secondaryTitle;
  secondaryDescription.textContent = copy.description;
  if (view === 'apps') {
    largeFileList.innerHTML = ['files', 'terminal', 'editor', 'settings'].map((appName) => { const app = appDefinitions[appName]; return `<div class="app-row"><span class="app-symbol ${app.tone}">${app.icon}</span><div><strong>${app.title}</strong><p>Available in your CloudOS workspace</p></div><button class="text-button launch-button" data-app="${appName}" type="button">Launch →</button></div>`; }).join('');
  } else if (view === 'activity') {
    largeFileList.innerHTML = '<div class="empty-state"><span>◷</span><strong>Activity is calm.</strong><p>Your latest workspace actions will appear here.</p></div>';
  } else if (view === 'settings') {
    largeFileList.innerHTML = '<div class="settings-list"><label>Workspace name<input value="Dev workspace"></label><label>Session persistence<span class="toggle on"><i></i></span></label><label>Interface density<span class="setting-value">Comfortable</span></label></div>';
  } else if (view === 'team') {
    loadTeamView();
  } else if (view === 'admin') {
    loadAdminView();
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.textContent = 'Starting your workspace...';
  try {
    currentSession = await startSession();
    document.querySelector('#connection-label').textContent = `Connected to ${currentSession.host}`;
    loginScreen.hidden = true;
    desktop.hidden = false;
    await loadFiles();
    await loadSettings();
    connectRealtime();
    showToast('Workspace ready. Your session is running.');
  } catch (error) {
    loginStatus.textContent = 'Could not connect. Is the local server running?';
  }
});

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#open-files-button').addEventListener('click', () => setView('files'));
document.querySelector('#view-files-button').addEventListener('click', () => setView('files'));
document.querySelector('#launcher-button').addEventListener('click', () => { launcherMenu.hidden = !launcherMenu.hidden; if (!launcherMenu.hidden) appSearch.focus(); });
document.querySelector('.close-launcher').addEventListener('click', closeLauncher);
document.querySelectorAll('.launcher-app').forEach((button) => button.addEventListener('click', () => openApp(button.dataset.app)));
appSearch.addEventListener('input', () => { const query = appSearch.value.toLowerCase(); document.querySelectorAll('.launcher-app').forEach((app) => { app.hidden = !app.textContent.toLowerCase().includes(query); }); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeLauncher();
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 't') { event.preventDefault(); openApp('terminal'); }
});
document.querySelector('#new-file-button').addEventListener('click', async () => {
  const name = window.prompt('Name your new file', 'Untitled.txt');
  if (!name) return;
  const response = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (response.ok) {
    await loadFiles();
    showToast(`${name} added to your workspace.`);
  }
});
document.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-file-action]');
  if (actionButton) handleFileAction(actionButton.closest('.file-row').dataset.fileId, actionButton.dataset.fileAction);
  if (event.target.matches('#new-folder-button')) createFolder();
  if (event.target.matches('#upload-file-button')) document.querySelector('#upload-file-input').click();
  if (event.target.matches('#root-folder-button')) goUpFolder();
  if (event.target.matches('#up-folder-button')) goUpFolder();
});
document.addEventListener('change', (event) => {
  if (event.target.matches('#upload-file-input')) {
    uploadSelectedFile(event.target.files[0]);
    event.target.value = '';
  }
});
document.addEventListener('click', (event) => {
  if (event.target.matches('.launch-button')) openApp(event.target.dataset.app);
});
document.addEventListener('dblclick', (event) => {
  const fileRow = event.target.closest('.file-row');
  if (fileRow?.dataset.fileId) openFile(fileRow.dataset.fileId);
});

function updateClock() {
  document.querySelector('#clock').textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
}
updateClock();
setInterval(updateClock, 30000);
