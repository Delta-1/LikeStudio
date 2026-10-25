import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

export class Store {
  constructor(directory) {
    this.dir = resolve(directory);
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const keyPath = join(this.dir, 'encryption.key');
    if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    this.key = process.env.ENCRYPTION_KEY ? createHash('sha256').update(process.env.ENCRYPTION_KEY).digest() : readFileSync(keyPath);
    this.db = new DatabaseSync(join(this.dir, 'studio.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, settings TEXT NOT NULL, secret TEXT, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL, FOREIGN KEY(workspace) REFERENCES workspaces(id));
      CREATE INDEX IF NOT EXISTS jobs_workspace ON jobs(workspace, created DESC);`);
  }
  seal(text) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  unseal(value) {
    if (!value) return null;
    const b = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', this.key, b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString('utf8');
  }
  workspace(id) {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id=?').get(id);
    return row ? { id: row.id, settings: JSON.parse(row.settings), connected: !!row.secret } : null;
  }
  createWorkspace(id) {
    this.db.prepare('INSERT INTO workspaces VALUES (?, ?, NULL, ?)').run(id, JSON.stringify({ name: '', handle: '', color: '#8b5cf6', theme: 'dark', onboarded: false }), new Date().toISOString());
    return this.workspace(id);
  }
  settings(id, patch, apiKey) {
    const current = this.workspace(id);
    this.db.prepare('UPDATE workspaces SET settings=? WHERE id=?').run(JSON.stringify({ ...current.settings, ...patch }), id);
    if (apiKey !== undefined) this.db.prepare('UPDATE workspaces SET secret=? WHERE id=?').run(apiKey ? this.seal(apiKey) : null, id);
    return this.workspace(id);
  }
  apiKey(id) { return this.unseal(this.db.prepare('SELECT secret FROM workspaces WHERE id=?').get(id)?.secret); }
  jobs(id) { return this.db.prepare('SELECT data FROM jobs WHERE workspace=? ORDER BY created DESC').all(id).map(r => JSON.parse(r.data)); }
  allJobs() { return this.db.prepare('SELECT data FROM jobs').all().map(r => JSON.parse(r.data)); }
  job(id, workspace) {
    const row = this.db.prepare('SELECT data FROM jobs WHERE id=? AND workspace=?').get(id, workspace);
    return row ? JSON.parse(row.data) : null;
  }
  save(job) {
    job.updatedAt = new Date().toISOString();
    this.db.prepare('INSERT INTO jobs VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id, job.workspace, JSON.stringify(job), job.createdAt);
    return job;
  }
  delete(id, workspace) { this.db.prepare('DELETE FROM jobs WHERE id=? AND workspace=?').run(id, workspace); }
  close() { this.db.close(); }
}
