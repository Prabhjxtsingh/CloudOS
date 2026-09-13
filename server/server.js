const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const clientRoot = path.join(__dirname, '..', 'client');
const port = Number(process.env.PORT || 3000);
const sessions = new Map();
const files = [
  { id: 'welcome', name: 'Welcome.txt', type: 'text', size: '1 KB', updated: 'Just now' },
  { id: 'projects', name: 'Projects', type: 'folder', size: '--', updated: 'Today' },
  { id: 'notes', name: 'CloudOS-notes.md', type: 'text', size: '4 KB', updated: 'Yesterday' }
];

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
    const session = {
      id: randomUUID(),
      user: 'demo@cloudos.local',
      status: 'running',
      host: 'local-dev',
      startedAt: new Date().toISOString()
    };
    sessions.set(session.id, session);
    sendJson(response, 201, session);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/files') {
    sendJson(response, 200, { files });
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
        files.unshift(file);
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
