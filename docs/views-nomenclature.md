# Views & Nomenklatur (Frontend)

Ziel dieser Datei: Einheitliche Begriffe und ein konsistenter Aufbau über alle UI-„Views“ hinweg, damit Produkt/Design/Dev über das Gleiche reden.

## Begriffe

- **View**: eigenständige Seite/Route (z.B. Dashboard `/`, Planner `/planner`).
- **Sub-View**: umschaltbarer Bereich innerhalb einer View (z.B. Planner: „Agenda“ vs „Monat“).
- **Mode**: ein Zustand, der die View „überblendet“/anders rendert, ohne die Route zu wechseln (z.B. Dashboard `upcomingMode`, `standbyMode`).
- **Selection / Ankerdatum**: Datum, das als Fokus dient (z.B. Planner `selectedDate`).

## View: Dashboard (Route `/`)

**User-facing Name**: „Dashboard“ (Startseite)

**Primäres Ziel**: Überblick auf großen Displays (Kalender, Widgets).

**Wichtige Zustände**

- **Kalender-Sub-View** (`viewMode`):
  - `month`: Monatsraster
  - `week`: Wochenansicht
- **Upcoming Mode** (`upcomingMode`): „Mehr anzeigen“ (zeigt „als nächstes“/Upcoming-Inhalt, ohne Route-Wechsel).
- **Standby Mode** (`standbyMode`): Energiespar-/Kiosk-Modus nach Inaktivität; Standby setzt intern auch `upcomingMode = true`.

**Trigger / Navigation**

- Toggle Upcoming: Button in `CalendarMonth` (UI: „Mehr anzeigen“ / „Zurück“).
- Auto-Standby: nach Idle-Timer (nur wenn weder Upcoming noch Standby aktiv sind).
- Exit Upcoming/Standby: Tap/Click (global capture).

**Relevante Dateien (Code-Entry)**

- Route: `frontend/src/routes/+page.svelte`
- Kalender UI: `frontend/src/lib/components/CalendarMonth.svelte`

## View: Planner (Route `/planner`)

**User-facing Name**: „Planner“ / „Wochenplaner“

**Primäres Ziel**: Termine gezielt planen und bearbeiten (mobil + desktop).

**Sub-Views**

- **Agenda**: 7-Tage Liste (Fenster beginnt bei `selectedDate`).
- **Monat**: Monatsraster (mit `monthAnchor` als Monatsfokus).

**Wichtige Begriffe im Planner**

- `selectedDate`: Startdatum des 7-Tage-Fensters in der Agenda.
- „Woche ab hier“: setzt `selectedDate` auf den jeweiligen Tag.
- Pfeile „Vorherige/Nächste Woche“: verschieben `selectedDate` um 7 Tage.

**Modals**

- „Neuer Termin“ / „Termin bearbeiten“: `AddEventModal` (wird im Planner wiederverwendet).

**Relevante Dateien (Code-Entry)**

- Route: `frontend/src/routes/planner/+page.svelte`
- Event Modal: `frontend/src/lib/components/AddEventModal.svelte`

## Mode: Upcoming (Dashboard-intern)

**Definition**: Dashboard-Modus für „als nächstes“/Upcoming-Inhalte, ohne Route-Wechsel.

**Nomenklatur (Empfehlung)**

- In Code/Issues: **Upcoming Mode** / `upcomingMode`
- In UI: lieber **„Mehr anzeigen“ / „Zurück“** (kein „Öffnen“, kein „Standby“).

## Mode: Standby (Dashboard-intern)

**Definition**: Idle-getriggerter Kiosk-/Standby-Modus (nutzt Upcoming-Layout/Pages als Basis).

**Nomenklatur (Empfehlung)**

- In Code/Issues: **Standby Mode** / `standbyMode`
- In UI: keine explizite Beschriftung nötig; Verhalten ist „Bildschirm ist im Standby, Tap zum Aufwecken“.

## Design-Aufbau (konstant halten)

- **Header/Topbar**: klarer Kontext (Datum/Range) + primäre Navigation (Toggle/Sub-View).
- **Primäre Aktion**: eindeutig benennen (z.B. „Woche ab hier“ statt „Öffnen“).
- **Selektion sichtbar machen**: aktueller Fokus (z.B. ausgewählter Tag) wird optisch markiert und hat keine irreführende Action.
- **Wochennavigation**: wenn eine View in „Fenstern“ arbeitet, dann immer explizite Range anzeigen (Start–Ende), plus konsistente Pfeile.
