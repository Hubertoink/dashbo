const express = require('express');
const { z } = require('zod');

const { requireAuth } = require('../middleware/auth');
const { getUserSetting } = require('../services/settingsService');
const { listTodos, createTodo, updateTodo, getTodoListName } = require('../services/todoService');

const todosRouter = express.Router();

todosRouter.get('/', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);

  let configuredListNames = null;
  try {
    const raw = await getUserSetting({ userId, key: 'todo.listNames' });
    if (raw && String(raw).trim()) {
      const parsed = JSON.parse(String(raw));
      if (Array.isArray(parsed)) {
        configuredListNames = parsed
          .map((v) => String(v || '').trim())
          .filter(Boolean)
          .slice(0, 20);
      }
    }
  } catch {
    // ignore
  }

  if (!configuredListNames || configuredListNames.length === 0) {
    configuredListNames = [getTodoListName()];
  }

  try {
    const r = await listTodos({ userId, listNames: configuredListNames });
    res.json(r);
  } catch (e) {
    const status = Number(e?.status || 500);
    const code = String(e?.code || 'todo_error');
    const message = e?.message ? String(e.message) : 'todo_error';

    if (status === 401 || status === 403) {
      return res.status(400).json({
        error: 'todo_permission_missing',
        message: `Microsoft To Do Berechtigung fehlt. Bitte OUTLOOK_SCOPES um Tasks.ReadWrite erweitern und erneut verbinden. (Liste(n): ${configuredListNames.join(', ')})`,
        details: { code, status, message },
      });
    }

    if (status === 404) {
      return res.status(400).json({
        error: 'todo_not_available',
        message: `Microsoft To Do ist für dieses Konto nicht verfügbar oder die API-Antwort war 404. (Liste(n): ${configuredListNames.join(', ')})`,
        details: { code, status, message },
      });
    }

    // Graph 400 invalidRequest often means the token lacks Tasks.ReadWrite scope
    // (connection was made before scope was added) or the account type doesn't support To Do.
    if (status === 400 && (code.toLowerCase() === 'invalidrequest' || code.toLowerCase() === 'badrequest')) {
      return res.status(400).json({
        error: 'todo_scope_or_account',
        message: `Microsoft To Do API abgelehnt (400 ${code}). Bitte alle Outlook-Verbindungen trennen und erneut verbinden, damit die neuen Scopes (Tasks.ReadWrite) übernommen werden. Hinweis: Google-Konten haben keinen Zugriff auf Microsoft To Do.`,
        details: { code, status, message, listNames: configuredListNames },
      });
    }

    console.error('[todos] list failed', { userId, code, status, message, details: e?.details }, e);
    const httpStatus = status >= 400 && status < 500 ? status : 500;
    return res.status(httpStatus).json({ error: 'todo_error', message, details: { code, status } });
  }
});

todosRouter.post('/update', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);

  const schema = z.object({
    connectionId: z.number().int().nonnegative(),
    listId: z.string().min(1),
    taskId: z.string().min(1),
    title: z.string().min(1).optional(),
    completed: z.boolean().optional(),
    description: z.string().nullable().optional(),
    startAt: z.string().nullable().optional(),
    dueAt: z.string().nullable().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const patch = {};
  if (parsed.data.title != null) patch.title = parsed.data.title;
  if (parsed.data.completed != null) patch.status = parsed.data.completed ? 'completed' : 'notStarted';
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.startAt !== undefined) patch.startAt = parsed.data.startAt;
  if (parsed.data.dueAt !== undefined) patch.dueAt = parsed.data.dueAt;

  try {
    const r = await updateTodo({
      userId,
      connectionId: parsed.data.connectionId,
      listId: parsed.data.listId,
      taskId: parsed.data.taskId,
      patch,
    });

    res.json(r);
  } catch (e) {
    const status = Number(e?.status || 500);
    const code = String(e?.code || 'todo_update_error');

    if (status === 401 || status === 403) {
      return res.status(400).json({
        error: 'todo_permission_missing',
        message: `Microsoft To Do Berechtigung fehlt. Bitte OUTLOOK_SCOPES um Tasks.ReadWrite erweitern und erneut verbinden.`,
        details: { code },
      });
    }

    if (status === 404) {
      return res.status(404).json({ error: 'not_found' });
    }

    console.error('[todos] update failed', { code, status, details: e?.details }, e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

todosRouter.post('/create', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);

  const schema = z.object({
    // optional: if omitted, we pick the first available connection (or legacy token)
    connectionId: z.number().int().nonnegative().optional(),
    // optional: if omitted, we use TODO_LIST_NAME / default
    listName: z.string().min(1).optional(),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    startAt: z.string().nullable().optional(),
    dueAt: z.string().nullable().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  try {
    const r = await createTodo({
      userId,
      connectionId: parsed.data.connectionId,
      listName: parsed.data.listName || getTodoListName(),
      title: parsed.data.title,
      description: parsed.data.description,
      startAt: parsed.data.startAt,
      dueAt: parsed.data.dueAt,
    });
    res.json(r);
  } catch (e) {
    const status = Number(e?.status || 500);
    const code = String(e?.code || 'todo_create_error');

    if (status === 401 || status === 403) {
      return res.status(400).json({
        error: 'todo_permission_missing',
        message: `Microsoft To Do Berechtigung fehlt. Bitte OUTLOOK_SCOPES um Tasks.ReadWrite erweitern und erneut verbinden.`,
        details: { code },
      });
    }

    console.error('[todos] create failed', { code, status, details: e?.details }, e);
    const httpStatus = status >= 400 && status < 500 ? status : 500;
    return res.status(httpStatus).json({ error: 'todo_error', message: e?.message || 'todo_create_error' });
  }
});

module.exports = { todosRouter };
