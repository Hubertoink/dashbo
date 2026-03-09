import type { OutlookConnectionDto, TodosResponseDto } from '$lib/api';

export const DASHBO_TODO_CONNECTION_ID = -1;

export type PlannerTodoAccount = {
  id: number;
  label: string;
  email: string | null;
  color?: string;
};

export function getPlannerTodoAccountLabel(connection: OutlookConnectionDto | null | undefined): string {
  if (!connection) return '';
  const name = connection.displayName || connection.email || `Outlook ${connection.id}`;
  if (connection.email && connection.displayName && connection.displayName !== connection.email) {
    return `${connection.displayName} (${connection.email})`;
  }
  return name;
}

export function buildPlannerTodoAccounts(outlookConnections: OutlookConnectionDto[]): PlannerTodoAccount[] {
  return [
    { id: DASHBO_TODO_CONNECTION_ID, label: 'Dashbo', email: null, color: 'emerald' },
    ...outlookConnections.map((connection) => ({
      id: connection.id,
      label: getPlannerTodoAccountLabel(connection),
      email: connection.email || null,
      color: connection.color
    }))
  ];
}

export function parseTodoLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function getInitialTodoCreateState(input: {
  todoListNames: string[];
  todoListName: string;
  todoAccounts: PlannerTodoAccount[];
}): { listName: string; connectionId: number } {
  const listName = (input.todoListNames.length > 0 ? input.todoListNames[0] : input.todoListName) || '';
  const connectionId = input.todoAccounts.length > 0 ? input.todoAccounts[0]!.id : DASHBO_TODO_CONNECTION_ID;
  return { listName, connectionId };
}

export function normalizeTodoMeta(todoMeta: TodosResponseDto | null | undefined): {
  todoListName: string;
  todoListNames: string[];
} {
  return {
    todoListName: todoMeta?.listName || 'Dashbo',
    todoListNames: Array.isArray(todoMeta?.listNames) ? todoMeta.listNames : []
  };
}

export function applyTodoMetaDefaults(input: {
  todoListNames: string[];
  todoListName: string;
  todoSelectedConnectionId: number | null;
  todoSelectedListName: string;
}): { todoSelectedConnectionId: number; todoSelectedListName: string } {
  return {
    todoSelectedConnectionId: input.todoSelectedConnectionId ?? DASHBO_TODO_CONNECTION_ID,
    todoSelectedListName: input.todoSelectedListName || (input.todoListNames.length > 0 ? input.todoListNames[0] : input.todoListName) || ''
  };
}