const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = crypto;
const { createStorage } = require('./storage');

const clientRoot = path.join(__dirname, '..', 'client');
const dataRoot = path.join(__dirname, '..', 'data');
const objectRoot = path.join(dataRoot, 'objects');
const statePath = path.join(dataRoot, 'cloudos-state.json');
const storage = createStorage({ root: objectRoot });
const port = Number(process.env.PORT || 3000);
const trashRetentionDays = Math.max(1, Number(process.env.CLOUDOS_TRASH_RETENTION_DAYS || 30));
const cleanupIntervalMs = Math.max(60_000, Number(process.env.CLOUDOS_CLEANUP_INTERVAL_MS || 3_600_000));
const authSecret = process.env.CLOUDOS_AUTH_SECRET || 'cloudos-local-development-secret';
const sessionTtlSeconds = Math.max(300, Number(process.env.CLOUDOS_SESSION_TTL_SECONDS || 86_400));
const rateLimitWindowMs = 60_000;
const loginLimit = 5;
const apiLimit = 120;
const shareLimit = 60;
const maxBodyBytes = 5 * 1024 * 1024;
const rateBuckets = new Map();
const eventClients = new Set();
const defaultState = {
  users: [
    { id: 'user-dev', name: 'Dev User', email: 'demo@cloudos.local', passwordHash: '251b09c168dcc9eb24ea3a7b6233d32e:170f36496a88c245f0035309304bac2ef11447be5f1ad596bcfdad2a3df063b3f5a6c6a5103df0109d678e9e1f83191e13a65248d026fad3ca0da420f3b3b746', memberId: 'member-dev' }
  ],
  sessions: [],
  settings: { workspaceName: 'Dev workspace', notifications: true, sessionPersistence: true, theme: 'light' },
  organization: {
    id: 'org-cloudos-demo',
    name: 'CloudOS Demo Organization',
    plan: 'Business preview',
    members: [
      { id: 'member-dev', name: 'Dev User', email: 'demo@cloudos.local', role: 'owner', status: 'active', joinedAt: '2026-09-01T09:00:00.000Z' }
    ]
  },
  auditLogs: [],
  shares: [],
  files: [
    { id: 'welcome', name: 'Welcome.txt', type: 'text', parentId: null, trashedAt: null, size: '1 KB', updated: 'Just now', content: 'Welcome to your CloudOS workspace.\n' },
    { id: 'projects', name: 'Projects', type: 'folder', parentId: null, trashedAt: null, size: '--', updated: 'Today' },
    { id: 'notes', name: 'CloudOS-notes.md', type: 'text', parentId: null, trashedAt: null, size: '4 KB', updated: 'Yesterday', content: '# CloudOS notes\n\nYour workspace is live.\n' }
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
state.users = Array.isArray(state.users) && state.users.length ? state.users : structuredClone(defaultState.users);
state.sessions = Array.isArray(state.sessions) ? state.sessions : [];
state.settings = { ...defaultState.settings, ...(state.settings || {}) };
state.organization = { ...defaultState.organization, ...(state.organization || {}) };
state.organization.members = Array.isArray(state.organization.members) ? state.organization.members : structuredClone(defaultState.organization.members);
state.auditLogs = Array.isArray(state.auditLogs) ? state.auditLogs : [];
state.shares = Array.isArray(state.shares) ? state.shares : [];
state.files = Array.isArray(state.files) ? state.files.map((file) => ({ ...file, objectKey: file.objectKey || file.id, parentId: file.parentId || null, trashedAt: file.trashedAt || null, content: file.content || '', versions: Array.isArray(file.versions) ? file.versions : [] })) : structuredClone(defaultState.files);
const storageReady = Promise.all(state.files.map(async (file) => {
  if (!await storage.exists(objectPath(file))) await writeObjectContent(file, file.content || '');
}));

function saveState() {
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = String(storedHash || '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

function signSession(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds })).toString('base64url');
  const signature = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySession(token) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const user = state.users.find((item) => item.email === claims.email);
    const member = state.organization.members.find((item) => item.email === claims.email);
    return user && member ? { ...user, role: member.role } : null;
  } catch {
    return null;
  }
}

function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  const cookie = cookies.find((item) => item.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

function authenticatedUser(request) {
  const authorization = String(request.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : cookieValue(request, 'cloudos_session');
  return verifySession(token);
}

function requireRole(request, response, roles) {
  if (!roles.includes(request.user.role)) {
    sendJson(response, 403, { error: 'Insufficient permissions' });
    return false;
  }
  return true;
}

function clientAddress(request) {
  return request.socket.remoteAddress || 'unknown';
}

function isRateLimited(key, limit) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= rateLimitWindowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function objectPath(file) {
  return file.objectKey || file.id;
}

async function readObjectContent(file) {
  try {
    return await storage.read(objectPath(file));
  } catch {
    return file.content || '';
  }
}

async function writeObjectContent(file, content) {
  await storage.write(objectPath(file), content);
}

async function cleanupExpiredTrash() {
  await storageReady;
  const cutoff = Date.now() - trashRetentionDays * 24 * 60 * 60 * 1000;
  const expiredFiles = state.files.filter((file) => file.trashedAt && new Date(file.trashedAt).getTime() <= cutoff);
  if (!expiredFiles.length) return 0;

  for (const file of expiredFiles) {
    await storage.remove(objectPath(file));
    state.shares = state.shares.filter((share) => share.fileId !== file.id);
    recordAudit('Trash retention cleanup', 'system', `${file.name} removed after ${trashRetentionDays} days`);
  }
  state.files = state.files.filter((file) => !expiredFiles.includes(file));
  saveState();
  for (const file of expiredFiles) broadcast('file_deleted', { id: file.id, name: file.name, reason: 'retention' });
  return expiredFiles.length;
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
  let size = 0;
  let rejected = false;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBodyBytes) {
      rejected = true;
      request.destroy();
      callback(new Error('Request body exceeds the 5 MB limit'));
      return;
    }
    body += chunk;
  });
  request.on('end', () => {
    if (rejected) return;
    try {
      callback(null, JSON.parse(body || '{}'));
    } catch {
      callback(new Error('Invalid JSON payload'));
    }
  });
}

function validateFileName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 255 || name === '.' || name === '..' || /[\\/\0]/.test(name)) return null;
  return name;
}

function findFile(fileId) {
  return state.files.find((file) => file.id === fileId);
}

function recordAudit(action, actor = 'demo@cloudos.local', details = '') {
  const entry = { id: randomUUID(), action, actor, details, createdAt: new Date().toISOString() };
  state.auditLogs.unshift(entry);
  state.auditLogs = state.auditLogs.slice(0, 100);
  broadcast('audit_created', entry);
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

const server = http.createServer(async (request, response) => {
  await storageReady;
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok', service: 'cloudos-local', storage: storage.name, trashRetentionDays });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/auth/login') {
    if (isRateLimited(`login:${clientAddress(request)}`, loginLimit)) {
      response.setHeader('Retry-After', '60');
      sendJson(response, 429, { error: 'Too many login attempts. Try again later.' });
      return;
    }
    readBody(request, (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      const email = String(payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const user = state.users.find((item) => item.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(response, 401, { error: 'Invalid email or password' });
        return;
      }
      const member = state.organization.members.find((item) => item.email === email);
      response.setHeader('Set-Cookie', `cloudos_session=${encodeURIComponent(signSession(email))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionTtlSeconds}`);
      recordAudit('User signed in', email, 'Authenticated session created');
      sendJson(response, 200, { user: { id: user.id, name: user.name, email: user.email, role: member?.role || 'member' } });
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/auth/logout') {
    response.setHeader('Set-Cookie', 'cloudos_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    sendJson(response, 200, { loggedOut: true });
    return;
  }

  const publicShareRequest = requestUrl.pathname.match(/^\/api\/shares\/[^/]+$/) && request.method !== 'DELETE';
  if (publicShareRequest && isRateLimited(`share:${clientAddress(request)}`, shareLimit)) {
    response.setHeader('Retry-After', '60');
    sendJson(response, 429, { error: 'Too many share requests. Try again later.' });
    return;
  }
  if (requestUrl.pathname.startsWith('/api/') && !publicShareRequest) {
    request.user = authenticatedUser(request);
    if (!request.user) {
      sendJson(response, 401, { error: 'Authentication required' });
      return;
    }
    if (isRateLimited(`api:${clientAddress(request)}:${request.user.email}`, apiLimit)) {
      response.setHeader('Retry-After', '60');
      sendJson(response, 429, { error: 'Too many requests. Try again later.' });
      return;
    }
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
    const requestedUser = request.user.email;
    const existingSession = state.sessions.find((session) => session.id === requestedId && session.user === requestedUser);
    const session = existingSession || {
      id: randomUUID(),
      user: requestedUser,
      status: 'running',
      host: 'local-dev',
      startedAt: new Date().toISOString(),
      lastConnectedAt: new Date().toISOString()
    };
    session.status = 'running';
    session.lastConnectedAt = new Date().toISOString();
    if (!existingSession) state.sessions.push(session);
    const member = state.organization.members.find((item) => item.email === session.user);
    if (!member) {
      state.organization.members.push({ id: randomUUID(), name: session.user.split('@')[0], email: session.user, role: 'member', status: 'active', joinedAt: new Date().toISOString() });
    }
    recordAudit(existingSession ? 'Session resumed' : 'Session started', session.user, `Connected to ${session.host}`);
    saveState();
    broadcast('session', session);
    sendJson(response, 201, session);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/me') {
    const member = state.organization.members.find((item) => item.email === request.user.email);
    sendJson(response, 200, { user: member, organizationId: state.organization.id });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/organization') {
    sendJson(response, 200, state.organization);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/admin/summary') {
    if (!requireRole(request, response, ['owner', 'admin'])) return;
    const activeSessions = state.sessions.filter((session) => session.status === 'running').length;
    const storageContents = await Promise.all(state.files.map((file) => readObjectContent(file)));
    const storageBytes = storageContents.reduce((total, content) => total + Buffer.byteLength(content), 0);
    sendJson(response, 200, {
      organization: state.organization,
      metrics: { users: state.organization.members.length, activeUsers: activeSessions, cloudPcs: activeSessions, storageBytes, auditEvents: state.auditLogs.length },
      sessions: state.sessions.map((session) => ({ id: session.id, user: session.user, status: session.status, host: session.host, lastConnectedAt: session.lastConnectedAt }))
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/audit') {
    if (!requireRole(request, response, ['owner', 'admin'])) return;
    sendJson(response, 200, { events: state.auditLogs.slice(0, 30) });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/organization/members') {
    if (!requireRole(request, response, ['owner', 'admin'])) return;
    readBody(request, async (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      const email = String(payload.email || '').trim().toLowerCase();
      const name = String(payload.name || '').trim();
      const role = ['owner', 'admin', 'member', 'viewer'].includes(payload.role) ? payload.role : 'member';
      if (!email || !name || !email.includes('@')) { sendJson(response, 400, { error: 'Name and valid email are required' }); return; }
      if (state.organization.members.some((member) => member.email === email)) { sendJson(response, 409, { error: 'Member already exists' }); return; }
      const member = { id: randomUUID(), name, email, role, status: 'invited', joinedAt: new Date().toISOString() };
      state.organization.members.push(member);
      recordAudit('Member invited', 'demo@cloudos.local', `${email} as ${role}`);
      saveState();
      broadcast('organization_updated', state.organization);
      sendJson(response, 201, member);
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/files') {
    const parentId = requestUrl.searchParams.get('parentId') || null;
    const trashed = requestUrl.searchParams.get('trashed') === 'true';
    sendJson(response, 200, { files: state.files.filter((file) => trashed ? file.trashedAt : !file.trashedAt && file.parentId === parentId), parentId, trashed });
    return;
  }

  const fileMatch = requestUrl.pathname.match(/^\/api\/files\/([^/]+)$/);

  if (request.method === 'GET' && fileMatch) {
    const file = findFile(fileMatch[1]);
    if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
    sendJson(response, 200, { file });
    return;
  }

  const downloadMatch = requestUrl.pathname.match(/^\/api\/files\/([^/]+)\/download$/);
  if (request.method === 'GET' && downloadMatch) {
    const file = findFile(downloadMatch[1]);
    if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.name}"` });
    response.end(await readObjectContent(file));
    return;
  }

  const versionsMatch = requestUrl.pathname.match(/^\/api\/files\/([^/]+)\/versions$/);
  if (request.method === 'GET' && versionsMatch) {
    const file = findFile(versionsMatch[1]);
    if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
    sendJson(response, 200, { versions: file.versions || [] });
    return;
  }

  const restoreMatch = requestUrl.pathname.match(/^\/api\/files\/([^/]+)\/versions\/([^/]+)\/restore$/);
  if (request.method === 'POST' && restoreMatch) {
    const file = findFile(restoreMatch[1]);
    const version = file?.versions?.find((item) => item.id === restoreMatch[2]);
    if (!file || !version) { sendJson(response, 404, { error: 'Version not found' }); return; }
    file.versions.unshift({ id: randomUUID(), content: await readObjectContent(file), createdAt: new Date().toISOString() });
    file.content = version.content;
    await writeObjectContent(file, file.content);
    file.size = `${Math.max(1, Math.ceil(Buffer.byteLength(file.content) / 1024))} KB`;
    file.updated = 'Just now';
    recordAudit('File version restored', 'demo@cloudos.local', file.name);
    saveState();
    broadcast('file_updated', file);
    sendJson(response, 200, file);
    return;
  }

  const shareMatch = requestUrl.pathname.match(/^\/api\/files\/([^/]+)\/shares$/);
  if (request.method === 'GET' && shareMatch) {
    sendJson(response, 200, { shares: state.shares.filter((share) => share.fileId === shareMatch[1]) });
    return;
  }

  if (request.method === 'POST' && shareMatch) {
    const file = findFile(shareMatch[1]);
    if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
    readBody(request, async (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      const share = { id: randomUUID(), token: crypto.randomBytes(32).toString('base64url'), fileId: file.id, permission: payload.permission === 'edit' ? 'edit' : 'view', createdAt: new Date().toISOString(), expiresAt: payload.expiresAt || null, revokedAt: null };
      state.shares.push(share);
      recordAudit('Share link created', 'demo@cloudos.local', file.name);
      saveState();
      sendJson(response, 201, { ...share, url: `/share/${share.token}` });
    });
    return;
  }

  const publicShareMatch = requestUrl.pathname.match(/^\/api\/shares\/([^/]+)$/);
  if (request.method === 'GET' && publicShareMatch) {
    const share = state.shares.find((item) => item.token === publicShareMatch[1]);
    const file = share && findFile(share.fileId);
    if (!share || !file || share.revokedAt || (share.expiresAt && new Date(share.expiresAt) < new Date())) { sendJson(response, 404, { error: 'Share link unavailable' }); return; }
    sendJson(response, 200, { name: file.name, content: await readObjectContent(file), permission: share.permission, expiresAt: share.expiresAt });
    return;
  }

  if (request.method === 'PUT' && publicShareMatch) {
    const share = state.shares.find((item) => item.token === publicShareMatch[1]);
    const file = share && findFile(share.fileId);
    if (!share || !file || share.revokedAt || (share.expiresAt && new Date(share.expiresAt) < new Date()) || share.permission !== 'edit') { sendJson(response, 403, { error: 'This share is unavailable or read-only' }); return; }
    readBody(request, async (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      file.versions.unshift({ id: randomUUID(), content: await readObjectContent(file), createdAt: new Date().toISOString() });
      file.versions = file.versions.slice(0, 10);
      file.content = String(payload.content || '');
      await writeObjectContent(file, file.content);
      file.size = `${Math.max(1, Math.ceil(Buffer.byteLength(file.content) / 1024))} KB`;
      file.updated = 'Just now';
      recordAudit('Shared file edited', 'share-link', file.name);
      saveState();
      broadcast('file_updated', file);
      sendJson(response, 200, { name: file.name, content: await readObjectContent(file), permission: share.permission });
    });
    return;
  }

  if (request.method === 'DELETE' && publicShareMatch) {
    const share = state.shares.find((item) => item.token === publicShareMatch[1]);
    if (!share) { sendJson(response, 404, { error: 'Share link not found' }); return; }
    share.revokedAt = new Date().toISOString();
    recordAudit('Share link revoked', 'demo@cloudos.local', share.fileId);
    saveState();
    sendJson(response, 200, { revoked: share.token });
    return;
  }

  if (request.method === 'PATCH' && fileMatch) {
    readBody(request, async (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      const file = findFile(fileMatch[1]);
      if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
      const nextName = validateFileName(payload.name);
      if (!nextName) { sendJson(response, 400, { error: 'A file name is required' }); return; }
      file.name = nextName;
      file.updated = 'Just now';
      recordAudit('File renamed', 'demo@cloudos.local', nextName);
      saveState();
      broadcast('file_updated', file);
      sendJson(response, 200, file);
    });
    return;
  }

  if (request.method === 'DELETE' && fileMatch) {
    const file = findFile(fileMatch[1]);
    if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
    if (requestUrl.searchParams.get('permanent') === 'true') {
      state.files = state.files.filter((item) => item.id !== file.id);
      await storage.remove(objectPath(file));
      recordAudit('File permanently deleted', 'demo@cloudos.local', file.name);
      saveState();
      broadcast('file_deleted', { id: file.id, name: file.name });
      sendJson(response, 200, { deleted: file.id });
      return;
    }
    file.trashedAt = new Date().toISOString();
    recordAudit('File moved to trash', 'demo@cloudos.local', file.name);
    saveState();
    broadcast('file_updated', file);
    sendJson(response, 200, { trashed: file.id });
    return;
  }

  const restoreFileMatch = requestUrl.pathname.match(/^\/api\/files\/([^/]+)\/restore$/);
  if (request.method === 'POST' && restoreFileMatch) {
    const file = findFile(restoreFileMatch[1]);
    if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
    file.trashedAt = null;
    recordAudit('File restored from trash', 'demo@cloudos.local', file.name);
    saveState();
    broadcast('file_updated', file);
    sendJson(response, 200, file);
    return;
  }

  if (request.method === 'PUT' && fileMatch) {
    readBody(request, async (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      const file = findFile(fileMatch[1]);
      if (!file) { sendJson(response, 404, { error: 'File not found' }); return; }
      file.versions = Array.isArray(file.versions) ? file.versions : [];
      file.versions.unshift({ id: randomUUID(), content: await readObjectContent(file), createdAt: new Date().toISOString() });
      file.versions = file.versions.slice(0, 10);
      file.content = String(payload.content || '');
      await writeObjectContent(file, file.content);
      file.size = `${Math.max(1, Math.ceil(Buffer.byteLength(file.content) / 1024))} KB`;
      file.updated = 'Just now';
      recordAudit('File updated', 'demo@cloudos.local', file.name);
      saveState();
      broadcast('file_updated', file);
      sendJson(response, 200, file);
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/files') {
    readBody(request, async (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      try {
        const file = {
          id: randomUUID(),
          objectKey: randomUUID(),
          name: validateFileName(payload.name || 'Untitled.txt'),
          type: payload.type === 'folder' ? 'folder' : 'text',
          parentId: payload.parentId || null,
          size: payload.content ? `${Math.max(1, Math.ceil(Buffer.byteLength(String(payload.content)) / 1024))} KB` : '--',
          updated: 'Just now',
          content: String(payload.content || ''),
          versions: []
        };
        if (!file.name) throw new Error('A valid file name is required');
        await writeObjectContent(file, file.content);
        state.files.unshift(file);
        saveState();
        recordAudit(file.type === 'folder' ? 'Folder created' : 'File created', 'demo@cloudos.local', file.name);
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
    readBody(request, async (error, payload) => {
      if (error) { sendJson(response, 400, { error: error.message }); return; }
      state.settings = { ...state.settings, ...payload, workspaceName: String(payload.workspaceName || state.settings.workspaceName) };
      saveState();
      broadcast('settings_updated', state.settings);
      sendJson(response, 200, state.settings);
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/terminal') {
    readBody(request, async (error, payload) => {
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
  cleanupExpiredTrash().catch((error) => console.error('Trash cleanup failed:', error));
  const cleanupTimer = setInterval(() => {
    cleanupExpiredTrash().catch((error) => console.error('Trash cleanup failed:', error));
  }, cleanupIntervalMs);
  cleanupTimer.unref();
});
