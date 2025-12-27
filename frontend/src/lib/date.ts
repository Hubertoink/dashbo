export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatGermanDayLabel(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '').toUpperCase();
}

export function formatGermanShortDate(d: Date): string {
  // 02. Jan
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }).toUpperCase();
}

export function formatMonthTitle(d: Date): string {
  return d.toLocaleDateString('de-DE', { month: 'long' }).toUpperCase();
}

export function daysForMonthGrid(anchor: Date): Date[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Monday-based week: convert JS Sunday=0 to Monday=0
  const mondayIndex = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - mondayIndex);

  const grid: Date[] = [];
  const totalCells = 42; // 6 weeks
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    grid.push(d);
  }

  // Ensure the grid covers the month end (it always will with 42)
  void lastOfMonth;
  return grid;
}
