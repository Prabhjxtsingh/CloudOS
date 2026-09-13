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

const viewCopy = {
  overview: { title: 'Good morning, Dev.', eyebrow: '', secondaryTitle: '', description: '' },
  files: { title: 'Your files.', eyebrow: 'FILES', secondaryTitle: 'My files', description: 'Persistent storage for your cloud workspace.' },
  apps: { title: 'Your toolkit.', eyebrow: 'APPLICATIONS', secondaryTitle: 'Applications', description: 'Tools ready to run inside your cloud workspace.' },
  activity: { title: 'A clear trail.', eyebrow: 'ACTIVITY', secondaryTitle: 'Recent activity', description: 'A simple record of what changed in your workspace.' },
  settings: { title: 'Make it yours.', eyebrow: 'PREFERENCES', secondaryTitle: 'Settings', description: 'Workspace preferences will live here as the platform grows.' }
};

async function startSession() {
  const savedSessionId = window.localStorage.getItem('cloudos-session-id');
  const endpoint = savedSessionId ? `/api/sessions?id=${encodeURIComponent(savedSessionId)}` : '/api/sessions';
  const response = await fetch(endpoint, { method: 'POST' });
  if (!response.ok) throw new Error('Unable to start session');
  const session = await response.json();
  window.localStorage.setItem('cloudos-session-id', session.id);
  return session;
}

async function loadFiles() {
  const response = await fetch('/api/files');
  if (!response.ok) throw new Error('Unable to load files');
  const payload = await response.json();
  renderFiles(payload.files);
}

function fileIcon(file) {
  return file.type === 'folder' ? '□' : '▤';
}

function fileMarkup(file, detailed = false) {
  return `<div class="file-row ${detailed ? 'detailed' : ''}"><span class="file-icon ${file.type}">${fileIcon(file)}</span><div class="file-name"><strong>${escapeHtml(file.name)}</strong><span>${file.type === 'folder' ? 'Folder' : 'Document'}</span></div>${detailed ? `<span class="file-meta">${file.size}</span><span class="file-meta">${file.updated}</span>` : `<span class="file-date">${file.updated}</span>`}</div>`;
}

function renderFiles(files) {
  fileList.innerHTML = files.slice(0, 4).map((file) => fileMarkup(file)).join('');
  largeFileList.innerHTML = `<div class="file-table-head"><span>Name</span><span>Size</span><span>Updated</span></div>${files.map((file) => fileMarkup(file, true)).join('')}`;
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
  if (appName === 'editor') return `<div class="editor-toolbar"><span>CloudOS-notes.md</span><button type="button" class="text-button editor-save" data-window="${windowId}">Save note</button></div><textarea class="editor-input" id="editor-input-${windowId}" aria-label="Text editor"># CloudOS notes\n\nThis is your cloud workspace. Write something here and save it to your files.</textarea>`;
  if (appName === 'settings') return '<div class="window-settings"><label>Workspace name<input value="Dev workspace"></label><label>Session persistence<span class="toggle on"><i></i></span></label><label>Notifications<span class="toggle on"><i></i></span></label><button class="secondary-button window-action" type="button">Apply changes</button></div>';
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
  if (appName === 'editor') bindEditor(appWindow, windowId);
  if (appName === 'settings') appWindow.querySelector('.window-action').addEventListener('click', () => showToast('Workspace preferences updated.'));
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    const command = input.value.trim();
    if (!command) return;
    const response = { help: 'Available: help, clear, date, whoami, ls', date: new Date().toString(), whoami: 'dev@cloudos.local', ls: 'Welcome.txt  Projects/  CloudOS-notes.md' }[command] || `command not found: ${command}`;
    if (command === 'clear') output.innerHTML = '';
    else output.insertAdjacentHTML('beforeend', `<p><span>dev@cloudos:~$</span> ${escapeHtml(command)}</p><p>${escapeHtml(response)}</p>`);
    input.value = '';
    output.scrollTop = output.scrollHeight;
  });
}

function bindEditor(appWindow, windowId) {
  appWindow.querySelector('.editor-save').addEventListener('click', async () => {
    const content = appWindow.querySelector(`#editor-input-${windowId}`).value;
    const response = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'CloudOS-note-copy.md', content }) });
    if (response.ok) { await loadFiles(); showToast('Note saved to your workspace.'); }
  });
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
  if (event.target.matches('.launch-button')) openApp(event.target.dataset.app);
});

function updateClock() {
  document.querySelector('#clock').textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
}
updateClock();
setInterval(updateClock, 30000);
