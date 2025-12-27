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

function listImages() {
  const dir = ensureUploadDir();
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => allowed.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function deleteImage(filename) {
  const dir = ensureUploadDir();

  const name = String(filename || '');
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return { ok: false, error: 'invalid_filename' };
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

module.exports = { getUploadDir, ensureUploadDir, listImages, deleteImage };
