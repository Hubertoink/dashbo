const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mm = require('music-metadata');
const nodeID3 = require('node-id3');

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

const COVER_CACHE_DIR_NAME = 'music-covers';
const COVER_CACHE_PREFIX = 'cache:';

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

function normalizeForId(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function plausibleArtist(name) {
  const s = typeof name === 'string' ? name.trim() : '';
  if (!s) return false;
  // Ignore generic folder names or numeric-only names like '36' or 'music'
  if (/^\d+$/.test(s)) return false;
  if (/^music$/i.test(s)) return false;
  if (/^various|compilation|misc/i.test(s)) return false;
  // require at least one letter
  return /[A-Za-zÄÖÜäöüß]/.test(s);
}

async function readAudioMetadata(absPath, ext) {
  try {
    // For MP3 files prefer node-id3 (fast and reliable for ID3v2/ID3v1 tags)
    const fileExt = (ext || path.extname(absPath) || '').toLowerCase();
    if (fileExt === '.mp3') {
      try {
        const tags = nodeID3.read(absPath) || {};
        const title = typeof tags.title === 'string' ? tags.title.trim() : '';
        const artist = typeof tags.artist === 'string' ? tags.artist.trim() : '';
        const album = typeof tags.album === 'string' ? tags.album.trim() : '';
        const albumartist = typeof tags.albumArtist === 'string' ? tags.albumArtist.trim() : typeof tags.albumartist === 'string' ? tags.albumartist.trim() : '';
        let trackNo = null;
        if (typeof tags.trackNumber === 'string') {
          const m = tags.trackNumber.match(/^(\d+)/);
          if (m) trackNo = Number(m[1]);
        } else if (typeof tags.trackNumber === 'number') trackNo = tags.trackNumber;
        const year = typeof tags.year === 'string' ? Number(tags.year) || null : null;
        return { title, artist, album, albumartist, trackNo, year, durationSec: null };
      } catch {
        // fallback to music-metadata below
      }
    }

    // duration=true can be very slow for large libraries because it may scan audio frames.
    // We fetch durations on-demand via the /meta endpoint when needed.
    const meta = await mm.parseFile(absPath, { duration: false });
    const common = meta.common || {};
    const format = meta.format || {};

    const title = typeof common.title === 'string' ? common.title.trim() : '';
    let artist = '';
    if (typeof common.artist === 'string') artist = common.artist.trim();
    else if (Array.isArray(common.artists) && common.artists.length) artist = common.artists.join(', ');
    else if (typeof common.performer === 'string') artist = common.performer.trim();
    artist = artist || '';

    let album = '';
    if (typeof common.album === 'string') album = common.album.trim();
    else if (typeof common.grouping === 'string') album = common.grouping.trim();
    album = album || '';

    const albumartist = typeof common.albumartist === 'string' ? common.albumartist.trim() : '';

    let trackNoRaw = common.track && typeof common.track.no === 'number' ? common.track.no : null;
    let trackNo = Number.isFinite(trackNoRaw) ? trackNoRaw : null;

    const yearRaw = typeof common.year === 'number' ? common.year : null;
    const year = Number.isFinite(yearRaw) ? yearRaw : null;

    return { title, artist, album, albumartist, trackNo, year, durationSec: null };
  } catch {
    // final fallback: try node-id3 directly for MP3s
    try {
      const tags = nodeID3.read(absPath) || {};
      const title = typeof tags.title === 'string' ? tags.title.trim() : '';
      const artist = typeof tags.artist === 'string' ? tags.artist.trim() : '';
      const album = typeof tags.album === 'string' ? tags.album.trim() : '';
      const albumartist = typeof tags.albumArtist === 'string' ? tags.albumArtist.trim() : typeof tags.albumartist === 'string' ? tags.albumartist.trim() : '';
      const trackNo = typeof tags.trackNumber === 'string' ? Number((tags.trackNumber.match(/^(\d+)/) || [null, null])[1]) : null;
      return { title, artist, album, albumartist, trackNo, year: null, durationSec: null };
    } catch {
      // ignore
    }
    return null;
  }
}

function coverCacheRelPath(albumId, mime) {
  const m = String(mime || '').toLowerCase();
  const ext = m === 'image/png' ? '.png' : m === 'image/jpeg' || m === 'image/jpg' ? '.jpg' : '';
  if (!ext) return null;
  return `${COVER_CACHE_PREFIX}${COVER_CACHE_DIR_NAME}/${albumId}${ext}`;
}

function coverCacheAbsPath(albumId, mime) {
  const rel = coverCacheRelPath(albumId, mime);
  if (!rel) return null;
  // strip prefix and build into EDGE_DATA_DIR
  const withoutPrefix = rel.slice(COVER_CACHE_PREFIX.length);
  return path.join(getDataDir(), withoutPrefix.split('/').join(path.sep));
}

async function extractEmbeddedCover(absPath) {
  const ext = (path.extname(absPath) || '').toLowerCase();

  if (ext === '.mp3') {
    try {
      const tags = nodeID3.read(absPath) || {};
      const img = tags.image;
      if (img && typeof img === 'object') {
        const mime = typeof img.mime === 'string' ? img.mime : '';
        const data = img.imageBuffer;
        if (mime && Buffer.isBuffer(data) && data.length > 0) return { mime, data };
      }
    } catch {
      // ignore
    }
  }

  try {
    const meta = await mm.parseFile(absPath, { duration: false });
    const pics = meta?.common?.picture;
    if (Array.isArray(pics) && pics.length > 0) {
      const p = pics[0];
      const mime = typeof p.format === 'string' ? p.format : '';
      const data = p.data;
      if (mime && Buffer.isBuffer(data) && data.length > 0) return { mime, data };
    }
  } catch {
    // ignore
  }

  return null;
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
      counts: { tracks: 0, albums: 0 },
      progress: null
    };

    this._tracks = new Map();
    this._albums = new Map();
    this._scanPromise = null;
    this._progressLastUpdateMs = 0;

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
      counts: this._state.counts,
      progress: this._state.progress
    };
  }

  _setProgress(patch, opts = {}) {
    const force = Boolean(opts && opts.force);
    const now = Date.now();
    if (!force && now - this._progressLastUpdateMs < 250) return;
    this._progressLastUpdateMs = now;

    const prev = this._state.progress && typeof this._state.progress === 'object' ? this._state.progress : {};
    this._state.progress = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString()
    };
  }

  async startScan(opts = { force: false }) {
    const force = Boolean(opts && opts.force);

    if (this._state.scanning && this._scanPromise) {
      if (force) {
        // schedule another scan to run after the current one finishes
        this._rescanRequested = true;
        return { ok: true, started: true, queued: true };
      }
      return { ok: true, started: false };
    }

    this._state.scanning = true;
    this._state.lastError = null;

    this._state.progress = {
      phase: 'walking',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirsDone: 0,
      filesTotal: 0,
      filesDone: 0,
      tracksBuilt: 0,
      albumsBuilt: 0,
      coversDone: 0,
      coversTotal: 0,
      currentRelPath: null
    };
    this._progressLastUpdateMs = 0;
    this._persistState();

    this._scanPromise = this._scanNow()
      .then(() => {
        this._state.lastScanAt = new Date().toISOString();
      })
      .catch((err) => {
        this._state.lastError = err instanceof Error ? err.message : String(err);
      })
      .finally(async () => {
        this._state.scanning = false;
        this._recount();

        this._setProgress(
          {
            phase: this._state.lastError ? 'error' : 'done',
            filesDone:
              typeof this._state.progress?.filesTotal === 'number'
                ? this._state.progress.filesTotal
                : typeof this._state.progress?.filesDone === 'number'
                  ? this._state.progress.filesDone
                  : 0,
            tracksBuilt: this._state.counts.tracks,
            albumsBuilt: this._state.counts.albums,
            currentRelPath: null
          },
          { force: true }
        );
        this._persistAll();
        this._scanPromise = null;

        if (this._rescanRequested) {
          // clear flag and start a fresh scan right away
          this._rescanRequested = false;
          await this.startScan();
        }
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
        const title = String(t.title || '').toLowerCase();
        const artist = String(t.artist || '').toLowerCase();
        const album = String(t.album || '').toLowerCase();
        return name.includes(query) || rel.includes(query) || title.includes(query) || artist.includes(query) || album.includes(query);
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

  async resolveAlbumCoverAbsPath(albumId) {
    const a = this._albums.get(String(albumId || ''));
    if (!a) return null;

    const rel = a.coverRelPath ? String(a.coverRelPath || '') : '';

    if (rel.startsWith(COVER_CACHE_PREFIX)) {
      const withoutPrefix = rel.slice(COVER_CACHE_PREFIX.length);
      const safeRel = withoutPrefix.split('/').join(path.sep);
      return path.join(getDataDir(), safeRel);
    }

    if (rel) {
      const root = getLibraryPath();
      const safeRel = rel.split('/').join(path.sep);
      return path.join(root, safeRel);
    }

    // On-demand embedded cover extraction (keeps full scans fast).
    const trackRel = typeof a.coverTrackRelPath === 'string' ? a.coverTrackRelPath.trim() : '';
    if (!trackRel) return null;

    const root = getLibraryPath();
    const trackAbs = path.join(root, trackRel.split('/').join(path.sep));
    const cover = await extractEmbeddedCover(trackAbs);
    if (!cover) return null;

    const cacheRel = coverCacheRelPath(a.id, cover.mime);
    const cacheAbs = coverCacheAbsPath(a.id, cover.mime);
    if (!cacheRel || !cacheAbs) return null;

    try {
      ensureDirSync(path.dirname(cacheAbs));
      await fs.promises.stat(cacheAbs);
    } catch {
      try {
        await fs.promises.writeFile(cacheAbs, cover.data);
      } catch {
        return null;
      }
    }

    a.coverRelPath = cacheRel;
    this._persistAlbums();
    return cacheAbs;
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

    // albumId -> representative track relative path for possible on-demand embedded-cover extraction
    const albumCoverTrackRel = new Map();

    const trackCandidates = [];

    this._setProgress({ phase: 'walking', dirsDone: 0, filesTotal: 0, filesDone: 0, currentRelPath: null }, { force: true });

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
        const parsed = parseTrackNoAndTitle(baseName);

        trackCandidates.push({
          id,
          full,
          normalizedRel,
          ext,
          size: st.size,
          mtimeMs: st.mtimeMs,
          baseName,
          parsed
        });

        this._setProgress({ filesTotal: trackCandidates.length, currentRelPath: normalizedRel });
      }

      this._setProgress({
        dirsDone: (typeof this._state.progress?.dirsDone === 'number' ? this._state.progress.dirsDone : 0) + 1
      });
    };

    await walk(root);

    this._setProgress({ phase: 'metadata', filesTotal: trackCandidates.length, filesDone: 0, currentRelPath: null }, { force: true });

    // Read metadata with limited concurrency (avoid hammering disks)
    const CONCURRENCY = Math.max(1, Math.min(24, Number(process.env.MUSIC_SCAN_CONCURRENCY || 8)));
    let cursor = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < trackCandidates.length) {
        const i = cursor++;
        const t = trackCandidates[i];
        if (!t) continue;

        this._setProgress({
          filesDone: i,
          filesTotal: trackCandidates.length,
          currentRelPath: t.normalizedRel,
          tracksBuilt: nextTracks.size,
          albumsBuilt: nextAlbums.size
        });
        const meta = await readAudioMetadata(t.full, t.ext);

        // Build the library purely based on tags (foobar-like). Folder names must not influence grouping.
        const tagArtist = firstNonEmpty(meta?.artist) || 'Unbekannt';
        const tagAlbum = firstNonEmpty(meta?.album);
        const tagAlbumArtist = firstNonEmpty(meta?.albumartist, meta?.artist);

        const groupingAlbum = tagAlbum || 'Singles';
        const groupingArtist = tagAlbum ? (tagAlbumArtist || tagArtist || 'Unbekannt') : (tagArtist || 'Unbekannt');

        const artist = tagArtist;
        const album = groupingAlbum;
        const title = firstNonEmpty(meta?.title, t.parsed.title, t.baseName);

        const trackNo = typeof meta?.trackNo === 'number' ? meta.trackNo : t.parsed.trackNo;
        const year = typeof meta?.year === 'number' ? meta.year : null;
        const durationSec = null;

        // Normalize keys for stable clustering (strip punctuation and collapse whitespace)
        const albumId = makeAlbumId(normalizeForId(groupingArtist), normalizeForId(groupingAlbum));

        // Remember one representative track per album for possible on-demand embedded cover extraction later.
        if (!albumCoverTrackRel.has(albumId)) {
          albumCoverTrackRel.set(albumId, t.normalizedRel);
        }

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

        // Track directory for cover discovery. normalizedRel uses forward slashes.
        const trackDirPosix = path.posix.dirname(t.normalizedRel);
        const trackDir = trackDirPosix && trackDirPosix !== '.' ? trackDirPosix : '';
        if (!nextAlbums.has(albumId)) {
          const albumEntry = {
            id: albumId,
            artist: groupingArtist,
            album: groupingAlbum,
            year,
            coverRelPath: null,
            coverTrackRelPath: albumCoverTrackRel.get(albumId) || t.normalizedRel
          };
          if (trackDir) albumEntry.memberDirs = new Set([trackDir]);
          nextAlbums.set(albumId, albumEntry);
        } else {
          const entry = nextAlbums.get(albumId);
          if (entry && entry.memberDirs && trackDir) entry.memberDirs.add(trackDir);
        }
      }
    });
    await Promise.all(workers);

    this._setProgress({ phase: 'covers', coversTotal: nextAlbums.size, coversDone: 0, currentRelPath: null }, { force: true });

    // cover discovery: search album member directories first (if available), then fallback to path-based artist/album folder
    let coverDone = 0;
    for (const a of nextAlbums.values()) {
      const candidates = COVER_CANDIDATES;

      // memberDirs may be a Set (during building)
      const dirs = Array.isArray(a.memberDirs) ? a.memberDirs : a.memberDirs ? Array.from(a.memberDirs) : [];

      // search each member dir for cover files
      let found = false;
      for (const dirRel of dirs) {
        for (const file of candidates) {
          const coverRel = normalizePathForId(path.posix.join(String(dirRel || ''), file));
          const abs = path.join(root, coverRel.split('/').join(path.sep));
          try {
            const st = await fs.promises.stat(abs);
            if (st.isFile()) {
              a.coverRelPath = coverRel;
              found = true;
              break;
            }
          } catch {
            // ignore
          }
        }
        if (found) break;
      }

      // If still not found, leave coverRelPath null.

      coverDone += 1;
      this._setProgress({ coversDone: coverDone, coversTotal: nextAlbums.size, albumsBuilt: nextAlbums.size, tracksBuilt: nextTracks.size });
    }

    // Note: embedded-cover extraction is deferred to on-demand cover requests for faster scans.

    // convert memberDirs Sets to arrays for JSON-serializable state
    for (const a of nextAlbums.values()) {
      if (a.memberDirs && a.memberDirs instanceof Set) a.memberDirs = Array.from(a.memberDirs);
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
