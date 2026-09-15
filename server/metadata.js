const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

class SqliteMetadataStore {
  constructor({ dataRoot, databasePath, legacyPaths, defaultState }) {
    fs.mkdirSync(dataRoot, { recursive: true });
    this.databasePath = databasePath;
    this.legacyPaths = legacyPaths;
    this.defaultState = defaultState;
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS metadata_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
    this.ensureInitialState();
  }

  ensureInitialState() {
    const existing = this.database.prepare('SELECT id FROM metadata_state WHERE id = 1').get();
    if (existing) return;
    const state = this.readLegacyState() || structuredClone(this.defaultState);
    this.save(state);
  }

  readLegacyState() {
    for (const candidate of this.legacyPaths) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'));
      } catch {
        // Try the next legacy snapshot when this one is missing or invalid.
      }
    }
    return null;
  }

  load() {
    const row = this.database.prepare('SELECT payload FROM metadata_state WHERE id = 1').get();
    return row ? JSON.parse(row.payload) : structuredClone(this.defaultState);
  }

  save(state) {
    const payload = JSON.stringify(state);
    const transaction = this.database.prepare('INSERT INTO metadata_state (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      transaction.run(payload, new Date().toISOString());
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

function createMetadataStore({ dataRoot, statePath, stateBackupPath, defaultState }) {
  const provider = process.env.CLOUDOS_METADATA_PROVIDER || 'sqlite';
  if (provider !== 'sqlite') throw new Error(`Metadata provider "${provider}" is not configured. Use CLOUDOS_METADATA_PROVIDER=sqlite.`);
  return new SqliteMetadataStore({ dataRoot, databasePath: path.join(dataRoot, 'cloudos.sqlite'), legacyPaths: [statePath, stateBackupPath], defaultState });
}

module.exports = { SqliteMetadataStore, createMetadataStore };
