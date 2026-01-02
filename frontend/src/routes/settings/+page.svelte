<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import {
    login,
    setToken,
    getStoredToken,
    fetchSettings,
    setBackground,
    deleteBackgroundImage,
    fetchOutlookStatus,
    listOutlookConnections,
    getOutlookAuthUrl,
    disconnectOutlook,
    disconnectOutlookConnection,
    setOutlookConnectionColor,
    listUsers,
    createUser,
    deleteUser,
    resetUserPassword,
    setWeatherLocation,
    setHolidaysEnabled,
    setTodoEnabled,
    setTodoListNames,
    setNewsEnabled,
    setNewsFeeds,
    setClockStyle,
    uploadBackgroundWithProgress,
    setBackgroundRotateEnabled,
    listTags,
    createTag,
    deleteTag,
    listPersons,
    createPerson,
    deletePerson,
    type SettingsDto,
    type UserDto,
    type TagDto,
    type TagColorKey,
    type PersonDto,
    type PersonColorKey,
    type OutlookStatusDto
    , type OutlookConnectionDto
  } from '$lib/api';

  import { normalizeClockStyle, type ClockStyle } from '$lib/clockStyle';

  import {
    EDGE_PLAYER_WIDGET_ENABLED_KEY,
    EDGE_HEOS_ENABLED_KEY,
    EDGE_HEOS_HOSTS_KEY,
    edgeHealth,
    MIN_EDGE_API_VERSION,
    normalizeEdgeBaseUrl,
    edgeFetchJson
  } from '$lib/edge';

  import {
    DASHBOARD_GLASS_BLUR_ENABLED_KEY,
    DASHBOARD_TEXT_STYLE_KEY,
    getDashboardGlassBlurEnabledFromStorage,
    getDashboardTextStyleFromStorage
  } from '$lib/dashboard';

  import CalendarSection from '$lib/components/settings/CalendarSection.svelte';
  import DashboardSection from '$lib/components/settings/DashboardSection.svelte';
  import UsersSection from '$lib/components/settings/UsersSection.svelte';
  import AccountSection from '$lib/components/settings/AccountSection.svelte';
  import FirstRunSection from '$lib/components/settings/FirstRunSection.svelte';
  import ResetPasswordModal from '$lib/components/settings/ResetPasswordModal.svelte';
  import DeleteUserModal from '$lib/components/settings/DeleteUserModal.svelte';
  import EdgeSetupModal from '$lib/components/settings/EdgeSetupModal.svelte';
  import DeleteBackgroundModal from '$lib/components/settings/DeleteBackgroundModal.svelte';
  import FolderConfirmModal from '$lib/components/settings/FolderConfirmModal.svelte';

  let email = '';
  let password = '';
  let authError: string | null = null;
  let authed = false;
  let isAdmin = false;

  let settings: SettingsDto | null = null;
  let users: UserDto[] = [];

  let persons: PersonDto[] = [];
  let newPersonName = '';
  let newPersonColor: PersonColorKey = 'cyan';
  let personError: string | null = null;
  let personColorMenuOpen = false;

  let weatherLocation = '';
  let weatherSaving = false;
  let weatherError: string | null = null;
  let weatherToast: string | null = null;
  let weatherToastTimer: ReturnType<typeof setTimeout> | null = null;

  let holidaysEnabled = false;
  let holidaysSaving = false;
  let holidaysError: string | null = null;

  let todoEnabled = true;
  let todoSaving = false;
  let todoError: string | null = null;

  let todoListNamesText = '';
  let todoListNamesSaving = false;
  let todoListNamesError: string | null = null;

  let newsEnabled = false;
  let newsSaving = false;
  let newsError: string | null = null;

  type NewsFeedId = import('$lib/api').NewsFeedId;
  let newsFeeds: NewsFeedId[] = ['zeit'];
  let newsFeedsSaving = false;
  let newsFeedsError: string | null = null;

  let clockStyle: ClockStyle = 'modern';
  let clockStyleSaving = false;
  let clockStyleError: string | null = null;

  let dashboardGlassBlurEnabled = false;
  let dashboardTextStyle: ClockStyle = 'modern';

  let tags: TagDto[] = [];
  let newTagName = '';
  let newTagColor: string = 'cyan';
  let tagError: string | null = null;
  let tagColorMenuOpen = false;

  const colorBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500',
    cyan: 'bg-cyan-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    violet: 'bg-violet-400',
    sky: 'bg-sky-400',
    lime: 'bg-lime-400'
  };

  const colorNames: TagColorKey[] = ['cyan', 'fuchsia', 'emerald', 'amber', 'rose', 'violet', 'sky', 'lime'];

  function isTagColorKey(value: string): value is TagColorKey {
    return value in colorBg;
  }

  function isHexColor(value: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(value);
  }

  let uploadFiles: File[] = [];
  let savingBg = false;
  let uploadProgress = 0;
  let uploadTotalLabel: string | null = null;
  let uploadError: string | null = null;

  let backgroundRotateEnabled = false;
  let rotateSaving = false;
  let rotateError: string | null = null;

  let folderConfirmOpen = false;
  let pendingFolderFiles: File[] = [];

  let folderInputEl: HTMLInputElement | null = null;

  let deleteBgFor: string | null = null;
  let deletingBg = false;
  let deleteBgError: string | null = null;

  function requestDeleteBg(img: string) {
    deleteBgError = null;
    deleteBgFor = img;
  }

  async function confirmDeleteBg() {
    if (!deleteBgFor) return;
    deletingBg = true;
    deleteBgError = null;
    try {
      await deleteBackgroundImage(deleteBgFor);
      deleteBgFor = null;
      await refreshSettings();
    } catch {
      deleteBgError = 'Löschen fehlgeschlagen.';
    } finally {
      deletingBg = false;
    }
  }

  let newUserEmail = '';
  let newUserName = '';
  let newUserPassword = '';
  let newUserIsAdmin = false;
  let userError: string | null = null;

  let resetFor: UserDto | null = null;
  let resetPassword = '';
  let resetError: string | null = null;
  let deletingFor: UserDto | null = null;

  let outlookStatus: OutlookStatusDto | null = null;
  let outlookConnections: OutlookConnectionDto[] = [];
  let outlookError: string | null = null;
  let outlookBusy = false;

  let outlookColorMenuFor: number | null = null;

  let firstRunHidden = false;

  const EDGE_BASE_URL_KEY = 'dashbo_edge_base_url';
  const EDGE_TOKEN_KEY = 'dashbo_edge_token';
  let edgeBaseUrl = '';
  let edgeToken = '';
  let edgeSaving = false;
  let edgePlayerWidgetEnabled = false;
  let edgeHeosEnabled = false;
  let edgeHeosHosts = '';
  let edgeTestBusy = false;
  let edgeTestMessage: string | null = null;
  let edgeTestOk: boolean | null = null;
  let edgeSetupOpen = false;
  let edgeScanBusy = false;
  let edgeScanMessage: string | null = null;
  let edgeScanPollId = 0;
  let edgeScanPollTimer: ReturnType<typeof setTimeout> | null = null;

  type HeosPlayerDto = { pid: number; name: string; model?: string };
  let heosGroupPlayers: HeosPlayerDto[] = [];
  let heosGroupSelected: Record<string, boolean> = {};
  let heosGroupBusy = false;
  let heosGroupError: string | null = null;
  let heosGroupMessage: string | null = null;

  type HeosGroupPlayerDto = { name: string; pid: number; role?: 'leader' | 'member' | string };
  type HeosGroupDto = { name: string; gid: number | string; players: HeosGroupPlayerDto[] };
  let heosGroups: HeosGroupDto[] = [];
  let heosGroupsLoaded = false;
  let heosGroupsBusy = false;
  let heosGroupsError: string | null = null;
  let heosGroupsMessage: string | null = null;

  function buildHeosHeaders(): Record<string, string> {
    const hosts = edgeHeosHosts.trim();
    return hosts ? { 'Content-Type': 'application/json', 'X-HEOS-HOSTS': hosts } : { 'Content-Type': 'application/json' };
  }

  function getSelectedGroupPids(): number[] {
    return heosGroupPlayers
      .filter((p) => Boolean(heosGroupSelected[String(p.pid)]))
      .map((p) => p.pid)
      .filter((n) => Number.isFinite(n) && n !== 0);
  }

  async function loadHeosPlayersForGrouping() {
    heosGroupError = null;
    heosGroupMessage = null;
    heosGroupBusy = true;
    try {
      const b = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!b) throw new Error('Edge Base URL fehlt');
      const r = await edgeFetchJson<any>(b, '/api/heos/players', edgeToken || undefined, { headers: buildHeosHeaders() });
      const players = Array.isArray(r?.players) ? r.players : [];
      heosGroupPlayers = players
        .map((p: any) => ({ pid: Number(p?.pid), name: String(p?.name || ''), model: p?.model ? String(p.model) : undefined }))
        .filter((p: any) => Number.isFinite(p.pid) && p.pid !== 0 && p.name);

      const nextSel: Record<string, boolean> = {};
      for (const p of heosGroupPlayers) nextSel[String(p.pid)] = Boolean(heosGroupSelected[String(p.pid)]);
      heosGroupSelected = nextSel;

      heosGroupMessage = `${heosGroupPlayers.length} Speaker geladen`;
    } catch (e: any) {
      heosGroupError = e?.message || 'Speaker konnten nicht geladen werden.';
      heosGroupPlayers = [];
    } finally {
      heosGroupBusy = false;
    }
  }

  async function createHeosGroup() {
    heosGroupError = null;
    heosGroupMessage = null;
    const selected = getSelectedGroupPids();
    if (selected.length < 2) {
      heosGroupError = 'Bitte mindestens 2 Speaker auswählen.';
      return;
    }

    const leaderPid = selected[0];
    const memberPids = selected.slice(1);

    heosGroupBusy = true;
    try {
      const b = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!b) throw new Error('Edge Base URL fehlt');
      await edgeFetchJson<any>(b, '/api/heos/group', edgeToken || undefined, {
        method: 'POST',
        headers: buildHeosHeaders(),
        body: JSON.stringify({ leaderPid, memberPids })
      });
      heosGroupMessage = 'Gruppe erstellt.';
      await loadHeosGroups();
    } catch (e: any) {
      heosGroupError = e?.message || 'Gruppe konnte nicht erstellt werden.';
    } finally {
      heosGroupBusy = false;
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

  function getHeosGroupLeaderPid(group: HeosGroupDto): number | null {
    const leader = group.players.find((p) => String(p.role || '').toLowerCase() === 'leader');
    const pid = leader?.pid ?? group.players[0]?.pid;
    return Number.isFinite(pid) && pid !== 0 ? pid : null;
  }

  async function loadHeosGroups() {
    heosGroupsError = null;
    heosGroupsMessage = null;
    heosGroupsBusy = true;
    try {
      const b = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!b) throw new Error('Edge Base URL fehlt');
      const r = await edgeFetchJson<any>(b, '/api/heos/groups', edgeToken || undefined, { headers: buildHeosHeaders() });
      const payload = r?.response?.payload;
      heosGroups = parseHeosGroupsPayload(payload);
      heosGroupsLoaded = true;
      heosGroupsMessage = heosGroups.length > 0 ? `${heosGroups.length} Gruppe(n) geladen` : 'Keine Gruppen vorhanden.';
    } catch (e: any) {
      heosGroupsError = e?.message || 'Gruppen konnten nicht geladen werden.';
      heosGroupsLoaded = true;
      heosGroups = [];
    } finally {
      heosGroupsBusy = false;
    }
  }

  async function dissolveHeosGroupByPid(pid: number) {
    heosGroupError = null;
    heosGroupMessage = null;
    heosGroupBusy = true;
    try {
      const b = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!b) throw new Error('Edge Base URL fehlt');
      await edgeFetchJson<any>(b, '/api/heos/ungroup', edgeToken || undefined, {
        method: 'POST',
        headers: buildHeosHeaders(),
        body: JSON.stringify({ pid })
      });
      heosGroupMessage = 'Gruppe aufgelöst.';
      await loadHeosGroups();
    } catch (e: any) {
      heosGroupError = e?.message || 'Gruppe konnte nicht aufgelöst werden.';
    } finally {
      heosGroupBusy = false;
    }
  }

  async function dissolveHeosGroup() {
    heosGroupError = null;
    heosGroupMessage = null;
    const selected = getSelectedGroupPids();
    if (selected.length < 1) {
      heosGroupError = 'Bitte mindestens einen Speaker auswählen (Leader).';
      return;
    }

    const pid = selected[0];
    await dissolveHeosGroupByPid(pid);
  }

  type EdgeMusicStatusDto = {
    ok: boolean;
    scanning: boolean;
    lastScanAt: string | null;
    lastError: string | null;
    libraryPath: string;
    counts: { tracks: number; albums: number };
    progress?: {
      phase?: string;
      startedAt?: string;
      updatedAt?: string;
      dirsDone?: number;
      filesTotal?: number;
      filesDone?: number;
      tracksBuilt?: number;
      albumsBuilt?: number;
      coversDone?: number;
      coversTotal?: number;
      currentRelPath?: string | null;
    } | null;
  };

  function edgeScanPercent(st: EdgeMusicStatusDto | null): number | null {
    const total = st?.progress?.filesTotal;
    const done = st?.progress?.filesDone;
    if (typeof total !== 'number' || total <= 0) return null;
    if (typeof done !== 'number' || done < 0) return 0;
    return Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
  }

  function edgeScanPhaseLabel(phase: string | undefined): string {
    const p = String(phase || '').toLowerCase();
    if (p === 'walking') return 'Dateien sammeln';
    if (p === 'metadata') return 'Tags lesen';
    if (p === 'covers') return 'Cover prüfen';
    if (p === 'done') return 'Fertig';
    if (p === 'error') return 'Fehler';
    return p || 'Scan';
  }

  function stopEdgeScanPolling() {
    if (edgeScanPollTimer) {
      clearTimeout(edgeScanPollTimer);
      edgeScanPollTimer = null;
    }
    edgeScanPollId += 1;
  }

  async function fetchEdgeMusicStatus(): Promise<EdgeMusicStatusDto> {
    return await edgeFetchJson<EdgeMusicStatusDto>(edgeBaseUrl, '/api/music/status', edgeToken || undefined);
  }

  async function pollEdgeScanUntilDone(opts?: { timeoutMs?: number }) {
    const timeoutMs = Math.max(10_000, Number(opts?.timeoutMs ?? 180_000));
    const id = ++edgeScanPollId;
    const startedAt = Date.now();

    const tick = async () => {
      if (id !== edgeScanPollId) return;
      try {
        const st = await fetchEdgeMusicStatus();
        if (id !== edgeScanPollId) return;

        if (st.scanning) {
          const pct = edgeScanPercent(st);
          const phase = edgeScanPhaseLabel(st.progress?.phase);
          const total = st.progress?.filesTotal;
          const done = st.progress?.filesDone;
          const cur = st.progress?.currentRelPath ? ` · ${st.progress.currentRelPath}` : '';
          const countAlbums = st.progress?.albumsBuilt ?? st.counts?.albums ?? 0;
          const countTracks = st.progress?.tracksBuilt ?? st.counts?.tracks ?? 0;

          if (pct != null && typeof total === 'number' && typeof done === 'number') {
            edgeScanMessage = `${phase}: ${pct}% (${done}/${total}) · ${countAlbums} Alben · ${countTracks} Tracks${cur}`;
          } else {
            edgeScanMessage = `${phase}… · ${countAlbums} Alben · ${countTracks} Tracks${cur}`;
          }
        } else {
          if (st.lastError) {
            edgeScanMessage = `Scan beendet mit Fehler: ${st.lastError}`;
          } else {
            edgeScanMessage = `Scan abgeschlossen. (${st.counts?.albums ?? 0} Alben · ${st.counts?.tracks ?? 0} Tracks)`;
          }
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          edgeScanMessage = 'Scan läuft im Hintergrund… (Status später erneut prüfen)';
          return;
        }

        edgeScanPollTimer = setTimeout(() => {
          void tick();
        }, 1500);
      } catch (err) {
        if (id !== edgeScanPollId) return;
        edgeScanMessage = err instanceof Error ? err.message : 'Status konnte nicht geladen werden.';
      }
    };

    await tick();
  }

  function isFirstRunHidden(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('dashbo_first_run_hidden') === '1';
  }

  function loadEdgeConfig() {
    if (typeof localStorage === 'undefined') return;
    edgeBaseUrl = localStorage.getItem(EDGE_BASE_URL_KEY) ?? '';
    edgeToken = localStorage.getItem(EDGE_TOKEN_KEY) ?? '';
    edgePlayerWidgetEnabled = localStorage.getItem(EDGE_PLAYER_WIDGET_ENABLED_KEY) === '1';
    edgeHeosEnabled = localStorage.getItem(EDGE_HEOS_ENABLED_KEY) === '1';
    edgeHeosHosts = localStorage.getItem(EDGE_HEOS_HOSTS_KEY) ?? '';

    // Dashboard UI tweaks (local-only)
    dashboardGlassBlurEnabled = getDashboardGlassBlurEnabledFromStorage();
    dashboardTextStyle = getDashboardTextStyleFromStorage();
  }

  function saveDashboardGlassBlurEnabled() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DASHBOARD_GLASS_BLUR_ENABLED_KEY, dashboardGlassBlurEnabled ? '1' : '0');
      }
      showToast(dashboardGlassBlurEnabled ? 'Dashboard Blur aktiviert' : 'Dashboard Blur deaktiviert');
    } catch {
      // ignore
    }
  }

  function saveDashboardTextStyle() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DASHBOARD_TEXT_STYLE_KEY, normalizeClockStyle(dashboardTextStyle));
      }
      showToast('Dashboard Schriftstil gespeichert');
    } catch {
      // ignore
    }
  }

  function saveEdgeConfig() {
    edgeSaving = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(EDGE_BASE_URL_KEY, normalizeEdgeBaseUrl(edgeBaseUrl));
        localStorage.setItem(EDGE_TOKEN_KEY, edgeToken);
        localStorage.setItem(EDGE_HEOS_HOSTS_KEY, edgeHeosHosts.trim());
      }
      showToast('Pi Edge gespeichert');
    } finally {
      edgeSaving = false;
    }
  }

  function isLocalhostUrl(rawUrl: string): boolean {
    try {
      const u = new URL(rawUrl);
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
    } catch {
      return false;
    }
  }

  function saveEdgePlayerWidgetEnabled() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(EDGE_PLAYER_WIDGET_ENABLED_KEY, edgePlayerWidgetEnabled ? '1' : '0');
      }
      showToast(edgePlayerWidgetEnabled ? 'Player Widget aktiviert' : 'Player Widget deaktiviert');
    } catch {
      // ignore
    }
  }

  function saveEdgeHeosEnabled() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(EDGE_HEOS_ENABLED_KEY, edgeHeosEnabled ? '1' : '0');
      }
      showToast(edgeHeosEnabled ? 'HEOS aktiviert' : 'HEOS deaktiviert');
    } catch {
      // ignore
    }
  }

  async function testEdgeConnection() {
    edgeTestBusy = true;
    edgeTestMessage = null;
    edgeTestOk = null;
    try {
      const health = await edgeHealth(edgeBaseUrl, edgeToken || undefined);
      edgeTestOk = Boolean(health?.ok);
      if (health?.ok) {
        const v = typeof health?.version === 'string' && health.version.trim() ? health.version.trim() : null;
        const sha = typeof health?.buildSha === 'string' && health.buildSha.trim() ? health.buildSha.trim() : null;
        const apiV = typeof health?.apiVersion === 'number' ? health.apiVersion : null;

        const parts = [health.service ?? 'edge'];
        if (v) parts.push(`v${v}`);
        if (sha) parts.push(sha.slice(0, 7));
        if (apiV !== null) parts.push(`api ${apiV}`);
        edgeTestMessage = `OK: ${parts.join(' · ')}`;

        if (apiV !== null && apiV < MIN_EDGE_API_VERSION) {
          edgeTestOk = false;
          edgeTestMessage = `Edge ist zu alt (api ${apiV} < ${MIN_EDGE_API_VERSION}). Bitte Edge updaten: docker compose pull ; docker compose up -d`;
        } else {
          showToast('Pi Edge erreichbar');
        }
      } else {
        edgeTestMessage = 'Antwort ungültig.';
      }
    } catch (err) {
      edgeTestOk = false;
      edgeTestMessage = err instanceof Error ? err.message : 'Verbindung fehlgeschlagen.';
    } finally {
      edgeTestBusy = false;
    }
  }

  async function scanEdgeNow() {
    if (!edgeBaseUrl) return;
    stopEdgeScanPolling();
    edgeScanBusy = true;
    edgeScanMessage = null;
    try {
      const r = await edgeFetchJson<{ ok: boolean; started?: boolean; queued?: boolean }>(edgeBaseUrl, '/api/music/scan?force=1', edgeToken || undefined, { method: 'POST' });
      if (r && typeof r === 'object') {
        if (r.queued) {
          edgeScanMessage = 'Scan angefordert; wird nach aktuellem Scan gestartet.';
        } else if (r.started) {
          edgeScanMessage = 'Scan gestartet…';
        } else {
          edgeScanMessage = 'Scan nicht gestartet (bereits aktiv).';
        }
      } else {
        edgeScanMessage = 'Scan gestartet…';
      }
      showToast('Rescan auf Edge angefordert');
      // If scan is running (or queued), poll status until it completes.
      void pollEdgeScanUntilDone();
    } catch (err) {
      edgeScanMessage = err instanceof Error ? err.message : 'Scan fehlgeschlagen.';
    } finally {
      edgeScanBusy = false;
    }
  }

  onDestroy(() => {
    stopEdgeScanPolling();
  });

  function hideFirstRun() {
    firstRunHidden = true;
    try {
      localStorage.setItem('dashbo_first_run_hidden', '1');
    } catch {
      // ignore
    }
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function refreshSettings() {
    settings = await fetchSettings();
    weatherLocation = settings?.weatherLocation ?? '';
    holidaysEnabled = Boolean(settings?.holidaysEnabled);
    todoEnabled = settings?.todoEnabled !== false;
    newsEnabled = Boolean(settings?.newsEnabled);
    backgroundRotateEnabled = Boolean(settings?.backgroundRotateEnabled);

    const listNames = Array.isArray(settings?.todoListNames) ? settings!.todoListNames! : [];
    todoListNamesText = listNames.length ? listNames.join('\n') : settings?.todoListName ?? '';

    const feeds = Array.isArray(settings?.newsFeeds) ? settings!.newsFeeds! : [];
    newsFeeds = (feeds.length ? feeds : ['zeit']) as NewsFeedId[];

    clockStyle = normalizeClockStyle((settings as any)?.clockStyle);
  }

  async function saveClockStyleHandler() {
    clockStyleError = null;
    clockStyleSaving = true;
    try {
      await setClockStyle(clockStyle);
      await refreshSettings();
      showToast('Uhrzeit-Stil gespeichert');
    } catch {
      clockStyleError = 'Speichern fehlgeschlagen.';
    } finally {
      clockStyleSaving = false;
    }
  }

  function parseTodoListNamesText(text: string): string[] {
    return String(text || '')
      .split(/[\r\n,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  async function saveTodoListNamesHandler() {
    todoListNamesError = null;
    todoListNamesSaving = true;
    try {
      const listNames = parseTodoListNamesText(todoListNamesText);
      await setTodoListNames(listNames);
      await refreshSettings();
    } catch {
      todoListNamesError = 'Speichern fehlgeschlagen.';
    } finally {
      todoListNamesSaving = false;
    }
  }

  async function saveNewsFeedsHandler() {
    newsFeedsError = null;
    newsFeedsSaving = true;
    try {
      const unique = Array.from(new Set((newsFeeds || []).map((f) => f))) as NewsFeedId[];
      const effective = unique.length ? unique : (['zeit'] as NewsFeedId[]);
      await setNewsFeeds(effective);
      await refreshSettings();
    } catch {
      newsFeedsError = 'Speichern fehlgeschlagen.';
    } finally {
      newsFeedsSaving = false;
    }
  }

  async function saveBackgroundRotate() {
    rotateError = null;
    rotateSaving = true;
    try {
      await setBackgroundRotateEnabled(backgroundRotateEnabled);
      await refreshSettings();
    } catch {
      rotateError = 'Speichern fehlgeschlagen.';
    } finally {
      rotateSaving = false;
    }
  }

  async function refreshUsers() {
    users = await listUsers();
  }

  async function refreshTags() {
    tags = await listTags();
  }

  async function refreshPersons() {
    persons = await listPersons();
  }

  async function refreshOutlook() {
    outlookError = null;
    if (!authed) {
      outlookStatus = null;
      outlookConnections = [];
      return;
    }
    try {
      outlookStatus = await fetchOutlookStatus();
      outlookConnections = await listOutlookConnections();
    } catch {
      outlookStatus = null;
      outlookConnections = [];
      outlookError = 'Outlook Status konnte nicht geladen werden.';
    }
  }

  async function doLogin() {
    authError = null;
    try {
      const res = await login(email, password);
      setToken(res.token);
      authed = true;
      isAdmin = !!res.user?.isAdmin;
      await refreshSettings();
      if (isAdmin) await refreshUsers();
      await refreshTags();
      await refreshPersons();
      await refreshOutlook();
    } catch {
      authError = 'Login fehlgeschlagen';
      authed = false;
      isAdmin = false;
    }
  }

  function logout() {
    setToken(null);
    authed = false;
    isAdmin = false;
    users = [];
    persons = [];
    outlookStatus = null;
    outlookError = null;
    void goto('/login');
  }

  $: wizardNeedsUsers = authed && isAdmin && users.length <= 1;
  $: wizardNeedsWeather = authed && !weatherLocation.trim();
  $: wizardNeedsBackground = authed && !settings?.background;
  $: wizardNeedsTags = authed && tags.length === 0;
  $: wizardNeedsPersons = authed && persons.length === 0;
  $: wizardOutlookConnected = authed && (((outlookConnections?.length ?? 0) > 0) || Boolean(outlookStatus?.connected));

  $: showFirstRunWizard =
    authed &&
    !firstRunHidden &&
    (wizardNeedsUsers || wizardNeedsWeather || wizardNeedsTags || wizardNeedsPersons);

  async function doOutlookConnect() {
    if (!authed || outlookBusy) return;
    outlookBusy = true;
    outlookError = null;
    try {
      const { url } = await getOutlookAuthUrl();
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      outlookError = msg.includes('outlook_not_configured')
        ? 'Outlook ist noch nicht konfiguriert (OUTLOOK_CLIENT_ID / OUTLOOK_CLIENT_SECRET / OUTLOOK_REDIRECT_URI).'
        : 'Outlook Verbindung konnte nicht gestartet werden.';
      console.error(e);
    } finally {
      outlookBusy = false;
    }
  }

  async function doOutlookDisconnect() {
    if (!authed || outlookBusy) return;
    outlookBusy = true;
    outlookError = null;
    try {
      await disconnectOutlook();
      await refreshOutlook();
    } catch {
      outlookError = 'Outlook Verbindung konnte nicht getrennt werden.';
    } finally {
      outlookBusy = false;
    }
  }

  async function doOutlookDisconnectConnection(id: number) {
    if (!authed || outlookBusy) return;
    outlookBusy = true;
    outlookError = null;
    try {
      await disconnectOutlookConnection(id);
      await refreshOutlook();
    } catch {
      outlookError = 'Outlook Verbindung konnte nicht getrennt werden.';
    } finally {
      outlookBusy = false;
    }
  }

  async function doOutlookSetConnectionColor(id: number, c: TagColorKey) {
    if (!authed || outlookBusy) return;
    outlookBusy = true;
    outlookError = null;
    try {
      await setOutlookConnectionColor(id, c);
      outlookColorMenuFor = null;
      await refreshOutlook();
    } catch {
      outlookError = 'Farbe konnte nicht gespeichert werden.';
    } finally {
      outlookBusy = false;
    }
  }

  async function doCreateTag() {
    if (!newTagName.trim()) return;
    tagError = null;
    try {
      const color = newTagColor.trim();
      if (!isTagColorKey(color) && !isHexColor(color)) {
        tagError = 'Ungültige Farbe.';
        return;
      }

      await createTag({ name: newTagName.trim(), color });
      newTagName = '';
      newTagColor = 'cyan';
      tagColorMenuOpen = false;
      await refreshTags();
    } catch {
      tagError = 'Tag konnte nicht angelegt werden.';
    }
  }

  function chooseTagColor(c: TagColorKey) {
    newTagColor = c;
    tagColorMenuOpen = false;
  }

  function chooseCustomTagColor(hex: string) {
    if (!isHexColor(hex)) return;
    newTagColor = hex;
    tagColorMenuOpen = false;
  }

  function onGlobalClick() {
    tagColorMenuOpen = false;
    personColorMenuOpen = false;
    outlookColorMenuFor = null;
  }

  async function doDeleteTag(id: number) {
    tagError = null;
    try {
      await deleteTag(id);
      await refreshTags();
    } catch {
      tagError = 'Tag konnte nicht gelöscht werden.';
    }
  }

  async function doUpload() {
    if (uploadFiles.length === 0) return;
    savingBg = true;
    uploadError = null;
    uploadProgress = 0;

    const totalBytes = uploadFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    uploadTotalLabel = totalBytes > 0 ? `${uploadFiles.length} Datei(en)` : null;

    let completedBytes = 0;
    try {
      for (const file of uploadFiles) {
        await uploadBackgroundWithProgress(file, (loaded: number, total: number) => {
          const denom = totalBytes > 0 ? totalBytes : 1;
          const currentTotal = total || file.size || 0;
          const currentLoaded = loaded || 0;
          const overall = (completedBytes + Math.min(currentLoaded, currentTotal)) / denom;
          uploadProgress = Math.max(0, Math.min(1, overall));
        });
        completedBytes += file.size || 0;
        uploadProgress = totalBytes > 0 ? Math.max(uploadProgress, completedBytes / totalBytes) : uploadProgress;
      }

      uploadFiles = [];
      uploadTotalLabel = null;
      uploadProgress = 0;
      await refreshSettings();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      uploadError = msg || 'Upload fehlgeschlagen.';
    } finally {
      savingBg = false;
    }
  }

  function onChooseUploadFiles(files: FileList | null | undefined) {
    onChooseUploadFilesFrom('files', files);
  }

  function onChooseUploadFilesFrom(source: 'files' | 'folder', files: FileList | null | undefined) {
    uploadError = null;
    uploadProgress = 0;
    uploadTotalLabel = null;

    const arr = files ? Array.from(files) : [];
    if (source === 'folder' && arr.length > 0) {
      pendingFolderFiles = arr;
      folderConfirmOpen = true;
      return;
    }

    uploadFiles = arr;
  }

  function confirmFolderSelection() {
    uploadFiles = pendingFolderFiles;
    pendingFolderFiles = [];
    folderConfirmOpen = false;
  }

  function cancelFolderSelection() {
    pendingFolderFiles = [];
    folderConfirmOpen = false;
    uploadFiles = [];
    if (folderInputEl) folderInputEl.value = '';
  }

  async function chooseBg(filename: string) {
    savingBg = true;
    try {
      await setBackground(filename);
      await refreshSettings();
    } finally {
      savingBg = false;
    }
  }

  async function doCreateUser() {
    userError = null;
    try {
      await createUser({
        email: newUserEmail,
        name: newUserName,
        password: newUserPassword,
        isAdmin: newUserIsAdmin
      });
      newUserEmail = '';
      newUserName = '';
      newUserPassword = '';
      newUserIsAdmin = false;
      await refreshUsers();
    } catch (err) {
      userError = err instanceof Error ? err.message : 'User konnte nicht angelegt werden.';
    }
  }

  async function doResetPassword() {
    if (!resetFor) return;
    resetError = null;
    if (resetPassword.length < 6) {
      resetError = 'Mindestens 6 Zeichen.';
      return;
    }
    try {
      await resetUserPassword(resetFor.id, resetPassword);
      resetFor = null;
      resetPassword = '';
    } catch {
      resetError = 'Fehler beim Zurücksetzen.';
    }
  }

  async function doDeleteUser() {
    if (!deletingFor) return;
    try {
      await deleteUser(deletingFor.id);
      deletingFor = null;
      await refreshUsers();
    } catch {
      userError = 'User konnte nicht gelöscht werden.';
    }
  }

  async function doCreatePerson() {
    if (!newPersonName.trim()) return;
    personError = null;
    try {
      const color = String(newPersonColor).trim();
      if (!isTagColorKey(color) && !isHexColor(color)) {
        personError = 'Ungültige Farbe.';
        return;
      }

      await createPerson({ name: newPersonName.trim(), color });
      newPersonName = '';
      newPersonColor = 'cyan';
      personColorMenuOpen = false;
      await refreshPersons();
    } catch {
      personError = 'Person konnte nicht angelegt werden.';
    }
  }

  function choosePersonColor(c: TagColorKey) {
    newPersonColor = c;
    personColorMenuOpen = false;
  }

  function chooseCustomPersonColor(hex: string) {
    if (!isHexColor(hex)) return;
    newPersonColor = hex;
    personColorMenuOpen = false;
  }

  async function doDeletePerson(id: number) {
    personError = null;
    try {
      await deletePerson(id);
      await refreshPersons();
    } catch {
      personError = 'Person konnte nicht gelöscht werden.';
    }
  }

  onMount(async () => {
    loadEdgeConfig();
    const existing = getStoredToken();
    if (existing) {
      authed = true;

      await refreshSettings();
      await refreshTags();
      try {
        await refreshUsers();
        isAdmin = true;
      } catch {
        isAdmin = false;
        users = [];
      }
      try {
        await refreshPersons();
      } catch {
        authed = false;
        isAdmin = false;
        persons = [];
      }

      await refreshOutlook();
    } else {
      authed = false;
      isAdmin = false;
    }
  });

  async function saveWeatherLocation() {
    if (!authed) return;
    weatherError = null;
    weatherSaving = true;
    try {
      await setWeatherLocation(weatherLocation);
      await refreshSettings();
      showToast('Wetter-Ort gespeichert');
    } catch {
      weatherError = 'Fehler beim Speichern.';
    } finally {
      weatherSaving = false;
    }
  }

  async function saveHolidays() {
    if (!authed) return;
    holidaysError = null;
    holidaysSaving = true;
    try {
      await setHolidaysEnabled(holidaysEnabled);
      await refreshSettings();
      showToast(holidaysEnabled ? 'Feiertage aktiviert' : 'Feiertage deaktiviert');
    } catch {
      holidaysError = 'Fehler beim Speichern.';
    } finally {
      holidaysSaving = false;
    }
  }

  async function saveTodo() {
    if (!authed) return;
    todoError = null;
    todoSaving = true;
    try {
      await setTodoEnabled(todoEnabled);
      await refreshSettings();
      showToast(todoEnabled ? 'To-Do aktiviert' : 'To-Do deaktiviert');
    } catch {
      todoError = 'Fehler beim Speichern.';
    } finally {
      todoSaving = false;
    }
  }

  async function saveNews() {
    newsError = null;
    newsSaving = true;
    try {
      await setNewsEnabled(newsEnabled);
      await refreshSettings();
      showToast(newsEnabled ? 'News aktiviert' : 'News deaktiviert');
    } catch {
      newsError = 'Fehler beim Speichern.';
    } finally {
      newsSaving = false;
    }
  }

  function showToast(msg: string) {
    weatherToast = msg;
    if (weatherToastTimer) clearTimeout(weatherToastTimer);
    weatherToastTimer = setTimeout(() => {
      weatherToast = null;
      weatherToastTimer = null;
    }, 2500);
  }
</script>

<svelte:window on:click={onGlobalClick} />

{#if weatherToast}
  <div class="fixed right-4 top-4 z-[60]" in:fly={{ y: -8, duration: 160 }} out:fade={{ duration: 140 }}>
    <div class="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-white text-sm">
      {weatherToast}
    </div>
  </div>
{/if}

<div class="min-h-screen bg-zinc-950 text-white">
  <div class="max-w-3xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <h1 class="text-3xl font-bold">Einstellungen</h1>
      <a class="text-white/60 hover:text-white text-sm" href="/">← Zurück</a>
    </div>

    <AccountSection {authed} {isAdmin} bind:email bind:password {authError} {doLogin} {logout} />

    {#if showFirstRunWizard}
      <FirstRunSection
        {isAdmin}
        {wizardNeedsUsers}
        {wizardNeedsWeather}
        {wizardNeedsTags}
        {wizardNeedsPersons}
        {wizardOutlookConnected}
        {hideFirstRun}
        {scrollToSection}
      />
    {/if}

    <CalendarSection
      {authed}
      {tags}
      bind:newTagName
      bind:newTagColor
      {tagError}
      bind:tagColorMenuOpen
      {persons}
      bind:newPersonName
      bind:newPersonColor
      {personError}
      bind:personColorMenuOpen
      {outlookStatus}
      {outlookConnections}
      {outlookError}
      {outlookBusy}
      bind:outlookColorMenuFor
      {colorBg}
      {colorNames}
      {isTagColorKey}
      {isHexColor}
      {chooseTagColor}
      {chooseCustomTagColor}
      {doCreateTag}
      {doDeleteTag}
      {choosePersonColor}
      {chooseCustomPersonColor}
      {doCreatePerson}
      {doDeletePerson}
      {doOutlookConnect}
      {doOutlookDisconnect}
      {doOutlookDisconnectConnection}
      {doOutlookSetConnectionColor}
    />

    <DashboardSection
      {authed}
      {settings}
      bind:weatherLocation
      {weatherSaving}
      {weatherError}
      {saveWeatherLocation}
      bind:holidaysEnabled
      {holidaysSaving}
      {holidaysError}
      {saveHolidays}
      bind:todoEnabled
      {todoSaving}
      {todoError}
      {saveTodo}
      bind:todoListNamesText
      {todoListNamesSaving}
      {todoListNamesError}
      saveTodoListNames={saveTodoListNamesHandler}
      bind:newsEnabled
      {newsSaving}
      {newsError}
      {saveNews}
      bind:newsFeeds
      {newsFeedsSaving}
      {newsFeedsError}
      saveNewsFeeds={saveNewsFeedsHandler}
      bind:clockStyle
      {clockStyleSaving}
      {clockStyleError}
      saveClockStyle={saveClockStyleHandler}
      bind:edgeBaseUrl
      bind:edgeToken
      {edgeSaving}
      bind:edgePlayerWidgetEnabled
      {saveEdgePlayerWidgetEnabled}
      openEdgeSetup={() => (edgeSetupOpen = true)}
      {saveEdgeConfig}
      {testEdgeConnection}
      {edgeTestBusy}
      {edgeTestMessage}
      {edgeTestOk}
      {scanEdgeNow}
      {edgeScanBusy}
      {edgeScanMessage}
      bind:edgeHeosEnabled
      {saveEdgeHeosEnabled}
      bind:edgeHeosHosts
      {isLocalhostUrl}
      bind:dashboardGlassBlurEnabled
      {saveDashboardGlassBlurEnabled}
      bind:dashboardTextStyle
      {saveDashboardTextStyle}
      {heosGroupPlayers}
      {heosGroupSelected}
      {heosGroupBusy}
      {heosGroupError}
      {heosGroupMessage}
      {heosGroups}
      {heosGroupsLoaded}
      {heosGroupsBusy}
      {heosGroupsError}
      {heosGroupsMessage}
      {loadHeosGroups}
      {loadHeosPlayersForGrouping}
      {createHeosGroup}
      {dissolveHeosGroup}
      {dissolveHeosGroupByPid}
      {getHeosGroupLeaderPid}
      bind:backgroundRotateEnabled
      {rotateSaving}
      {rotateError}
      {saveBackgroundRotate}
      {uploadFiles}
      {savingBg}
      {uploadProgress}
      {uploadTotalLabel}
      {uploadError}
      bind:folderInputEl
      {onChooseUploadFilesFrom}
      {doUpload}
      {chooseBg}
      {deletingBg}
      {requestDeleteBg}
    />

    <!-- Admin Section -->
    {#if authed && isAdmin}
      <UsersSection
        {authed}
        {isAdmin}
        {users}
        bind:newUserEmail
        bind:newUserName
        bind:newUserPassword
        bind:newUserIsAdmin
        {userError}
        bind:resetFor
        bind:resetPassword
        bind:resetError
        bind:deletingFor
        {doCreateUser}
      />
    {/if}
  </div>

  <DeleteBackgroundModal bind:deleteBgFor {deletingBg} {deleteBgError} {confirmDeleteBg} />

  <FolderConfirmModal
    open={folderConfirmOpen}
    fileCount={pendingFolderFiles.length}
    {confirmFolderSelection}
    {cancelFolderSelection}
  />
</div>

<ResetPasswordModal bind:resetFor bind:resetPassword bind:resetError {doResetPassword} />

<DeleteUserModal bind:deletingFor {doDeleteUser} />

<EdgeSetupModal bind:edgeSetupOpen />
