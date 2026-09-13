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
let currentSession;
let toastTimer;

const viewCopy = {
  overview: { title: 'Good morning, Dev.', eyebrow: '', secondaryTitle: '', description: '' },
  files: { title: 'Your files.', eyebrow: 'FILES', secondaryTitle: 'My files', description: 'Persistent storage for your cloud workspace.' },
  apps: { title: 'Your toolkit.', eyebrow: 'APPLICATIONS', secondaryTitle: 'Applications', description: 'Tools ready to run inside your cloud workspace.' },
  activity: { title: 'A clear trail.', eyebrow: 'ACTIVITY', secondaryTitle: 'Recent activity', description: 'A simple record of what changed in your workspace.' },
  settings: { title: 'Make it yours.', eyebrow: 'PREFERENCES', secondaryTitle: 'Settings', description: 'Workspace preferences will live here as the platform grows.' }
};

async function startSession() {
  const response = await fetch('/api/sessions', { method: 'POST' });
  if (!response.ok) throw new Error('Unable to start session');
  return response.json();
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
    largeFileList.innerHTML = ['File Manager', 'Terminal', 'Text Editor', 'Settings'].map((name, index) => `<div class="app-row"><span class="app-symbol">${['□', '>_', '✎', '⚙'][index]}</span><div><strong>${name}</strong><p>Available in your CloudOS workspace</p></div><button class="text-button launch-button" type="button">Launch →</button></div>`).join('');
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
  if (event.target.matches('.launch-button')) showToast(`${event.target.closest('.app-row').querySelector('strong').textContent} is ready to launch.`);
});

function updateClock() {
  document.querySelector('#clock').textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
}
updateClock();
setInterval(updateClock, 30000);
