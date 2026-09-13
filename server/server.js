const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const clientRoot = path.join(__dirname, '..', 'client');
const dataRoot = path.join(__dirname, '..', 'data');
const statePath = path.join(dataRoot, 'cloudos-state.json');
const port = Number(process.env.PORT || 3000);
const defaultState = {
  sessions: [],
  files: [
    { id: 'welcome', name: 'Welcome.txt', type: 'text', size: '1 KB', updated: 'Just now' },
    { id: 'projects', name: 'Projects', type: 'folder', size: '--', updated: 'Today' },
    { id: 'notes', name: 'CloudOS-notes.md', type: 'text', size: '4 KB', updated: 'Yesterday' }
  ]
};

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return structuredClone(defaultState);
  }
}

let state = loadState();

function saveState() {
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function serveFile(response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(clientRoot, requestedPath));

  if (!filePath.startsWith(clientRoot)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    const extension = path.extname(filePath);
    const contentTypes = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8'
    };
    response.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok', service: 'cloudos-local' });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/sessions') {
    const requestedId = requestUrl.searchParams.get('id');
    const existingSession = state.sessions.find((session) => session.id === requestedId);
    const session = existingSession || {
      id: randomUUID(),
      user: 'demo@cloudos.local',
      status: 'running',
      host: 'local-dev',
      startedAt: new Date().toISOString(),
      lastConnectedAt: new Date().toISOString()
    };
    session.status = 'running';
    session.lastConnectedAt = new Date().toISOString();
    if (!existingSession) state.sessions.push(session);
    saveState();
    sendJson(response, 201, session);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/files') {
    sendJson(response, 200, { files: state.files });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/files') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const file = {
          id: randomUUID(),
          name: String(payload.name || 'Untitled.txt'),
          type: payload.type === 'folder' ? 'folder' : 'text',
          size: '--',
          updated: 'Just now'
        };
        state.files.unshift(file);
        saveState();
        sendJson(response, 201, file);
      } catch {
        sendJson(response, 400, { error: 'Invalid JSON payload' });
      }
    });
    return;
  }

  if (request.method === 'GET') {
    serveFile(response, requestUrl.pathname);
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
});

server.listen(port, () => {
  console.log(`CloudOS is running at http://localhost:${port}`);
});
