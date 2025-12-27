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

module.exports = { getUploadDir, ensureUploadDir, listImages };
