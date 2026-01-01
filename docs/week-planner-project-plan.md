# 🗓️ Wochenplaner – Projektplan

## Vision
Die bestehende **WeekView** (passive Kalenderansicht) wird durch einen interaktiven **Wochenplaner** ersetzt, der der Familie ermöglicht, am Wochenanfang gemeinsam die Woche zu planen:
- Bestehende Termine auf einen Blick sehen
- Neue Termine direkt per Touch hinzufügen
- Optional: ToDos pro Tag zuweisen (wenn Outlook verbunden)

---

## 1. Kernkonzept & User-Story

| Wer | Was | Warum |
|-----|-----|-------|
| Familie am Tablet | Öffnet Wochenplaner | Übersicht über die kommende Woche |
| Nutzer | Tippt auf leeren Slot an einem Tag | Schnell neuen Termin an diesem Tag anlegen |
| Nutzer | Tippt auf bestehenden Termin | Termin bearbeiten oder löschen |
| Nutzer | Wischt horizontal | Woche vor/zurück navigieren |
| Nutzer (Outlook) | Sieht ToDos unter jedem Tag | Kann ToDo als erledigt abhaken oder neues anlegen |

---

## 2. UI-Struktur (Touch-first, Fullscreen)

```
┌──────────────────────────────────────────────────────────────────┐
│  ✕   ←  KW 2 · 6. – 12. Jan 2026                    →    Heute  │
├────────┬────────┬────────┬────────┬────────┬────────┬────────────┤
│   Mo   │   Di   │   Mi   │   Do   │   Fr   │   Sa   │   So       │
│  6.    │  7.    │  8.    │  9.    │ 10.    │ 11.    │ 12.        │
├────────┼────────┼────────┼────────┼────────┼────────┼────────────┤
│ 09:00  │        │ Arzt   │        │        │        │            │
│ Arbeit │        │ 10:00  │        │        │ Brunch │            │
│        │        │        │        │        │ 11:00  │            │
│        │ +      │        │ +      │ +      │        │ +          │
├────────┴────────┴────────┴────────┴────────┴────────┴────────────┤
│  ☐ Wocheneinkauf (Fr)   ☐ Steuer (Di)   + ToDo                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.1 Layout-Varianten

| Viewport | Darstellung |
|----------|-------------|
| Desktop/Tablet Landscape | 7 Spalten nebeneinander, Tage vollständig sichtbar |
| Tablet Portrait | 7 schmale Spalten, Termine als kompakte Karten |
| Smartphone | Horizontal scrollbar (Swipe), 2-3 Tage sichtbar |

### 2.2 Glassmorphism & Konsistenz
- Hintergrund: `bg-black/60 backdrop-blur-xl` (Fullscreen Overlay)
- Karten: `rounded-2xl border border-white/10`
- Touch-Targets: min. 44×44 px
- Animationen: Svelte `fly`, `fade`, `scale` für Modals

---

## 3. Komponenten-Architektur

```
frontend/src/lib/components/
├── WeekPlanner.svelte          ← Haupt-Komponente (Fullscreen Overlay)
├── WeekPlannerDay.svelte       ← Einzelner Tag (Spalte)
├── WeekPlannerEvent.svelte     ← Termin-Karte (touch-editable) [Phase 2]
├── WeekPlannerTodoBar.svelte   ← ToDo-Leiste am unteren Rand [Phase 3]
└── QuickAddEventModal.svelte   ← Schnell-Eingabe für neuen Termin [Phase 2]
```

### 3.1 `WeekPlanner.svelte`
**Props:**
```ts
export let selectedDate: Date;
export let events: EventDto[];
export let holidays: HolidayDto[];
export let todos: TodoItemDto[];
export let outlookConnected: boolean;
export let onEventCreated: () => void;
export let onEventUpdated: () => void;
export let onTodoToggled: () => void;
```

**Features:**
- Kalenderwochen-Berechnung (Mo–So)
- Swipe-Navigation (native touch events)
- Event-Verteilung an `WeekPlannerDay`
- Koordination Quick-Add-Modal
- Smooth open/close Animation

### 3.2 `WeekPlannerDay.svelte`
**Features:**
- Header: Wochentag + Datum + Feiertag-Badge
- Event-Liste (sortiert nach Uhrzeit)
- **"+" Button** am Ende: Touch öffnet Quick-Add mit vorausgefülltem Datum
- Optional: ToDo-Chips für diesen Tag

---

## 4. Interaktionsdesign

### 4.1 Touch-Gesten

| Geste | Aktion |
|-------|--------|
| Tap auf "+" | Quick-Add-Modal für diesen Tag |
| Tap auf Event | Event-Detail/Edit-Modal |
| Long-Press auf Event | Löschen-Bestätigung |
| Swipe links/rechts | Vorherige/nächste Woche |
| Swipe down (am Modal) | Modal schließen |

### 4.2 Visuelles Feedback
- Tap: `active:scale-95` + kurze Ripple-Animation
- Swipe: Parallax-Effekt beim Wechseln
- Saving: Skeleton/Spinner im Button
- Open/Close: `fly` + `fade` Animation

---

## 5. ToDo-Integration (Outlook) [Phase 3]

Wenn `outlookConnected === true`:

### 5.1 ToDo-Leiste
- Horizontale Liste aller offenen ToDos mit Fälligkeitsdatum
- Chip pro ToDo: `☐ Titel (Tag)` → Tap = Toggle completed
- `+ ToDo` Button rechts → öffnet `TodoModal`

### 5.2 Tages-ToDos
- ToDos mit `dueAt` an diesem Tag erscheinen unterhalb der Events
- Kompakte Darstellung: Checkbox + Titel
- Toggle direkt per Tap

---

## 6. Implementierungsplan (Phasen)

### ✅ Phase 1: Grundgerüst (DONE)
- [x] `WeekPlanner.svelte` mit 7-Tage-Grid
- [x] `WeekPlannerDay.svelte` mit Event-Rendering
- [x] Integration in `+page.svelte` als Fullscreen Overlay
- [x] Wochen-Navigation (Buttons + Swipe)
- [x] "Planer" Button im CalendarMonth Header

### 🔄 Phase 1.5: UI Polish (IN PROGRESS)
- [x] WeekView Toggle durch Planer-Icon ersetzen (kein Text)
- [x] Smooth open/close Animation für Planer
- [ ] Responsive Anpassungen für kleinere Screens

### Phase 2: Quick-Add & Edit (2-3h)
- [ ] `QuickAddEventModal.svelte` (vereinfachtes AddEventModal)
- [ ] Long-Press auf Event → Delete-Bestätigung
- [ ] Haptic Feedback (wenn verfügbar)

### Phase 3: ToDo-Integration (2h)
- [ ] `WeekPlannerTodoBar.svelte` mit Fälligkeits-ToDos
- [ ] ToDo-Chips pro Tag
- [ ] Toggle-Completed per Tap
- [ ] Quick-Add-ToDo mit Datum

### Phase 4: Polish & Responsive (1-2h)
- [ ] Responsive Breakpoints (Mobile: horizontal scroll)
- [ ] Accessibility (ARIA labels)
- [ ] Keyboard Navigation (optional)

---

## 7. Technische Details

### 7.1 Dateien

| Datei | Status |
|-------|--------|
| `frontend/src/lib/components/WeekPlanner.svelte` | ✅ Erstellt |
| `frontend/src/lib/components/WeekPlannerDay.svelte` | ✅ Erstellt |
| `frontend/src/lib/components/CalendarMonth.svelte` | ✅ Angepasst |
| `frontend/src/routes/+page.svelte` | ✅ Angepasst |
| `frontend/src/lib/components/QuickAddEventModal.svelte` | ⏳ Phase 2 |
| `frontend/src/lib/components/WeekPlannerTodoBar.svelte` | ⏳ Phase 3 |

### 7.2 Keine neuen Dependencies
- Touch-Events: Native JS `touchstart`, `touchmove`, `touchend`
- Animationen: Svelte built-in (`fly`, `fade`, `scale`)

---

## 8. Designprinzipien (Touch-first)

| Prinzip | Umsetzung |
|---------|-----------|
| **Große Touch-Targets** | Min. 44×44 px für alle interaktiven Elemente |
| **Sofortiges Feedback** | `active:scale-95`, kurze Transitions |
| **Minimale Eingaben** | Quick-Add: nur Titel + Zeit, Rest optional |
| **Kontext erhalten** | Datum aus Tap-Position vorausgefüllt |
| **Fehlertoleranz** | Undo/Bestätigung vor destruktiven Aktionen |

---

## 9. Offene Fragen / Entscheidungen

- [ ] Soll der Planer die WeekView komplett ersetzen oder parallel existieren?
  - **Entscheidung:** Ersetzt WeekView ("|" Toggle wird zu Planer-Icon)
- [ ] Sollen ToDos auch im Planer erstellt werden können?
  - **Vorschlag:** Ja, in Phase 3
- [ ] Mobile: Horizontal scrollbar oder nur 5 Tage (Mo-Fr)?
  - **Vorschlag:** Horizontal scrollbar mit allen 7 Tagen
