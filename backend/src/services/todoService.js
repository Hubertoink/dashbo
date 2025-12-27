const { getPool } = require('../db');

const {
  getOutlookConfig,
  listOutlookConnections,
  getValidAccessTokenForConnection,
  getValidAccessToken,
} = require('./outlookService');

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

function getTodoListName() {
  return (process.env.TODO_LIST_NAME || 'Dashbo').trim() || 'Dashbo';
}

function getGraphTodoBaseUrl(version) {
  const v = String(version || '').trim() || 'v1.0';
  return `https://graph.microsoft.com/${v}`;
}

function isInvalidRequestGraphError({ respStatus, json }) {
  const code = String(json?.error?.code || '');
  const msg = String(json?.error?.message || '');
  return respStatus === 400 && (code.toLowerCase() === 'badrequest' || code.toLowerCase() === 'invalidrequest') && msg.toLowerCase().includes('invalid request');
}

async function graphJson({ accessToken, url, method = 'GET', body }) {
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await resp.json().catch(() => ({}));
  return { resp, json };
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
    return r2;
  }

  return r1;
}

async function resolveTodoListId({ accessToken, listName }) {
  const { resp, json } = await graphTodoJson({
    accessToken,
    path: '/me/todo/lists?$select=id,displayName',
  });

  if (!resp.ok) {
    const code = json?.error?.code || '';
    const msg = json?.error?.message || `todo_lists_failed (${resp.status})`;
    const err = new Error(String(msg));
    err.code = String(code);
    err.status = resp.status;
    throw err;
  }

  const items = Array.isArray(json.value) ? json.value : [];
  const target = items.find((l) => String(l.displayName || '').trim().toLowerCase() === listName.trim().toLowerCase());
  if (!target?.id) return null;
  return String(target.id);
}

async function listTodoTasks({ accessToken, listId }) {
  const qs = new URLSearchParams({
    $top: '50',
    $orderby: 'lastModifiedDateTime desc',
    $select: 'id,title,status,bodyPreview,dueDateTime,createdDateTime,lastModifiedDateTime',
  });

  const { resp, json } = await graphTodoJson({
    accessToken,
    path: `/me/todo/lists/${encodeURIComponent(listId)}/tasks?${qs.toString()}`,
  });

  if (!resp.ok) {
    const code = json?.error?.code || '';
    const msg = json?.error?.message || `todo_tasks_failed (${resp.status})`;
    const err = new Error(String(msg));
    err.code = String(code);
    err.status = resp.status;
    throw err;
  }

  const items = Array.isArray(json.value) ? json.value : [];
  return items;
}

function normalizeTodoStatus(status) {
  const s = String(status || 'notStarted');
  return s;
}

async function listTodos({ userId }) {
  // Ensure Outlook config exists; To Do piggybacks on the same OAuth.
  const cfg = getOutlookConfig({ allowMissing: true });
  if (!cfg) return { listName: getTodoListName(), items: [] };

  const listName = getTodoListName();

  // Use multi connections when available; legacy token otherwise.
  const connections = await listOutlookConnections({ userId });

  const out = [];

  async function fetchFor({ connectionId, label, color, accessToken }) {
    const listId = await resolveTodoListId({ accessToken, listName });
    if (!listId) return;

    const tasks = await listTodoTasks({ accessToken, listId });
    for (const t of tasks) {
      const taskId = t?.id ? String(t.id) : null;
      if (!taskId) continue;
      const title = t?.title ? String(t.title) : 'Todo';
      const status = normalizeTodoStatus(t?.status);
      const completed = status === 'completed';
      const dueAt = parseGraphDateTime(t?.dueDateTime) || null;
      const bodyPreview = t?.bodyPreview ? String(t.bodyPreview) : null;
      const updatedAt = t?.lastModifiedDateTime ? new Date(String(t.lastModifiedDateTime)).toISOString() : null;

      out.push({
        connectionId,
        connectionLabel: label,
        color,
        listId,
        taskId,
        title,
        status,
        completed,
        dueAt,
        bodyPreview,
        updatedAt,
      });
    }
  }

  if (connections.length > 0) {
    for (const c of connections) {
      const accessToken = await getValidAccessTokenForConnection({ userId, connectionId: c.id });
      if (!accessToken) continue;
      await fetchFor({ connectionId: c.id, label: c.displayName || c.email || 'Outlook', color: c.color, accessToken });
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

  return { listName, items: out };
}

async function updateTodo({ userId, connectionId, listId, taskId, patch }) {
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
  updateTodo,
  getTodoListName,
};
