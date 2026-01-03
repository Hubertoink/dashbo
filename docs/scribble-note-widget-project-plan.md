# 🖊️ Scribble Note Widget – Projektplan

## ✅ Status: IMPLEMENTIERT

## Vision
Ein **Scribble Note Widget** ermöglicht Familienmitgliedern, handgezeichnete Notizen direkt auf dem Dashboard zu hinterlassen. Per Touch und Stift können kleine Nachrichten, Zeichnungen oder Erinnerungen erstellt werden, die dann prominent auf dem Dashboard und im Standby-Modus angezeigt werden.

---

## 1.5 Widget-Kompakt-Modus

Da die linke Sidebar begrenzt ist, werden alle Widgets automatisch kompakter dargestellt, wenn mehr als 3 Widgets gleichzeitig aktiv sind:

| Widget | Normal-Modus | Kompakt-Modus |
|--------|--------------|---------------|
| **ToDo** | 5 Einträge | 3 Einträge |
| **News** | 3 Artikel, 10rem Höhe | 2 Artikel, 6rem Höhe |
| **Scribble** | Volle Thumbnails | Keine Thumbnails |
| **Music** | Unverändert | Unverändert |

Die Berechnung erfolgt reaktiv:
```ts
$: activeWidgetCount = [
  todoEnabled && outlookConnected,
  newsEnabled,
  scribbleEnabled,
  musicWidgetEnabled
].filter(Boolean).length;
$: compactWidgets = activeWidgetCount > 3;
```

---

## 1. Kernkonzept & User-Story

| Wer | Was | Warum |
|-----|-----|-------|
| Familienmitglied | Tippt auf "Neue Notiz" Widget-Button | Möchte schnelle Nachricht hinterlassen |
| Nutzer | Zeichnet mit Finger/Stift auf Canvas | Handschriftliche, persönliche Nachricht |
| Nutzer | Wählt Stiftfarbe aus Palette | Bunte, individuelle Gestaltung |
| Familie | Sieht Notiz auf Dashboard & Standby | Kommunikation ohne Handy/Zettel |
| Nutzer | Löscht alte Notiz | Platz für neue Nachricht |

---

## 2. Technische Architektur

### 2.1 Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  ScribbleWidget.svelte          ← Dashboard-Anzeige             │
│  ScribbleCanvas.svelte          ← Zeichenfläche (Touch/Stylus)  │
│  ScribbleModal.svelte           ← Fullscreen Zeichen-Overlay    │
│  ScribbleStandby.svelte         ← Standby-Ansicht (optional)    │
├─────────────────────────────────────────────────────────────────┤
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  routes/scribbles.js            ← REST API Endpunkte            │
│  services/scribblesService.js   ← Business-Logik                │
│  db.js                          ← Tabelle: scribbles            │
├─────────────────────────────────────────────────────────────────┤
│                        DATENBANK                                 │
├─────────────────────────────────────────────────────────────────┤
│  scribbles (id, user_id, image_data, created_at, expires_at)   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Datenbank-Schema

```sql
CREATE TABLE IF NOT EXISTS scribbles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,              -- Base64-kodiertes PNG/WebP
  author_name TEXT,                       -- Optional: Name des Erstellers
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                 -- Optional: Auto-Löschung
  pinned BOOLEAN NOT NULL DEFAULT FALSE   -- Angepinnte Notizen bleiben oben
);

CREATE INDEX IF NOT EXISTS scribbles_user_id_idx ON scribbles (user_id);
CREATE INDEX IF NOT EXISTS scribbles_created_at_idx ON scribbles (created_at DESC);
```

### 2.3 API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/api/scribbles` | Alle aktiven Scribbles des Users abrufen |
| `POST` | `/api/scribbles` | Neues Scribble erstellen (Base64 Image) |
| `DELETE` | `/api/scribbles/:id` | Scribble löschen |
| `PATCH` | `/api/scribbles/:id/pin` | Scribble anpinnen/lösen |

---

## 3. UI-Struktur

### 3.1 Dashboard-Widget (ScribbleWidget.svelte)

```
┌─────────────────────────────────────────┐
│  📝 Notizen                    [+ Neu]  │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │   [Handgezeichnete Notiz]       │    │
│  │                                 │    │
│  │         - Mama, 14:32 -         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌───────┐ ┌───────┐ ┌───────┐         │
│  │ Mini  │ │ Mini  │ │ Mini  │   ...   │
│  └───────┘ └───────┘ └───────┘         │
└─────────────────────────────────────────┘
```

**Features:**
- Neueste Notiz groß angezeigt
- Ältere Notizen als Thumbnails (klickbar zum Vergrößern)
- "Neu"-Button öffnet Zeichen-Modal
- Swipe/Scroll durch mehrere Notizen

### 3.2 Zeichen-Modal (ScribbleModal.svelte)

```
┌─────────────────────────────────────────────────────────────────┐
│  ✕                     Neue Notiz                        💾     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                    [CANVAS ZEICHENFLÄCHE]                │  │
│  │                      400 x 300 px                        │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⬜  │  ✏️ S/M/L  │  🗑️ Clear  │  ↩️ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Toolbar-Features:**
- **Farbpalette:** 8+ Farben (rot, orange, gelb, grün, blau, lila, schwarz, weiß)
- **Stiftgröße:** S (2px), M (5px), L (10px)
- **Radierer:** Zum Korrigieren
- **Clear:** Komplettes Canvas löschen
- **Undo:** Letzten Strich rückgängig

### 3.3 Standby-Ansicht

Im Standby-Modus wird die neueste (oder angepinnte) Notiz prominent angezeigt:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    [Handgezeichnete Notiz]                      │
│                                                                  │
│                      "Vergiss nicht: Milch!"                    │
│                         - Papa, 08:15 -                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Komponenten-Architektur

### 4.1 Neue Dateien

```
frontend/src/lib/components/
├── ScribbleWidget.svelte         ← Widget für Dashboard-Sidebar
├── ScribbleCanvas.svelte         ← Wiederverwendbare Canvas-Komponente
├── ScribbleModal.svelte          ← Fullscreen Zeichen-Overlay
├── ScribbleViewer.svelte         ← Großansicht einer Notiz

backend/src/routes/
├── scribbles.js                  ← API-Router

backend/src/services/
├── scribblesService.js           ← DB-Operationen
```

### 4.2 Frontend-Komponenten

#### `ScribbleCanvas.svelte`
```ts
// Props
export let width = 400;
export let height = 300;
export let strokeColor = '#000000';
export let strokeWidth = 5;
export let backgroundColor = 'transparent';

// Events
dispatch('save', { imageData: string });  // Base64 PNG
dispatch('change');                        // Canvas wurde modifiziert
```

**Implementierung:**
- HTML5 `<canvas>` Element
- Touch Events: `touchstart`, `touchmove`, `touchend`
- Mouse Events als Fallback: `mousedown`, `mousemove`, `mouseup`
- Pointer Events für Stylus-Unterstützung: `pointerdown`, `pointermove`, `pointerup`
- Drucksensitivität bei Stylus (optional)

#### `ScribbleWidget.svelte`
```ts
// Props
export let expanded = false;
export let onToggleExpand: (() => void) | null = null;

// State
let scribbles: ScribbleDto[] = [];
let activeIndex = 0;
let modalOpen = false;
```

#### `ScribbleModal.svelte`
```ts
// Props
export let open = false;
export let onClose: () => void;
export let onSave: (imageData: string) => Promise<void>;

// State
let color = '#000000';
let size: 'S' | 'M' | 'L' = 'M';
let history: ImageData[] = [];  // Für Undo
```

### 4.3 Backend-Service

#### `scribblesService.js`
```js
async function listScribbles({ userId, limit = 10 }) { ... }
async function createScribble({ userId, imageData, authorName }) { ... }
async function deleteScribble({ userId, scribbleId }) { ... }
async function pinScribble({ userId, scribbleId, pinned }) { ... }
async function cleanupExpiredScribbles() { ... }  // Cron-Job
```

---

## 5. Integration in bestehendes Dashboard

### 5.1 Dashboard (+page.svelte)

**Änderungen:**
1. Import `ScribbleWidget` Komponente
2. State für `scribbleEnabled` (aus Settings)
3. Widget in linker Sidebar einfügen (nach TodoWidget/NewsWidget)
4. Im Standby-Modus: Neueste Notiz anzeigen

**Position im Layout:**
```svelte
<!-- Left sidebar (existing) -->
<div class="w-[34%] min-w-[320px] hidden md:flex flex-col p-10 h-screen">
  <WeatherWidget />
  
  {#if todoEnabled}
    <TodoWidget />
  {/if}
  
  {#if newsEnabled}
    <ZeitNewsWidget />
  {/if}
  
  <!-- NEU: Scribble Widget -->
  {#if scribbleEnabled}
    <ScribbleWidget />
  {/if}
  
  {#if musicWidgetEnabled}
    <MusicWidget />
  {/if}
  
  <Clock />
</div>
```

### 5.2 Standby-Modus

**Änderungen in Standby-Bereich:**
```svelte
{#if standbyMode}
  <div class="h-full flex">
    <div class="hidden md:flex w-[34%] flex-col justify-between p-10">
      <!-- Existing: ToDo, Forecast -->
      
      <!-- NEU: Scribble Anzeige -->
      {#if scribbleEnabled && latestScribble}
        <div class="mt-4">
          <img 
            src={latestScribble.imageData} 
            alt="Notiz" 
            class="max-w-full rounded-xl shadow-lg"
          />
          <div class="text-white/60 text-sm mt-2">
            {latestScribble.authorName} · {formatTime(latestScribble.createdAt)}
          </div>
        </div>
      {/if}
    </div>
    <!-- ... rest of standby -->
  </div>
{/if}
```

### 5.3 Settings

**Neuer Toggle in DashboardSection:**
```svelte
<WidgetSettingsCard 
  label="Scribble Notizen" 
  bind:enabled={scribbleEnabled}
  on:save={saveScribbleEnabled}
/>
```

---

## 6. Implementierungsplan (Phasen)

### Phase 1: Backend & Datenbank (2-3h)
- [ ] Datenbank-Migration in `db.js` (scribbles Tabelle)
- [ ] `scribblesService.js` mit CRUD-Operationen
- [ ] `routes/scribbles.js` mit REST-Endpunkten
- [ ] API-Integration in `app.js`
- [ ] DTOs in `frontend/src/lib/api.ts`

### Phase 2: Canvas-Komponente (3-4h)
- [ ] `ScribbleCanvas.svelte` mit Touch/Mouse/Pointer Events
- [ ] Farbauswahl & Stiftgröße
- [ ] Undo-Funktionalität (Stroke-History)
- [ ] Export als Base64 PNG
- [ ] Drucksensitivität für Stylus (optional)

### Phase 3: Modal & Widget (2-3h)
- [ ] `ScribbleModal.svelte` mit Toolbar
- [ ] `ScribbleWidget.svelte` für Dashboard
- [ ] Thumbnail-Galerie für ältere Notizen
- [ ] Löschen & Anpinnen

### Phase 4: Dashboard-Integration (2h)
- [ ] Import & State in `+page.svelte`
- [ ] Settings-Toggle für Widget
- [ ] Responsive Layout-Anpassungen

### Phase 5: Standby-Integration (1-2h)
- [ ] Neueste Notiz im Standby anzeigen
- [ ] Animations & Übergänge
- [ ] Rotation bei mehreren Notizen (optional)

### Phase 6: Polish & Extras (2h)
- [ ] Bessere Touch-Performance (requestAnimationFrame)
- [ ] Visuelles Feedback beim Zeichnen
- [ ] Autoren-Auswahl (Personen-Dropdown)
- [ ] Auto-Expire nach X Tagen (optional)
- [ ] Accessibility (ARIA labels)

---

## 7. Technische Details

### 7.1 Canvas-Implementierung

```typescript
// Touch-Event Handler
function handlePointerDown(e: PointerEvent) {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  
  // Pressure sensitivity (0-1)
  const pressure = e.pressure || 0.5;
  currentWidth = baseWidth * (0.5 + pressure);
}

function handlePointerMove(e: PointerEvent) {
  if (!isDrawing) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  
  lastX = x;
  lastY = y;
}
```

### 7.2 Base64-Export

```typescript
function exportCanvas(): string {
  return canvas.toDataURL('image/png');
  // Alternativ WebP für kleinere Dateien:
  // return canvas.toDataURL('image/webp', 0.8);
}
```

### 7.3 Speicher-Optimierung

- **Kompression:** WebP statt PNG (50-80% kleiner)
- **Maximale Größe:** Canvas auf 800x600 begrenzen
- **Limit:** Max. 10 Scribbles pro User (älteste werden gelöscht)
- **TTL:** Optionales Auto-Expire nach 7 Tagen

---

## 8. Dateien-Übersicht

| Datei | Status | Beschreibung |
|-------|--------|--------------|
| `backend/src/db.js` | ⏳ Phase 1 | Migration: scribbles Tabelle |
| `backend/src/services/scribblesService.js` | ⏳ Phase 1 | Erstellen |
| `backend/src/routes/scribbles.js` | ⏳ Phase 1 | Erstellen |
| `backend/src/app.js` | ⏳ Phase 1 | Router einbinden |
| `frontend/src/lib/api.ts` | ⏳ Phase 1 | DTOs & Fetch-Funktionen |
| `frontend/src/lib/components/ScribbleCanvas.svelte` | ⏳ Phase 2 | Erstellen |
| `frontend/src/lib/components/ScribbleModal.svelte` | ⏳ Phase 3 | Erstellen |
| `frontend/src/lib/components/ScribbleWidget.svelte` | ⏳ Phase 3 | Erstellen |
| `frontend/src/lib/components/ScribbleViewer.svelte` | ⏳ Phase 3 | Erstellen (optional) |
| `frontend/src/routes/+page.svelte` | ⏳ Phase 4 | Widget einbinden |
| `frontend/src/lib/components/settings/DashboardSection.svelte` | ⏳ Phase 4 | Toggle hinzufügen |
| `frontend/src/routes/settings/+page.svelte` | ⏳ Phase 4 | State & Handler |

---

## 9. Keine neuen Dependencies nötig

- **Canvas:** Native HTML5 Canvas API
- **Touch Events:** Native Pointer Events API
- **Animationen:** Svelte built-in (`fly`, `fade`, `scale`)
- **Kompression:** Native `canvas.toDataURL()`

---

## 10. Offene Fragen & Erweiterungen

### Zukünftige Features (v2)
- [ ] Mehrere Stifte gleichzeitig (Multiplayer-Zeichnen)
- [ ] Sticker/Emojis einfügen
- [ ] Text-Layer über Zeichnung
- [ ] Farb-Pipette
- [ ] Hintergrundfarbe wählbar
- [ ] Export als Bild-Datei
- [ ] Teilen per Link

### Design-Entscheidungen
- Soll das Widget expandierbar sein wie TodoWidget? **→ Ja, empfohlen**
- Maximale Anzahl Notizen pro User? **→ 10 vorgeschlagen**
- Auto-Löschung nach X Tagen? **→ Optional, 7 Tage Default**
- Welche Personen können zeichnen? **→ Alle authentifizierten User**

---

## 11. Mockups

### Dashboard (Normal)
```
┌──────────────────┐   ┌─────────────────────────────┐
│  ☀️ 8°C Wolken   │   │       KALENDER              │
│                  │   │                             │
├──────────────────┤   │     Januar 2026             │
│  📝 Notizen [+]  │   │  Mo Di Mi Do Fr Sa So       │
│  ┌────────────┐  │   │  ...                        │
│  │ Vergiss    │  │   │                             │
│  │ Milch! 🥛  │  │   ├─────────────────────────────┤
│  │  - Papa    │  │   │       TERMINE HEUTE         │
│  └────────────┘  │   │  09:00 Meeting              │
│                  │   │  14:00 Arzt                 │
├──────────────────┤   │                             │
│  🎵 Music        │   │                             │
├──────────────────┤   │                             │
│  🕐 14:32        │   │                             │
└──────────────────┘   └─────────────────────────────┘
```

### Standby-Modus
```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌─────────────────┐                                             │
│  │  📋 ToDo        │        Termine                              │
│  │  ☐ Einkaufen    │        ───────                              │
│  │  ☐ Wäsche       │        09:00 Meeting                        │
│  └─────────────────┘        14:00 Arzt                           │
│                             18:00 Sport                          │
│  ┌─────────────────┐                                             │
│  │ [Scribble]      │        ─────────────────────────            │
│  │  Vergiss Milch! │                                             │
│  │   - Papa 08:15  │        📰 News: Wetter wird besser         │
│  └─────────────────┘                                             │
│                                                                   │
│  Samstag, 3. Januar 2026                                         │
│  14:32                                                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 12. Fazit

Das Scribble Note Widget fügt sich nahtlos in die bestehende Dashboard-Architektur ein:
- **Backend:** Folgt dem Muster von `todos.js`, `events.js`
- **Frontend:** Gleiche Widget-Struktur wie `TodoWidget`, `NewsWidget`
- **Styling:** Konsistentes Glassmorphism-Design
- **Touch:** Nutzt etablierte Pointer Events API
- **Performance:** Keine externen Libraries, natives Canvas

**Geschätzter Gesamtaufwand:** 12-16 Stunden
