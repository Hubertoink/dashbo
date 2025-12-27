const express = require('express');
const { z } = require('zod');

const { requireAuth } = require('../middleware/auth');
const { listTodos, updateTodo, getTodoListName } = require('../services/todoService');

const todosRouter = express.Router();

todosRouter.get('/', requireAuth, async (req, res) => {
  const userId = Number(req.auth?.sub);

  try {
    const r = await listTodos({ userId });
    res.json(r);
  } catch (e) {
    const status = Number(e?.status || 500);
    const code = String(e?.code || 'todo_error');
    const message = e?.message ? String(e.message) : 'todo_error';

    if (status === 401 || status === 403) {
      return res.status(400).json({
        error: 'todo_permission_missing',
        message: `Microsoft To Do Berechtigung fehlt. Bitte OUTLOOK_SCOPES um Tasks.ReadWrite erweitern und erneut verbinden. (Liste: ${getTodoListName()})`,
        details: { code, status, message },
      });
    }

    if (status === 404) {
      return res.status(400).json({
        error: 'todo_not_available',
        message: `Microsoft To Do ist für dieses Konto nicht verfügbar oder die API-Antwort war 404. (Liste: ${getTodoListName()})`,
        details: { code, status, message },
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
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const patch = {};
  if (parsed.data.title != null) patch.title = parsed.data.title;
  if (parsed.data.completed != null) patch.status = parsed.data.completed ? 'completed' : 'notStarted';

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

module.exports = { todosRouter };
