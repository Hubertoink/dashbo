const crypto = require('crypto');

const heosPidToTrack = new Map();

function normalizePid(pid) {
  const p = typeof pid === 'number' ? pid : Number(pid);
  return Number.isFinite(p) && p !== 0 ? p : null;
}

function makeHeosStreamId(trackId) {
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `${String(trackId || '')}-${Date.now()}-${randomPart}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}

function makeHeosTargetEntry(trackId, streamId) {
  return {
    trackId,
    streamId: streamId || null,
    updatedAt: Date.now(),
    lastRequestedAt: null,
    requestCount: 0,
    lastRange: null,
    lastUserAgent: null
  };
}

function setHeosTarget(pid, trackId, streamId) {
  const p = normalizePid(pid);
  const id = String(trackId || '').trim();
  if (!p) throw new Error('pid_required');
  if (!id) throw new Error('trackId_required');
  const entry = makeHeosTargetEntry(id, String(streamId || '').trim());
  heosPidToTrack.set(p, entry);
  return entry;
}

function getHeosTarget(pid) {
  const p = normalizePid(pid);
  if (!p) return null;
  return heosPidToTrack.get(p) || null;
}

function clearHeosTarget(pid) {
  const p = normalizePid(pid);
  if (!p) return false;
  return heosPidToTrack.delete(p);
}

function markHeosTargetRequest(details) {
  const pid = normalizePid(details?.pid);
  if (!pid) return { ok: true, tracked: false };

  const trackId = String(details?.trackId || '').trim();
  const streamId = String(details?.streamId || '').trim();
  const existing = heosPidToTrack.get(pid) || null;

  if (existing?.streamId && streamId && existing.streamId !== streamId) {
    return { ok: false, stale: true, pid, reason: 'stream_id_mismatch' };
  }
  if (existing?.trackId && streamId && existing.trackId !== trackId) {
    return { ok: false, stale: true, pid, reason: 'track_id_mismatch' };
  }

  const entry = existing?.trackId === trackId ? existing : makeHeosTargetEntry(trackId, streamId);
  if (streamId && !entry.streamId) entry.streamId = streamId;
  entry.lastRequestedAt = Date.now();
  entry.requestCount = Number(entry.requestCount || 0) + 1;
  entry.lastRange = details?.range ? String(details.range) : null;
  entry.lastUserAgent = details?.userAgent ? String(details.userAgent).slice(0, 180) : null;
  heosPidToTrack.set(pid, entry);

  return { ok: true, tracked: true, pid, entry };
}

function hasRequestedTarget(pid, trackId, streamId) {
  const entry = getHeosTarget(pid);
  if (!entry) return false;
  if (trackId && entry.trackId !== String(trackId)) return false;
  if (streamId && entry.streamId && entry.streamId !== String(streamId)) return false;
  return Number(entry.lastRequestedAt || 0) >= Number(entry.updatedAt || 0) && Number(entry.requestCount || 0) > 0;
}

module.exports = {
  makeHeosStreamId,
  makeHeosTargetEntry,
  setHeosTarget,
  getHeosTarget,
  clearHeosTarget,
  markHeosTargetRequest,
  hasRequestedTarget
};
