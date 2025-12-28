const fs = require('fs');
const path = require('path');

function getUploadDir() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
}

function ensureUploadDir() {
  const dir = getUploadDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUserUploadDir(userId) {
  const base = ensureUploadDir();
  const u = Number(userId);
  if (!Number.isFinite(u) || u <= 0) return base;
  return path.join(base, `u${u}`);
}

function ensureUserUploadDir(userId) {
  const dir = getUserUploadDir(userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listImages({ userId, includeLegacyRoot = false } = {}) {
  const u = userId ? Number(userId) : null;
  const dir = u ? ensureUserUploadDir(u) : ensureUploadDir();
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const ownNames = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => allowed.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const own = u ? ownNames.map((n) => `u${u}/${n}`) : ownNames;

  if (!userId || !includeLegacyRoot) return own;

  // Optional: include legacy root uploads for smoother migrations
  const rootEntries = fs.readdirSync(ensureUploadDir(), { withFileTypes: true });
  const legacy = rootEntries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => allowed.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  // Legacy root uploads have no user prefix.
  return Array.from(new Set([...own, ...legacy]));
}

function deleteImage({ userId, filename }) {
  const u = userId ? Number(userId) : null;
  const raw = String(filename || '');
  if (!raw || raw.includes('\\') || raw.includes('..')) return { ok: false, error: 'invalid_filename' };

  // Accept either a plain filename (legacy) or a prefixed id: u<userId>/<filename>
  let name = raw;
  let dir = u ? ensureUserUploadDir(u) : ensureUploadDir();
  if (raw.includes('/')) {
    if (!u) return { ok: false, error: 'invalid_filename' };
    const prefix = `u${u}/`;
    if (!raw.startsWith(prefix)) return { ok: false, error: 'forbidden' };
    name = raw.slice(prefix.length);
    if (!name || name.includes('/') || name.includes('..')) return { ok: false, error: 'invalid_filename' };
  }

  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const ext = path.extname(name).toLowerCase();
  if (!allowed.has(ext)) return { ok: false, error: 'invalid_extension' };

  const full = path.join(dir, name);
  try {
    fs.unlinkSync(full);
    return { ok: true };
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return { ok: false, error: 'file_not_found' };
    return { ok: false, error: 'delete_failed' };
  }
}

module.exports = { getUploadDir, ensureUploadDir, getUserUploadDir, ensureUserUploadDir, listImages, deleteImage };
