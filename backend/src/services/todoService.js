const { getPool } = require('../db');

const {
  getOutlookConfig,
  listOutlookConnections,
  getValidAccessTokenForConnection,
  getValidAccessToken,
} = require('./outlookService');

const { getUserSetting } = require('./settingsService');

const DASHBO_TODO_CONNECTION_ID = -1;
const DASHBO_TODO_CONNECTION_LABEL = 'Dashbo';
const DASHBO_TODO_CONNECTION_COLOR = 'emerald';

function isoOrNull(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dashboListIdFromName(listName) {
  return `dashbo:${String(listName || '').trim() || getTodoListName()}`;
}

function parseGraphDateTime(dt) {
  if (!dt) return null;
  const dateTime = dt.dateTime ? String(dt.dateTime) : null;
  const timeZone = dt.timeZone ? String(dt.timeZone) : null;
  if (!dateTime) return null;

  if (/Z$|[+-]\d\d:\d\d$/.test(dateTime)) {
    const d = new Date(dateTime);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (timeZone && timeZone.toUpperCase() === 'UTC') {
    const d = new Date(`${dateTime}Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(dateTime);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function graphDateTimeFromIso(iso) {
  if (!iso) return null;
  const s = String(iso);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  // Graph expects { dateTime, timeZone }. Use UTC to be deterministic.
  // dateTime should not include a timezone offset when timeZone is provided.
  const utc = d.toISOString();
  const dateTime = utc.replace(/Z$/, '');
  return { dateTime, timeZone: 'UTC' };
}

function getTodoListName() {
  return (process.env.TODO_LIST_NAME || 'Dashbo').trim() || 'Dashbo';
}

function normalizeTodoListNames(listNames) {
  const out = Array.isArray(listNames) ? listNames : [];
  const normalized = out
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 20);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [getTodoListName()];
}

function getGraphTodoBaseUrl(version) {
  const v = String(version || '').trim() || 'v1.0';
  return `https://graph.microsoft.com/${v}`;
}

function isInvalidRequestGraphError({ respStatus, json }) {
  const code = String(json?.error?.code || '');
  const msg = String(json?.error?.message || '');
  const normalizedCode = code.toLowerCase();
  const normalizedMsg = msg.toLowerCase();

  // Some accounts/tenants respond with a generic 400 invalidRequest for To Do endpoints
  // even when the endpoint exists. We treat *any* 400 with BadRequest/invalidRequest
  // as eligible for beta fallback (and other retry variants).
  if (respStatus !== 400) return false;
  if (normalizedCode !== 'badrequest' && normalizedCode !== 'invalidrequest') return false;

  // Message varies; keep this permissive.
  if (!normalizedMsg) return true;
  return normalizedMsg.includes('invalid request') || normalizedMsg.includes('invalidrequest') || normalizedMsg.includes('bad request');
}

async function graphJson({ accessToken, url, method = 'GET', body }) {
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      // Helps correlate Graph errors in logs.
      'client-request-id': `dashbo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await resp.json().catch(() => ({}));

  const requestId = resp.headers.get('request-id') || null;
  const clientRequestId = resp.headers.get('client-request-id') || null;

  return { resp, json, url, requestId, clientRequestId };
}

async function graphTodoJson({ accessToken, path, method = 'GET', body }) {
  // Try v1.0 first, fall back to beta only if Graph responds with the generic
  // BadRequest 'Invalid request' that some accounts return for To Do endpoints.
  const urlV1 = `${getGraphTodoBaseUrl('v1.0')}${path}`;
  const r1 = await graphJson({ accessToken, url: urlV1, method, body });
  if (r1.resp.ok) return r1;

  if (isInvalidRequestGraphError({ respStatus: r1.resp.status, json: r1.json })) {
    const urlBeta = `${getGraphTodoBaseUrl('beta')}${path}`;
    const r2 = await graphJson({ accessToken, url: urlBeta, method, body });
    // Attach attempts for better error diagnostics upstream.
    r2.attempts = [r1, r2];
    return r2;
  }

  r1.attempts = [r1];
  return r1;
}

async function graphTodoJsonVariants({ accessToken, paths, method = 'GET', body }) {
  const attempts = [];
  for (const path of paths) {
    const r = await graphTodoJson({ accessToken, path, method, body });
    if (Array.isArray(r.attempts)) attempts.push(...r.attempts);
    else attempts.push(r);
    if (r.resp.ok) {
      r.attempts = attempts;
      return r;
    }
  }

  // Return the last response, but keep the full attempts list.
  const last = attempts[attempts.length - 1];
  if (last) last.attempts = attempts;
  return last;
}

async function resolveTodoListId({ accessToken, listName }) {
  // Some Graph deployments return 400 invalidRequest for $select on todo lists.
  // Try a couple of variants from strict -> permissive.
  let r;
  try {
    r = await graphTodoJsonVariants({
      accessToken,
      paths: ['/me/todo/lists?$select=id,displayName', '/me/todo/lists'],
    });
  } catch (e) {
    // Network error or similar – treat as "list not available"
    console.warn('[todo] resolveTodoListId fetch error', e?.message);
    return null;
  }

  const resp = r?.resp;
  const json = r?.json;

  if (!resp?.ok) {
    // Graph error (400/401/403/etc.) – log and return null (graceful, no crash)
    const code = json?.error?.code || '';
    const msg = json?.error?.message || `todo_lists_failed (${resp?.status})`;
    console.warn('[todo] resolveTodoListId Graph error', { status: resp?.status, code, msg, listName });
    return null;
  }

  const items = Array.isArray(json.value) ? json.value : [];
  const target = items.find((l) => String(l.displayName || '').trim().toLowerCase() === listName.trim().toLowerCase());
  if (!target?.id) {
    // List with that name doesn't exist – not an error, just no todos
    return null;
  }
  return String(target.id);
}

async function listTodoTasks({ accessToken, listId }) {
  const qs = new URLSearchParams({
    $top: '50',
    $orderby: 'lastModifiedDateTime desc',
    $select:
      'id,title,status,bodyPreview,startDateTime,dueDateTime,createdDateTime,lastModifiedDateTime,completedDateTime',
  });

  // Same idea: sometimes OData options cause invalidRequest; try without them.
  const tasksPathWithQuery = `/me/todo/lists/${encodeURIComponent(listId)}/tasks?${qs.toString()}`;
  const tasksPathPlain = `/me/todo/lists/${encodeURIComponent(listId)}/tasks`;
  const r = await graphTodoJsonVariants({ accessToken, paths: [tasksPathWithQuery, tasksPathPlain] });
  const resp = r?.resp;
  const json = r?.json;

  if (!resp.ok) {
    const code = json?.error?.code || '';
    const msg = json?.error?.message || `todo_tasks_failed (${resp.status})`;
    const err = new Error(String(msg));
    err.code = String(code);
    err.status = resp.status;
    err.details = {
      listId,
      attempts: (Array.isArray(r?.attempts) ? r.attempts : [r]).map((a) => ({
        url: a?.url,
        status: a?.resp?.status,
        code: a?.json?.error?.code,
        message: a?.json?.error?.message,
        requestId: a?.requestId,
        clientRequestId: a?.clientRequestId,
      })),
    };
    throw err;
  }

  const items = Array.isArray(json.value) ? json.value : [];
  return items;
}

function normalizeTodoStatus(status) {
  const s = String(status || 'notStarted');
  return s;
}

async function listTodos({ userId, listNames }) {
  // Ensure Outlook config exists; To Do piggybacks on the same OAuth.
  const cfg = getOutlookConfig({ allowMissing: true });
  const effectiveListNames = normalizeTodoListNames(listNames);
  const out = [];

  // Always include Dashbo-local todos (works without Outlook).
  try {
    const p = getPool();
    const r = await p.query(
      `
      SELECT id, list_name, title, description, start_at, due_at, completed, completed_at, updated_at
      FROM dashbo_todos
      WHERE user_id = $1 AND list_name = ANY($2::text[])
      ORDER BY completed ASC,
        COALESCE(due_at, 'infinity'::timestamptz) ASC,
        title ASC,
        updated_at DESC
      LIMIT 200;
      `,
      [Number(userId), effectiveListNames]
    );

    for (const row of r.rows || []) {
      const listName = String(row.list_name || getTodoListName()).trim() || getTodoListName();
      out.push({
        connectionId: DASHBO_TODO_CONNECTION_ID,
        connectionLabel: DASHBO_TODO_CONNECTION_LABEL,
        color: DASHBO_TODO_CONNECTION_COLOR,
        listId: dashboListIdFromName(listName),
        taskId: String(row.id),
        title: String(row.title || 'Todo'),
        status: row.completed ? 'completed' : 'notStarted',
        completed: Boolean(row.completed),
        startAt: isoOrNull(row.start_at),
        dueAt: isoOrNull(row.due_at),
        bodyPreview: row.description != null ? String(row.description).slice(0, 200) : null,
        updatedAt: isoOrNull(row.updated_at),
        completedAt: isoOrNull(row.completed_at),
      });
    }
  } catch (e) {
    console.warn('[todo] dashbo listTodos failed', e?.message);
  }

  // If Outlook isn't configured, we still return Dashbo-local todos.
  if (!cfg) {
    out.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.title.localeCompare(b.title);
    });
    return { listName: effectiveListNames.join(', '), items: out };
  }

  // Use multi connections when available; legacy token otherwise.
  const connections = await listOutlookConnections({ userId });

  function formatConnectionLabel(c) {
    const displayName = c?.displayName ? String(c.displayName) : '';
    const email = c?.email ? String(c.email) : '';
    const base = (displayName || email || 'Outlook').trim() || 'Outlook';
    if (displayName && email && !base.toLowerCase().includes(email.toLowerCase())) {
      return `${displayName} (${email})`;
    }
    return base;
  }

  // Use multi connections when available; legacy token otherwise.

  async function fetchFor({ connectionId, label, color, accessToken }) {
    for (const listName of effectiveListNames) {
      let listId;
      try {
        listId = await resolveTodoListId({ accessToken, listName });
      } catch (e) {
        console.warn('[todo] fetchFor resolveTodoListId error', { connectionId, label, listName }, e?.message);
        continue;
      }
      if (!listId) continue; // List not found or Graph error – skip silently

      let tasks;
      try {
        tasks = await listTodoTasks({ accessToken, listId });
      } catch (e) {
        console.warn('[todo] fetchFor listTodoTasks error', { connectionId, label, listId, listName }, e?.message);
        continue;
      }

      for (const t of tasks) {
        const taskId = t?.id ? String(t.id) : null;
        if (!taskId) continue;
        const title = t?.title ? String(t.title) : 'Todo';
        const status = normalizeTodoStatus(t?.status);
        const completed = status === 'completed';
        const startAt = parseGraphDateTime(t?.startDateTime) || null;
        const dueAt = parseGraphDateTime(t?.dueDateTime) || null;
        const bodyPreview = t?.bodyPreview ? String(t.bodyPreview) : null;
        const updatedAt = t?.lastModifiedDateTime ? new Date(String(t.lastModifiedDateTime)).toISOString() : null;
        const completedAt = t?.completedDateTime ? parseGraphDateTime(t.completedDateTime) : null;

        out.push({
          connectionId,
          connectionLabel: label,
          color,
          listId,
          taskId,
          title,
          status,
          completed,
          startAt,
          dueAt,
          bodyPreview,
          updatedAt,
          completedAt,
        });
      }
    }
  }

  if (connections.length > 0) {
    for (const c of connections) {
      const accessToken = await getValidAccessTokenForConnection({ userId, connectionId: c.id });
      if (!accessToken) continue;
      await fetchFor({ connectionId: c.id, label: formatConnectionLabel(c), color: c.color, accessToken });
    }
  } else {
    const accessToken = await getValidAccessToken({ userId });
    if (accessToken) {
      await fetchFor({ connectionId: 0, label: 'Outlook', color: 'cyan', accessToken });
    }
  }

  // Sort: open first, then due date, then title
  out.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title);
  });

  return { listName: effectiveListNames.join(', '), items: out };
}

async function createDashboTodo({ userId, listName, title, description, startAt, dueAt }) {
  const p = getPool();
  const effectiveListName = String(listName || '').trim() || getTodoListName();
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) {
    const err = new Error('invalid_title');
    err.status = 400;
    throw err;
  }

  await p.query(
    `
    INSERT INTO dashbo_todos (user_id, list_name, title, description, start_at, due_at)
    VALUES ($1, $2, $3, $4, $5, $6);
    `,
    [
      Number(userId),
      effectiveListName,
      trimmedTitle,
      description == null ? null : String(description),
      startAt ? new Date(String(startAt)) : null,
      dueAt ? new Date(String(dueAt)) : null,
    ]
  );

  return { ok: true };
}

async function updateDashboTodo({ userId, taskId, patch }) {
  const p = getPool();
  const idNum = Number(taskId);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    const err = new Error('not_found');
    err.status = 404;
    throw err;
  }

  const sets = [];
  const args = [Number(userId), Math.trunc(idNum)];

  function addSet(sql, value) {
    args.push(value);
    sets.push(`${sql} = $${args.length}`);
  }

  if (patch.title != null) addSet('title', String(patch.title));
  if (patch.description !== undefined) addSet('description', patch.description == null ? null : String(patch.description));
  if (patch.startAt !== undefined) addSet('start_at', patch.startAt ? new Date(String(patch.startAt)) : null);
  if (patch.dueAt !== undefined) addSet('due_at', patch.dueAt ? new Date(String(patch.dueAt)) : null);
  if (patch.status != null) {
    const s = String(patch.status);
    const completed = s.toLowerCase() === 'completed';
    addSet('completed', completed);
    addSet('completed_at', completed ? new Date() : null);
  }

  // Nothing to update
  if (sets.length === 0) return { ok: true };

  sets.push('updated_at = NOW()');

  const q = `
    UPDATE dashbo_todos
    SET ${sets.join(', ')}
    WHERE user_id = $1 AND id = $2;
  `;
  const r = await p.query(q, args);
  if (r.rowCount === 0) {
    const err = new Error('not_found');
    err.status = 404;
    throw err;
  }

  return { ok: true };
}

async function createTodoList({ accessToken, listName }) {
  const displayName = String(listName || '').trim() || getTodoListName();
  const { resp, json } = await graphTodoJson({
    accessToken,
    path: '/me/todo/lists',
    method: 'POST',
    body: { displayName },
  });

  if (!resp.ok) {
    const code = json?.error?.code || '';
    const msg = json?.error?.message || `todo_list_create_failed (${resp.status})`;
    const err = new Error(String(msg));
    err.code = String(code);
    err.status = resp.status;
    throw err;
  }

  const id = json?.id ? String(json.id) : null;
  return id;
}

async function createTodo({ userId, connectionId, listName, title, description, startAt, dueAt }) {
  if (Number(connectionId) === DASHBO_TODO_CONNECTION_ID) {
    return createDashboTodo({ userId, listName, title, description, startAt, dueAt });
  }

  const cfg = getOutlookConfig({ allowMissing: true });
  if (!cfg) {
    // Outlook not configured; allow Dashbo-local todos when no explicit Outlook connection requested.
    if (connectionId == null) {
      return createDashboTodo({ userId, listName, title, description, startAt, dueAt });
    }
    throw new Error('outlook_not_configured');
  }

  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) {
    const err = new Error('invalid_title');
    err.status = 400;
    throw err;
  }

  const connections = await listOutlookConnections({ userId });
  const allowFallbackConnections = connectionId == null;

  const effectiveListName = String(listName || '').trim() || getTodoListName();

  async function tryCreateOnConnection(effectiveConnectionId) {
    let accessToken = null;
    if (Number(effectiveConnectionId) > 0) {
      accessToken = await getValidAccessTokenForConnection({ userId, connectionId: Number(effectiveConnectionId) });
    } else {
      accessToken = await getValidAccessToken({ userId });
    }

    if (!accessToken) {
      const err = new Error('outlook_not_connected');
      err.code = 'outlook_not_connected';
      err.status = 400;
      throw err;
    }

    let listId = await resolveTodoListId({ accessToken, listName: effectiveListName });
    if (!listId) {
      listId = await createTodoList({ accessToken, listName: effectiveListName });
    }

    if (!listId) {
      const err = new Error('todo_list_not_found');
      err.code = 'todo_list_not_found';
      err.status = 400;
      throw err;
    }

    const body = {
      title: trimmedTitle,
      ...(description != null
        ? {
            body: {
              content: String(description || ''),
              contentType: 'text',
            },
          }
        : {}),
      ...(startAt != null ? { startDateTime: graphDateTimeFromIso(startAt) } : {}),
      ...(dueAt != null ? { dueDateTime: graphDateTimeFromIso(dueAt) } : {}),
    };

    const path = `/me/todo/lists/${encodeURIComponent(String(listId))}/tasks`;
    const { resp, json } = await graphTodoJson({ accessToken, path, method: 'POST', body });

    if (!resp.ok) {
      const code = json?.error?.code || '';
      const msg = json?.error?.message || `todo_create_failed (${resp.status})`;
      const err = new Error(String(msg));
      err.code = String(code);
      err.status = resp.status;
      throw err;
    }

    return { ok: true };
  }

  function isRetryableConnectionError(err) {
    const status = Number(err?.status || 0);
    // When auto-selecting, try the next linked account for typical Graph errors.
    return status === 400 || status === 401 || status === 403 || status === 404;
  }

  async function getDefaultConnectionIdFromSettings() {
    try {
      const raw = await getUserSetting({ userId, key: 'todo.defaultConnectionId' });
      const s = raw != null ? String(raw).trim() : '';
      if (!s) return null;
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      const i = Math.trunc(n);
      if (i < DASHBO_TODO_CONNECTION_ID) return null;
      return i;
    } catch {
      return null;
    }
  }

  /** @type {number[]} */
  let candidateConnectionIds = [];
  if (connectionId != null) {
    candidateConnectionIds = [Number(connectionId)];
  } else {
    const defaultId = await getDefaultConnectionIdFromSettings();
    const connectionIds = connections.map((c) => Number(c.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (defaultId === DASHBO_TODO_CONNECTION_ID) {
      candidateConnectionIds.push(DASHBO_TODO_CONNECTION_ID);
      candidateConnectionIds.push(...connectionIds);
    } else {
      const hasDefault = defaultId != null && connectionIds.includes(Number(defaultId));
      if (hasDefault) {
        candidateConnectionIds.push(Number(defaultId));
        candidateConnectionIds.push(...connectionIds.filter((id) => id !== Number(defaultId)));
      } else {
        candidateConnectionIds.push(...connectionIds);
      }
    }

    // Legacy single-token fallback when no multi connections exist.
    if (candidateConnectionIds.length === 0) candidateConnectionIds = [0];
  }

  let lastError = null;
  for (const cid of candidateConnectionIds) {
    try {
      if (Number(cid) === DASHBO_TODO_CONNECTION_ID) {
        return createDashboTodo({ userId, listName, title, description, startAt, dueAt });
      }
      return await tryCreateOnConnection(cid);
    } catch (e) {
      lastError = e;
      if (!allowFallbackConnections) throw e;
      if (!isRetryableConnectionError(e)) throw e;
      // try next candidate
    }
  }

  throw lastError || new Error('outlook_not_connected');
}

async function updateTodo({ userId, connectionId, listId, taskId, patch }) {
  if (Number(connectionId) === DASHBO_TODO_CONNECTION_ID) {
    return updateDashboTodo({ userId, taskId, patch });
  }

  const cfg = getOutlookConfig({ allowMissing: true });
  if (!cfg) throw new Error('outlook_not_configured');

  let accessToken = null;
  if (Number(connectionId) > 0) {
    accessToken = await getValidAccessTokenForConnection({ userId, connectionId: Number(connectionId) });
  } else {
    accessToken = await getValidAccessToken({ userId });
  }

  if (!accessToken) {
    const err = new Error('outlook_not_connected');
    err.status = 400;
    throw err;
  }

  const body = {};
  if (patch.title != null) body.title = String(patch.title);
  if (patch.status != null) body.status = String(patch.status);
  if (patch.description != null) {
    body.body = {
      content: String(patch.description || ''),
      contentType: 'text',
    };
  }
  if (patch.startAt !== undefined) {
    body.startDateTime = patch.startAt ? graphDateTimeFromIso(patch.startAt) : null;
  }
  if (patch.dueAt !== undefined) {
    body.dueDateTime = patch.dueAt ? graphDateTimeFromIso(patch.dueAt) : null;
  }

  const path = `/me/todo/lists/${encodeURIComponent(String(listId))}/tasks/${encodeURIComponent(String(taskId))}`;
  const { resp, json } = await graphTodoJson({ accessToken, path, method: 'PATCH', body });

  if (!resp.ok) {
    const code = json?.error?.code || '';
    const msg = json?.error?.message || `todo_update_failed (${resp.status})`;
    const err = new Error(String(msg));
    err.code = String(code);
    err.status = resp.status;
    throw err;
  }

  return { ok: true };
}

module.exports = {
  listTodos,
  createTodo,
  updateTodo,
  getTodoListName,
  DASHBO_TODO_CONNECTION_ID,
};
