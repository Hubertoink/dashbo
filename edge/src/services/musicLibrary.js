const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mm = require('music-metadata');

const DEFAULT_LIBRARY_PATH = '/mnt/music';
const DEFAULT_DATA_DIR = '/var/lib/dashbo-edge';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma']);
const COVER_CANDIDATES = [
  'cover.jpg',
  'cover.jpeg',
  'cover.png',
  'folder.jpg',
  'folder.jpeg',
  'folder.png',
  'front.jpg',
  'front.jpeg',
  'front.png',
  'album.jpg',
  'album.jpeg',
  'album.png',
  'AlbumArtSmall.jpg',
  'AlbumArt.jpg'
];

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

function makeAlbumId(artist, album) {
  return crypto
    .createHash('sha1')
    .update(`${String(artist || '').toLowerCase()}\n${String(album || '').toLowerCase()}`)
    .digest('hex');
}

function splitRelPath(relPath) {
  return normalizePathForId(relPath).split('/').filter(Boolean);
}

function deriveArtistAlbum(relPath) {
  const parts = splitRelPath(relPath);
  const artist = parts.length >= 2 ? parts[0] : 'Unbekannt';
  const album = parts.length >= 2 ? parts[1] : 'Unbekannt';
  return { artist, album };
}

function parseTrackNoAndTitle(baseName) {
  const s = String(baseName || '').trim();
  const m = s.match(/^\s*(\d{1,3})\s*[-._ )]+\s*(.+?)\s*$/);
  if (!m) return { trackNo: null, title: s };
  const n = Number(m[1]);
  return { trackNo: Number.isFinite(n) ? n : null, title: String(m[2] || s).trim() };
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) return s;
  }
  return '';
}

async function readAudioMetadata(absPath) {
  try {
    const meta = await mm.parseFile(absPath, { duration: true });
    const common = meta.common || {};
    const format = meta.format || {};

    const title = typeof common.title === 'string' ? common.title.trim() : '';
    const artist = typeof common.artist === 'string' ? common.artist.trim() : '';
    const album = typeof common.album === 'string' ? common.album.trim() : '';

    const trackNoRaw = common.track && typeof common.track.no === 'number' ? common.track.no : null;
    const trackNo = Number.isFinite(trackNoRaw) ? trackNoRaw : null;

    const yearRaw = typeof common.year === 'number' ? common.year : null;
    const year = Number.isFinite(yearRaw) ? yearRaw : null;

    const durationRaw = typeof format.duration === 'number' ? format.duration : null;
    const durationSec = Number.isFinite(durationRaw) ? Math.round(durationRaw) : null;

    return { title, artist, album, trackNo, year, durationSec };
  } catch {
    return null;
  }
}

function firstLetterKey(value) {
  const s = String(value || '').trim();
  if (!s) return '#';
  const ch = s[0].toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
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
    this._albums = new Map();
    this._scanPromise = null;

    ensureDirSync(getDataDir());

    this._tracksPath = path.join(getDataDir(), 'library.tracks.json');
    this._albumsPath = path.join(getDataDir(), 'library.albums.json');
    this._statePath = path.join(getDataDir(), 'library.state.json');

    const loadedTracks = safeJsonReadSync(this._tracksPath, []);
    if (Array.isArray(loadedTracks)) {
      for (const t of loadedTracks) {
        if (t && typeof t.id === 'string') this._tracks.set(t.id, t);
      }
    }

    const loadedAlbums = safeJsonReadSync(this._albumsPath, []);
    if (Array.isArray(loadedAlbums)) {
      for (const a of loadedAlbums) {
        if (a && typeof a.id === 'string') this._albums.set(a.id, a);
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

  listAlbums({ offset = 0, limit = 200, q = '', letter = '' } = {}) {
    const query = String(q || '').trim().toLowerCase();
    const lk = String(letter || '').trim().toUpperCase();

    const items = Array.from(this._albums.values())
      .filter((a) => {
        if (lk && lk !== 'ALL') {
          const key = firstLetterKey(a.album);
          if (lk === '#') {
            if (key !== '#') return false;
          } else if (key !== lk) {
            return false;
          }
        }

        if (!query) return true;
        const name = String(a.album || '').toLowerCase();
        const artist = String(a.artist || '').toLowerCase();
        return name.includes(query) || artist.includes(query);
      })
      .sort((a, b) => {
        const aa = `${String(a.artist)}\n${String(a.album)}`;
        const bb = `${String(b.artist)}\n${String(b.album)}`;
        return aa.localeCompare(bb);
      });

    const total = items.length;
    const slice = items.slice(offset, offset + limit);
    return { ok: true, total, offset, limit, items: slice };
  }

  getAlbum(albumId) {
    const a = this._albums.get(String(albumId || ''));
    if (!a) return null;

    const tracks = Array.from(this._tracks.values())
      .filter((t) => t.albumId === a.id)
      .sort((x, y) => {
        const ax = typeof x.trackNo === 'number' ? x.trackNo : 9999;
        const ay = typeof y.trackNo === 'number' ? y.trackNo : 9999;
        if (ax !== ay) return ax - ay;
        return String(x.relPath).localeCompare(String(y.relPath));
      });

    return { ...a, tracks };
  }

  resolveTrackAbsPath(trackId) {
    const t = this._tracks.get(String(trackId || ''));
    if (!t) return null;
    const root = getLibraryPath();
    const rel = String(t.relPath || '');
    // relPath already normalized to forward slashes; make it OS-safe
    const safeRel = rel.split('/').join(path.sep);
    return path.join(root, safeRel);
  }

  resolveAlbumCoverAbsPath(albumId) {
    const a = this._albums.get(String(albumId || ''));
    if (!a || !a.coverRelPath) return null;
    const root = getLibraryPath();
    const rel = String(a.coverRelPath || '');
    const safeRel = rel.split('/').join(path.sep);
    return path.join(root, safeRel);
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

  _persistAlbums() {
    try {
      safeJsonWriteSync(this._albumsPath, Array.from(this._albums.values()));
    } catch {
      // ignore
    }
  }

  _persistAll() {
    this._persistState();
    this._persistTracks();
    this._persistAlbums();
  }

  _recount() {
    this._state.counts = {
      tracks: this._tracks.size,
      albums: this._albums.size
    };
  }

  async _scanNow() {
    const root = getLibraryPath();

    const stat = await fs.promises.stat(root);
    if (!stat.isDirectory()) throw new Error('MUSIC_LIBRARY_PATH is not a directory');

    const nextTracks = new Map();
    const nextAlbums = new Map();

    const trackCandidates = [];

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
        const normalizedRel = normalizePathForId(relPath);
        const id = makeTrackId(normalizedRel);

        const baseName = path.basename(ent.name, ext);
        const derived = deriveArtistAlbum(normalizedRel);
        const parsed = parseTrackNoAndTitle(baseName);

        trackCandidates.push({
          id,
          full,
          normalizedRel,
          ext,
          size: st.size,
          mtimeMs: st.mtimeMs,
          baseName,
          derived,
          parsed
        });
      }
    };

    await walk(root);

    // Read metadata with limited concurrency (avoid hammering disks)
    const CONCURRENCY = 6;
    let cursor = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < trackCandidates.length) {
        const i = cursor++;
        const t = trackCandidates[i];
        if (!t) continue;
        const meta = await readAudioMetadata(t.full);

        // Keep album grouping based on folder structure so cover discovery stays reliable.
        // Use tags for display where available.
        const derivedArtist = t.derived.artist;
        const derivedAlbum = t.derived.album;

        const artist = firstNonEmpty(meta?.artist, derivedArtist);
        const album = firstNonEmpty(meta?.album, derivedAlbum);
        const title = firstNonEmpty(meta?.title, t.parsed.title, t.baseName);

        const trackNo = typeof meta?.trackNo === 'number' ? meta.trackNo : t.parsed.trackNo;
        const year = typeof meta?.year === 'number' ? meta.year : null;
        const durationSec = typeof meta?.durationSec === 'number' ? meta.durationSec : null;

        const albumId = makeAlbumId(derivedArtist, derivedAlbum);

        nextTracks.set(t.id, {
          id: t.id,
          relPath: t.normalizedRel,
          name: t.baseName,
          title,
          trackNo,
          artist,
          album,
          albumId,
          year,
          durationSec,
          ext: t.ext,
          size: t.size,
          mtimeMs: t.mtimeMs
        });

        if (!nextAlbums.has(albumId)) {
          nextAlbums.set(albumId, {
            id: albumId,
            artist: derivedArtist,
            album: derivedAlbum,
            year,
            coverRelPath: null
          });
        }
      }
    });
    await Promise.all(workers);

    // cover discovery (cheap and path-based)
    for (const a of nextAlbums.values()) {
      const albumDirRel = normalizePathForId(path.join(String(a.artist), String(a.album)));
      const candidates = COVER_CANDIDATES;
      for (const file of candidates) {
        const coverRel = normalizePathForId(path.join(albumDirRel, file));
        const abs = path.join(root, coverRel.split('/').join(path.sep));
        try {
          const st = await fs.promises.stat(abs);
          if (st.isFile()) {
            a.coverRelPath = coverRel;
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    this._tracks = nextTracks;
    this._albums = nextAlbums;
  }
}

let _singleton;

function getMusicLibrary() {
  if (!_singleton) _singleton = new MusicLibrary();
  return _singleton;
}

module.exports = { getMusicLibrary };
