<script lang="ts">
  import { onMount } from 'svelte';
  import { musicPlayerState, togglePlayPause, playNext, playPrev } from '$lib/stores/musicPlayer';
  import { heosPlaybackStatus } from '$lib/stores/heosPlayback';
  import {
    EDGE_BASE_URL_KEY,
    EDGE_TOKEN_KEY,
    EDGE_HEOS_ENABLED_KEY,
    EDGE_HEOS_SELECTED_PLAYER_ID_KEY,
    EDGE_HEOS_HOSTS_KEY,
    EDGE_HEOS_SELECTED_PLAYER_NAME_KEY,
    edgeFetchJson,
    normalizeEdgeBaseUrl
  } from '$lib/edge';

  type HeosPlayerDto = { pid: number; name: string; model?: string };
  type HeosGroupPlayerDto = { name: string; pid: number; role?: 'leader' | 'member' | string };
  type HeosGroupDto = { name: string; gid: number | string; players: HeosGroupPlayerDto[] };

  // Group creation mode
  let groupingMode = false;
  let selectedForGroup: Set<number> = new Set();
  let groupBusy = false;
  let groupError: string | null = null;

  function updateHeosGroupsLineFromGroups() {
    heosGroupsLine = groups.length > 0 ? `${groups.length} Gruppen` : 'Keine Gruppen';
  }

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async function refreshGroupsUntilPidGone(pid: number, opts?: { tries?: number; delayMs?: number }) {
    const tries = Math.max(1, Math.min(10, Number(opts?.tries ?? 4)));
    const delayMs = Math.max(50, Math.min(2000, Number(opts?.delayMs ?? 350)));

    for (let i = 0; i < tries; i += 1) {
      await fetchGroups();
      const stillPresent = groups.some((g) => g.players.some((p) => p.pid === pid));
      if (!stillPresent) return;
      if (i < tries - 1) await sleep(delayMs);
    }
  }

  $: now = $musicPlayerState.now;
  $: playing = $musicPlayerState.playing;
  $: positionSec = $musicPlayerState.positionSec;
  $: durationSec = $musicPlayerState.durationSec;
  $: pct = durationSec > 0 ? Math.min(100, Math.max(0, (positionSec / durationSec) * 100)) : 0;

  $: heosExternal = $heosPlaybackStatus?.isExternal === true;
  $: heosExternalTitle = $heosPlaybackStatus?.title ? String($heosPlaybackStatus.title) : '';
  $: heosExternalArtist = $heosPlaybackStatus?.artist ? String($heosPlaybackStatus.artist) : '';
  $: heosExternalAlbum = $heosPlaybackStatus?.album ? String($heosPlaybackStatus.album) : '';
  $: heosExternalSource = $heosPlaybackStatus?.source ? String($heosPlaybackStatus.source) : '';
  $: heosExternalImageUrl = $heosPlaybackStatus?.imageUrl ? String($heosPlaybackStatus.imageUrl) : '';
  $: heosExternalSourceLabel =
    heosExternalSource && heosExternalSource.toLowerCase() !== 'station' ? heosExternalSource : '';

  $: displayArtist = now?.artist ? String(now.artist) : heosEnabled && selectedPid && heosExternal && heosExternalArtist ? heosExternalArtist : '';
  $: displayTitle = now?.title ? String(now.title) : heosEnabled && selectedPid && heosExternal && heosExternalTitle ? heosExternalTitle : '';
  $: externalSuffix = heosExternal ? ` (${(heosExternalSourceLabel || 'extern').toLowerCase()})` : '';

  let heosEnabled = false;
  let edgeBaseUrl = '';
  let edgeToken = '';
  let speakerOpen = false;
  let speakersBusy = false;
  let speakersError: string | null = null;
  let speakers: HeosPlayerDto[] = [];
  let groupsBusy = false;
  let groupsError: string | null = null;
  let groups: HeosGroupDto[] = [];
  let selectedPid = '';
  let selectedName = '';
  let heosHosts = '';
  let heosStatusLine: string | null = null;
  let heosGroupsLine: string | null = null;

  let heosVolumeBusy = false;
  let heosVolumeError: string | null = null;
  let heosVolumeLevel: number | null = null;

  function closeSpeakerModal() {
    speakerOpen = false;
    groupingMode = false;
    selectedForGroup = new Set();
    groupError = null;
  }

  function loadHeosConfig() {
    if (typeof localStorage === 'undefined') return;
    heosEnabled = localStorage.getItem(EDGE_HEOS_ENABLED_KEY) === '1';
    edgeBaseUrl = localStorage.getItem(EDGE_BASE_URL_KEY) ?? '';
    edgeToken = localStorage.getItem(EDGE_TOKEN_KEY) ?? '';
    const pidRaw = localStorage.getItem(EDGE_HEOS_SELECTED_PLAYER_ID_KEY);
    selectedPid = pidRaw ? String(pidRaw) : '';
    selectedName = localStorage.getItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY) ?? '';
    heosHosts = localStorage.getItem(EDGE_HEOS_HOSTS_KEY) ?? '';
  }

  function fmtIsoShort(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  async function fetchSpeakers(opts?: { force?: boolean }) {
    speakersError = null;
    heosStatusLine = null;
    speakersBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');

      const force = Boolean(opts?.force);
      const path = force ? '/api/heos/scan?force=1' : '/api/heos/players';

      const headers: Record<string, string> = {};
      if (heosHosts.trim()) headers['X-HEOS-HOSTS'] = heosHosts.trim();

      const r = await edgeFetchJson<any>(
        base,
        path,
        edgeToken || undefined,
        force ? { method: 'POST', headers } : { headers }
      );
      const players = Array.isArray(r?.players) ? r.players : [];
      speakers = players;

      // If we already have a pid selected, refresh the cached name.
      if (selectedPid) {
        const n = Number(selectedPid);
        const match = Array.isArray(players) ? players.find((p: any) => Number(p?.pid) === n) : null;
        if (match?.name && typeof localStorage !== 'undefined') {
          selectedName = String(match.name);
          localStorage.setItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY, selectedName);
        }
      }

      const count = Array.isArray(players) ? players.length : 0;
      const scannedAt = fmtIsoShort(r?.lastScanAt);
      const err = typeof r?.lastError === 'string' && r.lastError ? r.lastError : '';
      heosStatusLine = err
        ? `Fehler: ${err}`
        : scannedAt
          ? `${count} Speaker · Scan: ${scannedAt}`
          : `${count} Speaker`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Speaker konnten nicht geladen werden.';
      // 501 almost certainly means an outdated Edge instance is still running.
      if (String(msg).includes('501')) {
        speakersError = 'HEOS API ist auf dem Edge noch nicht aktiv (501). Bitte Edge neu starten/neu deployen.';
      } else {
        speakersError = msg;
      }
      speakers = [];
    } finally {
      speakersBusy = false;
    }
  }

  function parseHeosGroupsPayload(payload: any): HeosGroupDto[] {
    const arr = Array.isArray(payload) ? payload : [];
    return arr
      .map((g: any) => {
        const playersRaw = Array.isArray(g?.players) ? g.players : [];
        const players: HeosGroupPlayerDto[] = playersRaw
          .map((p: any) => ({
            name: String(p?.name || ''),
            pid: Number(p?.pid),
            role: p?.role ? String(p.role) : undefined
          }))
          .filter((p: any) => Number.isFinite(p.pid) && p.pid !== 0 && p.name);

        return {
          name: String(g?.name || ''),
          gid: typeof g?.gid === 'number' ? g.gid : String(g?.gid ?? ''),
          players
        } as HeosGroupDto;
      })
      .filter((g: HeosGroupDto) => g.name && String(g.gid || '').trim());
  }

  function getGroupLeaderPid(group: HeosGroupDto): number | null {
    const leader = group.players.find((p) => String(p.role || '').toLowerCase() === 'leader');
    const pid = leader?.pid ?? group.players[0]?.pid;
    return Number.isFinite(pid) && pid !== 0 ? pid : null;
  }

  async function fetchGroups() {
    groupsError = null;
    heosGroupsLine = null;
    groupsBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');

      const headers: Record<string, string> = {};
      if (heosHosts.trim()) headers['X-HEOS-HOSTS'] = heosHosts.trim();

      const r = await edgeFetchJson<any>(base, '/api/heos/groups', edgeToken || undefined, { headers });
      const payload = r?.response?.payload;
      groups = parseHeosGroupsPayload(payload);
      updateHeosGroupsLineFromGroups();
    } catch (err) {
      groupsError = err instanceof Error ? err.message : 'Gruppen konnten nicht geladen werden.';
      groups = [];
      updateHeosGroupsLineFromGroups();
    } finally {
      groupsBusy = false;
    }
  }

  async function createGroup(leaderPid: number, memberPids: number[]) {
    groupError = null;
    groupBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (heosHosts.trim()) headers['X-HEOS-HOSTS'] = heosHosts.trim();

      await edgeFetchJson<any>(base, '/api/heos/group', edgeToken || undefined, {
        method: 'POST',
        headers,
        body: JSON.stringify({ leaderPid, memberPids })
      });
      // Reset grouping mode and refresh
      groupingMode = false;
      selectedForGroup = new Set();
      // HEOS grouping state can take a moment to propagate.
      await fetchGroups();
      if (groups.length === 0) {
        await sleep(250);
        await fetchGroups();
      }
      await fetchSpeakers();
    } catch (err) {
      groupError = err instanceof Error ? err.message : 'Gruppe konnte nicht erstellt werden.';
    } finally {
      groupBusy = false;
    }
  }

  async function dissolveGroup(pid: number) {
    groupError = null;
    groupBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (heosHosts.trim()) headers['X-HEOS-HOSTS'] = heosHosts.trim();

      await edgeFetchJson<any>(base, '/api/heos/ungroup', edgeToken || undefined, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pid })
      });
    } catch (err) {
      // If HEOS is already ungrouped, a subsequent ungroup can return a generic error.
      // We'll refresh groups anyway and only surface an error if the group still exists.
      groupError = err instanceof Error ? err.message : 'Gruppe konnte nicht aufgelöst werden.';
    } finally {
      // Refresh lists (with a short retry to avoid stale UI due to HEOS propagation delays)
      await refreshGroupsUntilPidGone(pid);
      await fetchSpeakers();

      const stillPresent = groups.some((g) => g.players.some((p) => p.pid === pid));
      if (!stillPresent) {
        // Clear stale errors if the group is actually gone.
        groupError = null;
      }
      groupBusy = false;
    }
  }

  function toggleSpeakerForGroup(pid: number) {
    if (selectedForGroup.has(pid)) {
      selectedForGroup.delete(pid);
    } else {
      selectedForGroup.add(pid);
    }
    selectedForGroup = new Set(selectedForGroup); // trigger reactivity
  }

  function cancelGrouping() {
    groupingMode = false;
    selectedForGroup = new Set();
    groupError = null;
  }

  function startGrouping() {
    groupingMode = true;
    selectedForGroup = new Set();
    groupError = null;
  }

  async function confirmGrouping() {
    const pids = Array.from(selectedForGroup);
    if (pids.length < 2) {
      groupError = 'Mindestens 2 Speaker für eine Gruppe nötig.';
      return;
    }
    // First selected becomes leader
    const [leader, ...members] = pids;
    await createGroup(leader, members);
  }

  async function fetchVolumeForSelected() {
    heosVolumeError = null;
    heosVolumeLevel = null;
    const pid = Number(selectedPid);
    if (!Number.isFinite(pid) || pid === 0) return;

    heosVolumeBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');

      const headers: Record<string, string> = {};
      if (heosHosts.trim()) headers['X-HEOS-HOSTS'] = heosHosts.trim();

      const r = await edgeFetchJson<any>(base, `/api/heos/volume?pid=${encodeURIComponent(String(pid))}`, edgeToken || undefined, { headers });
      const lvl = Number.isFinite(Number(r?.level))
        ? Number(r.level)
        : Number(r?.response?.heos?.message?.parsed?.level);
      if (Number.isFinite(lvl)) heosVolumeLevel = Math.max(0, Math.min(100, Math.round(lvl)));
    } catch (err) {
      heosVolumeError = err instanceof Error ? err.message : 'Lautstärke konnte nicht geladen werden.';
    } finally {
      heosVolumeBusy = false;
    }
  }

  async function setVolumeForSelected(level: number) {
    heosVolumeError = null;
    const pid = Number(selectedPid);
    if (!Number.isFinite(pid) || pid === 0) return;

    heosVolumeBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (heosHosts.trim()) headers['X-HEOS-HOSTS'] = heosHosts.trim();

      const r = await edgeFetchJson<any>(base, '/api/heos/volume', edgeToken || undefined, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pid, level })
      });
      const applied = Number.isFinite(Number(r?.level)) ? Number(r.level) : Number(level);
      heosVolumeLevel = Math.max(0, Math.min(100, Math.round(applied)));
    } catch (err) {
      heosVolumeError = err instanceof Error ? err.message : 'Lautstärke konnte nicht gesetzt werden.';
    } finally {
      heosVolumeBusy = false;
    }
  }

  function persistSelectedPid(pid: string, nameOverride?: string) {
    try {
      if (typeof localStorage === 'undefined') return;
      const n = Number(pid);
      if (!pid || !Number.isFinite(n) || n === 0) {
        localStorage.removeItem(EDGE_HEOS_SELECTED_PLAYER_ID_KEY);
        localStorage.removeItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY);
        selectedName = '';
      } else {
        localStorage.setItem(EDGE_HEOS_SELECTED_PLAYER_ID_KEY, String(n));

        if (typeof nameOverride === 'string' && nameOverride.trim()) {
          selectedName = nameOverride.trim();
          localStorage.setItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY, selectedName);
          return;
        }

        const match = speakers.find((s) => s.pid === n);
        if (match?.name) {
          selectedName = match.name;
          localStorage.setItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY, selectedName);
        } else {
          localStorage.removeItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY);
          selectedName = '';
        }
      }
    } catch {
      // ignore
    }
  }

  async function toggleSpeakerPicker() {
    loadHeosConfig();
    speakerOpen = !speakerOpen;
    if (speakerOpen && speakers.length === 0 && !speakersBusy) {
      await fetchSpeakers({ force: true });
    }
    if (speakerOpen) {
      if (!groupsBusy) await fetchGroups();
      await fetchVolumeForSelected();
    }
  }

  onMount(() => {
    loadHeosConfig();
  });

  function fmt(sec: number) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }
</script>

<!-- Kompaktes Widget mit Cover als Teil des Rahmens -->
<div class="relative rounded-lg bg-white/5 overflow-hidden h-[88px] text-white">
  <!-- Cover als Hintergrund-Teil links (1/3 Breite) -->
  <div class="absolute inset-y-0 left-0 w-1/3">
    {#if now?.coverUrl}
      <img src={now.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent to-black/70"></div>
    {:else if heosEnabled && selectedPid && heosExternal && heosExternalImageUrl}
      <img src={heosExternalImageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent to-black/70"></div>
    {:else}
      <div class="h-full w-full bg-white/5 flex items-center justify-center">
        <svg viewBox="0 0 24 24" class="h-8 w-8 text-white/20" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      </div>
    {/if}
  </div>

  <!-- Content rechts über dem Cover hinausragend -->
  <div class="relative h-full flex items-center pl-[36%] pr-3">
    {#if now}
      <div class="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div class="text-sm font-semibold truncate leading-tight">{displayArtist ? displayArtist : 'Musik'}</div>
        <div class="text-white/50 text-xs truncate">{displayTitle ? displayTitle : '—'}</div>
        
        <!-- Progress bar -->
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-[10px] text-white/40 tabular-nums w-7">{fmt(positionSec)}</span>
          <div class="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full bg-white/30" style={`width: ${pct}%`}></div>
          </div>
          <span class="text-[10px] text-white/40 tabular-nums w-7 text-right">{durationSec > 0 ? fmt(durationSec) : '--:--'}</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex flex-col items-end gap-1 ml-2">
        {#if heosEnabled}
          {#if selectedPid}
            <div class="text-[10px] text-white/50 leading-none">HEOS: {selectedName ? selectedName : selectedPid}{externalSuffix}</div>
          {/if}
        {/if}

        <div class="flex items-center gap-1">
        <button
          type="button"
          class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
          on:click={playPrev}
          aria-label="Zurück"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
            <path d="M6 5h2v14H6V5zm14 0L10 12l10 7V5z" />
          </svg>
        </button>

        <button
          type="button"
          class="h-8 w-8 rounded-lg bg-white/15 hover:bg-white/25 inline-flex items-center justify-center"
          on:click={togglePlayPause}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {#if playing}
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M8 5v14l12-7L8 5z" />
            </svg>
          {/if}
        </button>

        <button
          type="button"
          class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
          on:click={playNext}
          aria-label="Weiter"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
            <path d="M16 5h2v14h-2V5zM4 5l10 7-10 7V5z" />
          </svg>
        </button>

        {#if heosEnabled}
          <div class="flex flex-col items-center gap-1 ml-1">
            <button
              type="button"
              class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
              on:click={toggleSpeakerPicker}
              aria-label="HEOS Speaker wählen"
              title="HEOS Speaker wählen"
            >
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
                <path d="M4 10v4c0 1.1.9 2 2 2h2l5 4V4L8 8H6c-1.1 0-2 .9-2 2zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            </button>

            <a
              class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
              href="/music"
              aria-label="Bibliothek"
              title="Bibliothek"
            >
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
              </svg>
            </a>
          </div>
        {:else}
          <!-- Bibliothek Icon-Button -->
          <a
            class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center ml-1"
            href="/music"
            aria-label="Bibliothek"
            title="Bibliothek"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
            </svg>
          </a>
        {/if}
      </div>
      </div>
    {:else}
      <div class="flex-1">
        <div class="text-white/70 text-sm font-medium">{displayArtist ? displayArtist : 'Musik'}</div>
        <div class="text-white/40 text-xs">{displayTitle ? displayTitle : 'Keine Wiedergabe'}</div>
        {#if heosEnabled && selectedPid}
          <div class="text-[10px] text-white/50 leading-none mt-1">HEOS: {selectedName ? selectedName : selectedPid}{externalSuffix}</div>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        {#if heosEnabled}
          <button
            type="button"
            class="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
            on:click={toggleSpeakerPicker}
            aria-label="HEOS Speaker wählen"
            title="HEOS Speaker wählen"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M4 10v4c0 1.1.9 2 2 2h2l5 4V4L8 8H6c-1.1 0-2 .9-2 2zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          </button>
        {/if}
        <a
          class="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
          href="/music"
          aria-label="Bibliothek"
          title="Bibliothek"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
          </svg>
        </a>
      </div>
    {/if}
  </div>

</div>

{#if heosEnabled && speakerOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50" on:click={closeSpeakerModal}>
    <div class="absolute inset-0 bg-black/55"></div>
    <div class="absolute inset-0 flex items-center justify-center p-4">
      <div
        class="w-full max-w-sm rounded-2xl bg-black/85 border border-white/10 backdrop-blur-md p-4"
        on:click|stopPropagation
      >
        <!-- Header -->
        <div class="flex items-center">
          <div class="font-medium">HEOS Speaker</div>
          <button
            class="ml-auto h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
            type="button"
            on:click={closeSpeakerModal}
          >
            Schließen
          </button>
        </div>

        <div class="text-xs text-white/60 mt-1">Wähle, auf welchem Speaker abgespielt wird.</div>

        <!-- Status line with refresh button -->
        <div class="flex items-center gap-2 mt-2">
          {#if heosStatusLine}
            <div class="text-[11px] text-white/50 flex-1">{heosStatusLine}</div>
          {/if}
          <button
            type="button"
            class="h-6 w-6 rounded-md bg-white/10 hover:bg-white/15 inline-flex items-center justify-center disabled:opacity-50"
            title="Aktualisieren"
            aria-label="Aktualisieren"
            disabled={speakersBusy || groupsBusy || groupBusy}
            on:click={async () => {
              await fetchSpeakers({ force: true });
              await fetchGroups();
              await fetchVolumeForSelected();
            }}
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 {speakersBusy || groupsBusy ? 'animate-spin' : ''}" fill="currentColor">
              <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        </div>

        <!-- Groups line -->
        {#if heosGroupsLine}
          <div class="text-[11px] text-white/50 mt-1">{heosGroupsLine}</div>
        {/if}

        <!-- Error display -->
        {#if groupError}
          <div class="text-xs text-red-300 mt-2">{groupError}</div>
        {/if}

        <div class="mt-3">
          {#if speakersBusy || groupsBusy}
            <div class="text-xs text-white/60">Lade…</div>
          {:else if speakersError || groupsError}
            <div class="text-xs text-red-300">{speakersError || groupsError}</div>
          {:else}
            <div class="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
              <!-- No speaker option (only in selection mode) -->
              {#if !groupingMode}
                <button
                  type="button"
                  class={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition ${!selectedPid ? 'bg-white/10' : ''}`}
                  on:click={() => {
                    selectedPid = '';
                    persistSelectedPid('');
                  }}
                >
                  Kein Speaker
                </button>
              {/if}

              <!-- Groups Section -->
              {#if groups.length > 0}
                <div class="px-3 py-2 text-[11px] text-white/50 border-t border-white/10 flex items-center justify-between">
                  <span>Gruppen</span>
                </div>
                {#each groups as g (String(g.gid))}
                  <div class="border-t border-white/5">
                    <div class="flex items-center hover:bg-white/10 transition">
                      <button
                        type="button"
                        class={`flex-1 px-3 py-2 text-left text-sm ${selectedName === g.name ? 'bg-white/10' : ''}`}
                        disabled={groupingMode}
                        on:click={() => {
                          if (groupingMode) return;
                          const leaderPid = getGroupLeaderPid(g);
                          if (!leaderPid) return;
                          selectedPid = String(leaderPid);
                          persistSelectedPid(selectedPid, g.name);
                          void fetchVolumeForSelected();
                        }}
                      >
                        <div class="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-white/40" fill="currentColor">
                            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                          </svg>
                          <span>{g.name}</span>
                        </div>
                        <div class="text-[10px] text-white/40 mt-0.5 pl-5">
                          {g.players.map(p => p.name).join(', ')}
                        </div>
                      </button>
                      <!-- Dissolve group button -->
                      <button
                        type="button"
                        class="h-8 w-8 mr-2 rounded-md hover:bg-red-500/20 inline-flex items-center justify-center text-white/40 hover:text-red-400 transition disabled:opacity-50"
                        title="Gruppe auflösen"
                        aria-label="Gruppe auflösen"
                        disabled={groupBusy}
                        on:click|stopPropagation={async () => {
                          const leaderPid = getGroupLeaderPid(g);
                          if (!leaderPid) return;

                          // Optimistic UI update: remove group immediately.
                          groups = groups.filter((x) => String(x.gid) !== String(g.gid));
                          updateHeosGroupsLineFromGroups();

                          await dissolveGroup(leaderPid);
                        }}
                      >
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                {/each}
              {/if}

              <!-- Speakers Section -->
              <div class="max-h-56 overflow-auto">
                <div class="px-3 py-2 text-[11px] text-white/50 border-t border-white/10 flex items-center justify-between">
                  <span>Speaker</span>
                  {#if !groupingMode && speakers.length >= 2}
                    <button
                      type="button"
                      class="text-[10px] text-cyan-400 hover:text-cyan-300"
                      on:click={startGrouping}
                    >
                      + Gruppe bilden
                    </button>
                  {/if}
                </div>
                {#each speakers as s}
                  {#if groupingMode}
                    <!-- Grouping mode: checkboxes -->
                    <label
                      class={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition cursor-pointer ${selectedForGroup.has(s.pid) ? 'bg-white/10' : ''}`}
                    >
                      <input
                        type="checkbox"
                        class="w-4 h-4 rounded border-white/30 bg-white/10 text-cyan-500 focus:ring-cyan-500/50"
                        checked={selectedForGroup.has(s.pid)}
                        on:change={() => toggleSpeakerForGroup(s.pid)}
                      />
                      <span>{s.name}</span>
                    </label>
                  {:else}
                    <!-- Normal mode: selection -->
                    <button
                      type="button"
                      class={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition ${selectedPid === String(s.pid) ? 'bg-white/10' : ''}`}
                      on:click={() => {
                        selectedPid = String(s.pid);
                        persistSelectedPid(selectedPid);
                        void fetchVolumeForSelected();
                      }}
                    >
                      {s.name}
                    </button>
                  {/if}
                {/each}
              </div>
            </div>

            <!-- Grouping mode actions -->
            {#if groupingMode}
              <div class="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
                  on:click={cancelGrouping}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  class="h-8 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium disabled:opacity-50"
                  disabled={selectedForGroup.size < 2 || groupBusy}
                  on:click={confirmGrouping}
                >
                  {groupBusy ? 'Erstelle...' : `Gruppe erstellen (${selectedForGroup.size})`}
                </button>
              </div>
              <div class="text-[10px] text-white/40 mt-2">
                Wähle mindestens 2 Speaker. Der erste wird Leader.
              </div>
            {/if}
          {/if}
        </div>

        <!-- Volume control (only when not grouping) -->
        {#if selectedPid && !groupingMode}
          <div class="mt-3">
            <div class="flex items-center justify-between">
              <div class="text-xs text-white/60">Lautstärke</div>
              <div class="text-xs text-white/50 tabular-nums">{heosVolumeLevel ?? '--'}</div>
            </div>

            {#if heosVolumeError}
              <div class="text-xs text-red-300 mt-1">{heosVolumeError}</div>
            {/if}

            <input
              class="w-full mt-2"
              type="range"
              min="0"
              max="100"
              step="1"
              value={heosVolumeLevel ?? 0}
              disabled={heosVolumeBusy}
              on:change={(e) => {
                const v = Number((e.currentTarget as HTMLInputElement).value);
                void setVolumeForSelected(v);
              }}
            />
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
