const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_LIBRARY_PATH = '/mnt/music';
const DEFAULT_DATA_DIR = '/var/lib/dashbo-edge';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma']);

function getLibraryPath() {
  return String(process.env.MUSIC_LIBRARY_PATH || DEFAULT_LIBRARY_PATH);
}

function getDataDir() {
  return String(process.env.EDGE_DATA_DIR || DEFAULT_DATA_DIR);
}

function normalizePathForId(relativePath) {
  return relativePath.replace(/\\/g, '/');
}

function makeTrackId(relativePath) {
  return crypto.createHash('sha1').update(normalizePathForId(relativePath)).digest('hex');
}

function ensureDirSync(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function safeJsonReadSync(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeJsonWriteSync(filePath, value) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

class MusicLibrary {
  constructor() {
    this._state = {
      scanning: false,
      lastScanAt: null,
      lastError: null,
      counts: { tracks: 0, albums: 0 }
    };

    this._tracks = new Map();
    this._scanPromise = null;

    ensureDirSync(getDataDir());

    this._tracksPath = path.join(getDataDir(), 'library.tracks.json');
    this._statePath = path.join(getDataDir(), 'library.state.json');

    const loadedTracks = safeJsonReadSync(this._tracksPath, []);
    if (Array.isArray(loadedTracks)) {
      for (const t of loadedTracks) {
        if (t && typeof t.id === 'string') this._tracks.set(t.id, t);
      }
    }

    const loadedState = safeJsonReadSync(this._statePath, null);
    if (loadedState && typeof loadedState === 'object') {
      this._state = {
        ...this._state,
        ...loadedState,
        counts: {
          ...this._state.counts,
          ...(loadedState.counts || {})
        }
      };
    }

    this._recount();
  }

  getStatus() {
    return {
      ok: true,
      scanning: this._state.scanning,
      lastScanAt: this._state.lastScanAt,
      lastError: this._state.lastError,
      libraryPath: getLibraryPath(),
      counts: this._state.counts
    };
  }

  async startScan() {
    if (this._state.scanning && this._scanPromise) return { ok: true, started: false };

    this._state.scanning = true;
    this._state.lastError = null;
    this._persistState();

    this._scanPromise = this._scanNow()
      .then(() => {
        this._state.lastScanAt = new Date().toISOString();
      })
      .catch((err) => {
        this._state.lastError = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        this._state.scanning = false;
        this._recount();
        this._persistAll();
        this._scanPromise = null;
      });

    return { ok: true, started: true };
  }

  listTracks({ offset = 0, limit = 100, q = '' } = {}) {
    const query = String(q || '').trim().toLowerCase();

    const items = Array.from(this._tracks.values())
      .filter((t) => {
        if (!query) return true;
        const name = String(t.name || '').toLowerCase();
        const rel = String(t.relPath || '').toLowerCase();
        return name.includes(query) || rel.includes(query);
      })
      .sort((a, b) => {
        // stable ordering by path
        return String(a.relPath).localeCompare(String(b.relPath));
      });

    const total = items.length;
    const slice = items.slice(offset, offset + limit);

    return { ok: true, total, offset, limit, items: slice };
  }

  _persistState() {
    try {
      safeJsonWriteSync(this._statePath, this._state);
    } catch {
      // ignore
    }
  }

  _persistTracks() {
    try {
      safeJsonWriteSync(this._tracksPath, Array.from(this._tracks.values()));
    } catch {
      // ignore
    }
  }

  _persistAll() {
    this._persistState();
    this._persistTracks();
  }

  _recount() {
    this._state.counts = {
      tracks: this._tracks.size,
      albums: 0
    };
  }

  async _scanNow() {
    const root = getLibraryPath();

    const stat = await fs.promises.stat(root);
    if (!stat.isDirectory()) throw new Error('MUSIC_LIBRARY_PATH is not a directory');

    const next = new Map();

    const walk = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        // Skip hidden-ish entries
        if (!ent.name || ent.name.startsWith('.')) continue;

        const full = path.join(dir, ent.name);

        if (ent.isDirectory()) {
          await walk(full);
          continue;
        }

        if (!ent.isFile()) continue;

        const ext = path.extname(ent.name).toLowerCase();
        if (!AUDIO_EXTENSIONS.has(ext)) continue;

        let st;
        try {
          st = await fs.promises.stat(full);
        } catch {
          continue;
        }

        const relPath = path.relative(root, full);
        const id = makeTrackId(relPath);

        next.set(id, {
          id,
          relPath: normalizePathForId(relPath),
          name: path.basename(ent.name, ext),
          ext,
          size: st.size,
          mtimeMs: st.mtimeMs
        });
      }
    };

    await walk(root);

    this._tracks = next;
  }
}

let _singleton;

function getMusicLibrary() {
  if (!_singleton) _singleton = new MusicLibrary();
  return _singleton;
}

module.exports = { getMusicLibrary };
