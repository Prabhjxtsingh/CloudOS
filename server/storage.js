const fs = require('fs');
const path = require('path');

class LocalObjectStorage {
  constructor(root) {
    this.root = root;
    this.name = 'local';
  }

  pathFor(key) {
    return path.join(this.root, key);
  }

  ensure() {
    fs.mkdirSync(this.root, { recursive: true });
  }

  exists(key) {
    return fs.existsSync(this.pathFor(key));
  }

  read(key) {
    return fs.readFileSync(this.pathFor(key), 'utf8');
  }

  write(key, content) {
    this.ensure();
    fs.writeFileSync(this.pathFor(key), content);
  }

  remove(key) {
    try {
      fs.unlinkSync(this.pathFor(key));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function createStorage({ root, provider = process.env.CLOUDOS_STORAGE_PROVIDER || 'local' }) {
  if (provider !== 'local') {
    throw new Error(`Storage provider "${provider}" is not configured. Use CLOUDOS_STORAGE_PROVIDER=local for development.`);
  }
  return new LocalObjectStorage(root);
}

module.exports = { LocalObjectStorage, createStorage };
