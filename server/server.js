const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const clientRoot = path.join(__dirname, '..', 'client');
const dataRoot = path.join(__dirname, '..', 'data');
const statePath = path.join(dataRoot, 'cloudos-state.json');
const port = Number(process.env.PORT || 3000);
const eventClients = new Set();
const defaultState = {
  sessions: [],
  settings: { workspaceName: 'Dev workspace', notifications: true, sessionPersistence: true, theme: 'light' },
  files: [
    { id: 'welcome', name: 'Welcome.txt', type: 'text', size: '1 KB', updated: 'Just now', content: 'Welcome to your CloudOS workspace.\n' },
    { id: 'projects', name: 'Projects', type: 'folder', size: '--', updated: 'Today' },
    { id: 'notes', name: 'CloudOS-notes.md', type: 'text', size: '4 KB', updated: 'Yesterday', content: '# CloudOS notes\n\nYour workspace is live.\n' }
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
state.sessions = Array.isArray(state.sessions) ? state.sessions : [];
state.settings = { ...defaultState.settings, ...(state.settings || {}) };
state.files = Array.isArray(state.files) ? state.files.map((file) => ({ ...file, content: file.content || '' })) : structuredClone(defaultState.files);

function saveState() {
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function broadcast(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) client.write(message);
}

function readBody(request, callback) {
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    try {
      callback(null, JSON.parse(body || '{}'));
    } catch {
      callback(new Error('Invalid JSON payload'));
    }
  });
}

function findFile(fileId) {
  return state.files.find((file) => file.id === fileId);
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

  if (request.method === 'GET' && requestUrl.pathname === '/api/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
    eventClients.add(response);
    request.on('close', () => eventClients.delete(response));
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
    broadcast('session', session);
    sendJson(response, 201, session);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/files') {
    sendJson(response, 200, { files: state.files });
    return;
  }

  const fileMatch = requestUrl.pathname.match(/^\/api\/files\/([^/]+)$/);

  if (request.method === 'GET' && fileMatch) {
    const file = findFile(fileMatch[1]);
    if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
    sendJson(response, 200, { file });
    return;
  }

  if (request.method === 'PUT' && fileMatch) {
    readBody(request, (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      const file = findFile(fileMatch[1]);
      if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
      file.content = String(payload.content || '');
      file.size = `${Math.max(1, Math.ceil(Buffer.byteLength(file.content) / 1024))} KB`;
      file.updated = 'Just now';
      saveState();
      broadcast('file_updated', file);
      sendJson(response, 200, file);
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/files') {
    readBody(request, (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      try {
        const file = {
          id: randomUUID(),
          name: String(payload.name || 'Untitled.txt'),
          type: payload.type === 'folder' ? 'folder' : 'text',
          size: payload.content ? `${Math.max(1, Math.ceil(Buffer.byteLength(String(payload.content)) / 1024))} KB` : '--',
          updated: 'Just now',
          content: String(payload.content || '')
        };
        state.files.unshift(file);
        saveState();
        broadcast('file_created', file);
        sendJson(response, 201, file);
      } catch (creationError) {
        sendJson(response, 400, { error: creationError.message });
      }
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/settings') {
    sendJson(response, 200, state.settings);
    return;
  }

  if (request.method === 'PUT' && requestUrl.pathname === '/api/settings') {
    readBody(request, (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      state.settings = { ...state.settings, ...payload, workspaceName: String(payload.workspaceName || state.settings.workspaceName) };
      saveState();
      broadcast('settings_updated', state.settings);
      sendJson(response, 200, state.settings);
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/terminal') {
    readBody(request, (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      const command = String(payload.command || '').trim();
      const outputs = {
        help: 'Available: help, clear, date, whoami, ls, pwd, uptime',
        date: new Date().toString(),
        whoami: 'dev@cloudos.local',
        ls: state.files.map((file) => `${file.name}${file.type === 'folder' ? '/' : ''}`).join('  '),
        pwd: '/home/dev',
        uptime: `${state.sessions.filter((session) => session.status === 'running').length} CloudOS session(s) running`
      };
      sendJson(response, 200, { command, output: command === 'clear' ? '' : (outputs[command] || `command not found: ${command}`) });
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
