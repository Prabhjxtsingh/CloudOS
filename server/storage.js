const fs = require('fs');
const path = require('path');
const { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

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

class S3ObjectStorage {
  constructor({ bucket, prefix = '', endpoint, region = 'us-east-1', accessKeyId, secretAccessKey, forcePathStyle = false }) {
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('S3 storage requires CLOUDOS_S3_BUCKET, CLOUDOS_S3_ACCESS_KEY_ID, and CLOUDOS_S3_SECRET_ACCESS_KEY');
    }
    this.bucket = bucket;
    this.prefix = prefix.replace(/^\/+|\/+$/g, '');
    this.name = 's3';
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey }
    });
  }

  keyFor(key) {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async exists(key) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }));
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  async read(key) {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }));
    return response.Body.transformToString();
  }

  async write(key, content) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.keyFor(key),
      Body: content,
      ContentType: 'text/plain; charset=utf-8'
    }));
  }

  async remove(key) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }));
  }
}

function createStorage({ root, provider = process.env.CLOUDOS_STORAGE_PROVIDER || 'local' }) {
  if (provider === 'local') return new LocalObjectStorage(root);
  if (provider === 's3') {
    return new S3ObjectStorage({
      bucket: process.env.CLOUDOS_S3_BUCKET,
      prefix: process.env.CLOUDOS_S3_PREFIX,
      endpoint: process.env.CLOUDOS_S3_ENDPOINT,
      region: process.env.CLOUDOS_S3_REGION,
      accessKeyId: process.env.CLOUDOS_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDOS_S3_SECRET_ACCESS_KEY,
      forcePathStyle: process.env.CLOUDOS_S3_FORCE_PATH_STYLE === 'true'
    });
  }
  throw new Error(`Storage provider "${provider}" is not configured. Use CLOUDOS_STORAGE_PROVIDER=local or s3.`);
}

module.exports = { LocalObjectStorage, S3ObjectStorage, createStorage };
