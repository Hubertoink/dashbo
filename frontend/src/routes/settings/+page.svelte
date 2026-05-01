<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fade, fly } from 'svelte/transition';
  import {
    login,
    setToken,
    fetchSettings,
    setBackground,
    deleteBackgroundImage,
    fetchOutlookStatus,
    fetchCalendarSyncFeed,
    enableCalendarSyncFeed,
    regenerateCalendarSyncFeed,
    disableCalendarSyncFeed,
    fetchCalendarProviderSyncTargets,
    enableCalendarProviderSyncTarget,
    syncCalendarProviderSyncTarget,
    deleteCalendarProviderSyncTarget,
    fetchHueStatus,
    getGoogleAuthUrl,
    listGoogleConnections,
    pairHueBridge,
    listOutlookConnections,
    getOutlookAuthUrl,
    disconnectOutlook,
    disconnectOutlookConnection,
    setOutlookConnectionColor,
    listUsers,
    listUserRoster,
    createUser,
    inviteUser,
    createInviteLinkForUser,
    createCalendarInviteLink,
    deleteUser,
    resetUserPassword,
    setWeatherLocation,
    setHolidaysEnabled,
    setTodoEnabled,
    setHueEnabled,
    setTodoListNames,
    setTodoDefaultConnection,
    setNewsEnabled,
    setScribbleEnabled,
    setScribbleStandbySeconds,
    setScribblePaperLook,
    setNewsFeeds,
    setNewsLinkTarget,
    setClockStyle,
    uploadBackgroundWithProgress,
    setBackgroundRotateEnabled,
    setBackgroundRotateImages,
    listTags,
    createTag,
    updateTag,
    deleteTag,
    listPersons,
    createPerson,
    updatePerson,
    deletePerson,
    type SettingsDto,
    type UserDto,
    type TagDto,
    type TagColorKey,
    type PersonDto,
    type PersonColorKey,
    type CalendarSyncFeedDto,
    type CalendarProviderSyncTargetDto,
    type CalendarSyncProvider,
    type GoogleConnectionDto,
    type OutlookStatusDto,
    type OutlookConnectionDto,
    type HueStatusDto,
    type MeDto,
    fetchMe,
    requestEmailVerification,
    setRecurringSuggestionsSettings,
  } from '$lib/api';
  import { getLoginRedirectPath, resolveStoredUser } from '$lib/auth';

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
    DASHBOARD_BG_DIMMING_KEY,
    DASHBOARD_BG_DIMMING_DEFAULT,
    getDashboardGlassBlurEnabledFromStorage,
    getDashboardTextStyleFromStorage,
    getDashboardBgDimmingFromStorage
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
  import CalendarItemEditModal from '$lib/components/settings/CalendarItemEditModal.svelte';
  import { getCanInstall, getIsInstalled, pwaPromptInstall, subscribe as pwaSubscribe } from '$lib/pwaInstall';

  let pwaCanInstall = false;
  let pwaIsInstalled = false;
  let pwaInstalling = false;

  let email = '';
  let password = '';
  let authError: string | null = null;
  let authed = false;
  let isAdmin = false;
  let isSuperAdmin = false;
  let me: MeDto | null = null;

  // Return URL from query params (for mobile navigation from planner)
  $: returnUrl = $page.url.searchParams.get('from') || '/';

  let settings: SettingsDto | null = null;
  let users: UserDto[] = [];

  let persons: PersonDto[] = [];
  let newPersonName = '';
  let newPersonColor: PersonColorKey = 'cyan';
  let personError: string | null = null;
  let personColorMenuOpen = false;
  let editingPerson: PersonDto | null = null;
  let editingPersonName = '';
  let editingPersonColor = 'cyan';
  let editingPersonSaving = false;
  let editingPersonError: string | null = null;

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

  let hueEnabled = false;
  let hueSaving = false;
  let hueError: string | null = null;
  let hueStatus: HueStatusDto | null = null;
  let hueStatusLoading = false;
  let huePairing = false;
  let huePairError: string | null = null;
  let huePairMessage: string | null = null;

  let todoListNamesText = '';
  let todoListNamesSaving = false;
  let todoListNamesError: string | null = null;

  let todoDefaultConnectionId: number | null = null;
  let todoDefaultConnectionSaving = false;
  let todoDefaultConnectionError: string | null = null;

  let newsEnabled = false;
  let newsSaving = false;
  let newsError: string | null = null;

  let scribbleEnabled = true;
  let scribbleSaving = false;
  let scribbleError: string | null = null;

  let scribbleStandbySeconds = 20;
  let scribbleStandbySecondsSaving = false;
  let scribbleStandbySecondsError: string | null = null;

  let scribblePaperLook = true;
  let scribblePaperLookSaving = false;
  let scribblePaperLookError: string | null = null;

  type NewsFeedId = import('$lib/api').NewsFeedId;
  type NewsLinkTarget = import('$lib/api').NewsLinkTarget;
  let newsFeeds: NewsFeedId[] = ['zeit'];
  let newsFeedsSaving = false;
  let newsFeedsError: string | null = null;
  let newsLinkTarget: NewsLinkTarget = 'same';
  let newsLinkTargetSaving = false;
  let newsLinkTargetError: string | null = null;

  let clockStyle: ClockStyle = 'modern';
  let clockStyleSaving = false;
  let clockStyleError: string | null = null;

  let dashboardGlassBlurEnabled = false;
  let dashboardTextStyle: ClockStyle = 'modern';
  let dashboardBgDimming = DASHBOARD_BG_DIMMING_DEFAULT;

  let tags: TagDto[] = [];
  let newTagName = '';
  let newTagColor: string = 'cyan';
  let tagError: string | null = null;
  let tagColorMenuOpen = false;
  let editingTag: TagDto | null = null;
  let editingTagName = '';
  let editingTagColor = 'cyan';
  let editingTagSaving = false;
  let editingTagError: string | null = null;

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

  let backgroundRotateImages: string[] = [];
  let rotateImagesSaving = false;
  let rotateImagesError: string | null = null;

  let recurringSuggestionsEnabled = false;
  let recurringSuggestionsWeekly = true;
  let recurringSuggestionsBiweekly = true;
  let recurringSuggestionsMonthly = true;
  let recurringSuggestionsBirthdays = true;
  let recurringSuggestionsSaving = false;
  let recurringSuggestionsError: string | null = null;

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

  let calendarSyncFeed: CalendarSyncFeedDto | null = null;
  let calendarSyncBusy = false;
  let calendarSyncError: string | null = null;

  let calendarProviderSyncTargets: CalendarProviderSyncTargetDto[] = [];
  let calendarProviderSyncBusy = false;
  let calendarProviderSyncError: string | null = null;

  let googleConnections: GoogleConnectionDto[] = [];

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
    dashboardBgDimming = getDashboardBgDimmingFromStorage();
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

  function saveDashboardBgDimming() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DASHBOARD_BG_DIMMING_KEY, String(dashboardBgDimming));
      }
      showToast(`Hintergrund-Abdunklung: ${dashboardBgDimming} %`);
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
    hueEnabled = Boolean((settings as any)?.hueEnabled);
    newsEnabled = Boolean(settings?.newsEnabled);
    scribbleEnabled = settings?.scribbleEnabled !== false;
    scribbleStandbySeconds = Number.isFinite(Number(settings?.scribbleStandbySeconds))
      ? Number(settings?.scribbleStandbySeconds)
      : 20;
    scribblePaperLook = settings?.scribblePaperLook !== false;
    backgroundRotateEnabled = Boolean(settings?.backgroundRotateEnabled);
    backgroundRotateImages = Array.isArray((settings as any)?.backgroundRotateImages)
      ? ((settings as any).backgroundRotateImages as string[]).map((s) => String(s || '').trim()).filter(Boolean)
      : [];

    const listNames = Array.isArray(settings?.todoListNames) ? settings!.todoListNames! : [];
    todoListNamesText = listNames.length ? listNames.join('\n') : settings?.todoListName ?? '';

    todoDefaultConnectionId =
      typeof (settings as any)?.todoDefaultConnectionId === 'number' && Number.isFinite((settings as any).todoDefaultConnectionId)
        ? (settings as any).todoDefaultConnectionId
        : null;

    const feeds = Array.isArray(settings?.newsFeeds) ? settings!.newsFeeds! : [];
    newsFeeds = (feeds.length ? feeds : ['zeit']) as NewsFeedId[];
    newsLinkTarget = (settings?.newsLinkTarget === 'external' ? 'external' : 'same') as NewsLinkTarget;

    clockStyle = normalizeClockStyle((settings as any)?.clockStyle);

    recurringSuggestionsEnabled = Boolean((settings as any)?.recurringSuggestionsEnabled);
    recurringSuggestionsWeekly = (settings as any)?.recurringSuggestionsWeekly !== false;
    recurringSuggestionsBiweekly = (settings as any)?.recurringSuggestionsBiweekly !== false;
    recurringSuggestionsMonthly = (settings as any)?.recurringSuggestionsMonthly !== false;
    recurringSuggestionsBirthdays = (settings as any)?.recurringSuggestionsBirthdays !== false;
  }

  async function saveRecurringSuggestionsSettings() {
    recurringSuggestionsError = null;
    recurringSuggestionsSaving = true;
    try {
      await setRecurringSuggestionsSettings({
        enabled: recurringSuggestionsEnabled,
        weekly: recurringSuggestionsWeekly,
        biweekly: recurringSuggestionsBiweekly,
        monthly: recurringSuggestionsMonthly,
        birthdays: recurringSuggestionsBirthdays,
      });
      await refreshSettings();
      showToast('Gespeichert');
    } catch {
      recurringSuggestionsError = 'Speichern fehlgeschlagen.';
    } finally {
      recurringSuggestionsSaving = false;
    }
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

  async function saveTodoDefaultConnectionHandler() {
    todoDefaultConnectionError = null;
    todoDefaultConnectionSaving = true;
    try {
      await setTodoDefaultConnection(todoDefaultConnectionId);
      await refreshSettings();
      showToast('Gespeichert');
    } catch {
      todoDefaultConnectionError = 'Speichern fehlgeschlagen.';
    } finally {
      todoDefaultConnectionSaving = false;
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

  async function saveNewsLinkTargetHandler() {
    newsLinkTargetError = null;
    newsLinkTargetSaving = true;
    try {
      await setNewsLinkTarget(newsLinkTarget);
      await refreshSettings();
      showToast('Link-Öffnung gespeichert');
    } catch {
      newsLinkTargetError = 'Speichern fehlgeschlagen.';
    } finally {
      newsLinkTargetSaving = false;
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

  function toggleBackgroundRotateImage(img: string) {
    const filename = String(img || '').trim();
    if (!filename) return;
    const set = new Set(backgroundRotateImages);
    if (set.has(filename)) set.delete(filename);
    else set.add(filename);
    backgroundRotateImages = Array.from(set);
  }

  async function saveBackgroundRotateImages() {
    rotateImagesError = null;
    rotateImagesSaving = true;
    try {
      await setBackgroundRotateImages(backgroundRotateImages);
      await refreshSettings();
    } catch {
      rotateImagesError = 'Speichern fehlgeschlagen.';
    } finally {
      rotateImagesSaving = false;
    }
  }

  async function refreshUsers() {
    if (!authed) {
      users = [];
      return;
    }
    users = isAdmin ? await listUsers() : await listUserRoster();
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

  async function refreshGoogle() {
    if (!authed) {
      googleConnections = [];
      return;
    }
    try {
      googleConnections = await listGoogleConnections();
    } catch {
      googleConnections = [];
    }
  }

  async function refreshCalendarSyncFeed() {
    calendarSyncError = null;
    if (!authed || !isAdmin) {
      calendarSyncFeed = null;
      return;
    }
    try {
      calendarSyncFeed = await fetchCalendarSyncFeed();
    } catch (err) {
      calendarSyncFeed = null;
      const msg = err instanceof Error ? err.message : String(err);
      calendarSyncError = msg.includes('API 403') ? 'Nur Admins können den Kalender-Feed verwalten.' : 'Kalender-Feed konnte nicht geladen werden.';
    }
  }

  async function refreshCalendarProviderSyncTargets() {
    calendarProviderSyncError = null;
    if (!authed || !isAdmin) {
      calendarProviderSyncTargets = [];
      return;
    }
    try {
      calendarProviderSyncTargets = await fetchCalendarProviderSyncTargets();
    } catch (err) {
      calendarProviderSyncTargets = [];
      const msg = err instanceof Error ? err.message : String(err);
      calendarProviderSyncError = msg.includes('API 403') ? 'Nur Admins können den Sofort-Sync verwalten.' : 'Sofort-Sync konnte nicht geladen werden.';
    }
  }

  async function refreshHueStatus() {
    if (!authed) {
      hueStatus = null;
      return;
    }
    hueStatusLoading = true;
    try {
      hueStatus = await fetchHueStatus();
    } catch (e: any) {
      hueStatus = {
        configured: false,
        available: false,
        bridgeUrl: null,
        error: e?.message || 'Hue Status konnte nicht geladen werden.'
      };
    } finally {
      hueStatusLoading = false;
    }
  }

  async function pairHue() {
    if (!authed) return;
    huePairError = null;
    huePairMessage = null;
    huePairing = true;
    try {
      await pairHueBridge();
      if (!hueEnabled) {
        hueEnabled = true;
        await setHueEnabled(true);
      }
      await refreshSettings();
      await refreshHueStatus();
      huePairMessage = 'Hue Bridge erfolgreich verbunden.';
      showToast('Hue Bridge verbunden');
    } catch (e: any) {
      const raw = String(e?.message || '');
      if (raw.includes('hue_link_button_required') || raw.includes('Bridge-Button')) {
        huePairError = 'Bitte zuerst den Button auf der Hue Bridge drücken und dann erneut versuchen.';
      } else if (raw.includes('hue_bridge_not_found')) {
        huePairError = 'Keine Hue Bridge gefunden. Stelle sicher, dass Dashbo und Bridge im selben Netzwerk sind.';
      } else {
        huePairError = 'Bridge-Kopplung fehlgeschlagen.';
      }
    } finally {
      huePairing = false;
    }
  }

  async function doLogin() {
    authError = null;
    try {
      const res = await login(email, password);
      setToken(res.token);
      authed = true;

      // Immediate UI feedback even if /auth/me is slow/unavailable
      me = {
        id: res.user.id,
        email: res.user.email,
        name: res.user.name,
        isAdmin: !!res.user.isAdmin,
        role: res.user.isAdmin ? 'admin' : 'member',
        calendarId: null
      };

      try {
        me = await fetchMe();
        isAdmin = !!me.isAdmin;
        isSuperAdmin = !!me.isSuperAdmin;
      } catch {
        // Fallback to login response if /auth/me isn't reachable yet
        isAdmin = !!res.user?.isAdmin;
        isSuperAdmin = false;
      }

      await refreshSettings();
      await refreshUsers();
      await refreshTags();
      await refreshPersons();
      await refreshOutlook();
      await refreshGoogle();
      await refreshCalendarSyncFeed();
      await refreshCalendarProviderSyncTargets();
      await refreshHueStatus();
    } catch {
      authError = 'Login fehlgeschlagen';
      authed = false;
      isAdmin = false;
      isSuperAdmin = false;
      me = null;
    }
  }

  async function doRequestEmailVerification() {
    if (!authed) return;
    try {
      await requestEmailVerification();
      showToast('Bestätigungs-Mail wurde gesendet.');
      try {
        me = await fetchMe();
        isAdmin = !!me.isAdmin;
        isSuperAdmin = !!me.isSuperAdmin;
      } catch {
        // ignore
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg.includes('API') ? 'Bestätigungs-Mail konnte nicht gesendet werden.' : msg);
      throw e;
    }
  }

  function logout() {
    setToken(null);
    authed = false;
    isAdmin = false;
    isSuperAdmin = false;
    me = null;
    users = [];
    persons = [];
    calendarSyncFeed = null;
    calendarSyncError = null;
    calendarProviderSyncTargets = [];
    calendarProviderSyncError = null;
    googleConnections = [];
    outlookStatus = null;
    outlookError = null;
    void goto('/login');
  }

  function goToLogin() {
    setToken(null);
    authError = null;
    try {
      window.location.assign('/login?force=1');
    } catch {
      void goto('/login?force=1');
    }
  }

  function redirectToLogin() {
    authError = null;
    authed = false;
    isAdmin = false;
    isSuperAdmin = false;
    me = null;
    settings = null;
    users = [];
    persons = [];
    tags = [];
    calendarSyncFeed = null;
    calendarSyncError = null;
    calendarProviderSyncTargets = [];
    calendarProviderSyncError = null;
    googleConnections = [];
    outlookConnections = [];
    outlookStatus = null;
    outlookError = null;
    setToken(null);
    void goto(getLoginRedirectPath(`${$page.url.pathname}${$page.url.search}`));
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
      await refreshCalendarProviderSyncTargets();
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
      await refreshCalendarProviderSyncTargets();
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

  async function doGoogleConnect() {
    if (!authed || calendarProviderSyncBusy) return;
    calendarProviderSyncBusy = true;
    calendarProviderSyncError = null;
    try {
      const { url } = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      calendarProviderSyncError = msg.includes('google_not_configured')
        ? 'Google ist noch nicht konfiguriert (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI).'
        : 'Google Verbindung konnte nicht gestartet werden.';
      console.error(e);
    } finally {
      calendarProviderSyncBusy = false;
    }
  }

  function directSyncErrorMessage(raw: string): string {
    if (raw.includes('outlook_calendars_readwrite_required')) return 'Outlook bitte neu verbinden, damit Calendars.ReadWrite freigegeben ist.';
    if (raw.includes('google_calendar_scope_required')) return 'Google bitte neu verbinden, damit Kalender-Schreibrechte freigegeben sind.';
    if (raw.includes('provider_connection_not_found')) return 'Das verbundene Konto wurde nicht gefunden.';
    if (raw.includes('google_not_configured')) return 'Google OAuth ist noch nicht konfiguriert.';
    return raw || 'Sofort-Sync fehlgeschlagen.';
  }

  async function doEnableDirectCalendarSync(provider: CalendarSyncProvider, connectionId: number) {
    if (!authed || !isAdmin || calendarProviderSyncBusy) return;
    calendarProviderSyncBusy = true;
    calendarProviderSyncError = null;
    try {
      calendarProviderSyncTargets = await enableCalendarProviderSyncTarget({ provider, connectionId });
      showToast(provider === 'google' ? 'Google Sofort-Sync aktiviert' : 'Outlook Sofort-Sync aktiviert');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      calendarProviderSyncError = directSyncErrorMessage(msg);
    } finally {
      calendarProviderSyncBusy = false;
    }
  }

  async function doSyncDirectCalendarTarget(targetId: number) {
    if (!authed || !isAdmin || calendarProviderSyncBusy) return;
    calendarProviderSyncBusy = true;
    calendarProviderSyncError = null;
    try {
      const result = await syncCalendarProviderSyncTarget(targetId);
      calendarProviderSyncTargets = result.targets;
      showToast('Sofort-Sync ausgeführt');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      calendarProviderSyncError = directSyncErrorMessage(msg);
    } finally {
      calendarProviderSyncBusy = false;
    }
  }

  async function doDisableDirectCalendarTarget(targetId: number) {
    if (!authed || !isAdmin || calendarProviderSyncBusy) return;
    const ok = window.confirm('Diesen Sofort-Sync entfernen? Bereits von Dashbo gespiegelt Termine werden im externen Dashbo-Kalender gelöscht.');
    if (!ok) return;
    calendarProviderSyncBusy = true;
    calendarProviderSyncError = null;
    try {
      const result = await deleteCalendarProviderSyncTarget(targetId);
      calendarProviderSyncTargets = result.targets;
      showToast('Sofort-Sync entfernt');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      calendarProviderSyncError = directSyncErrorMessage(msg);
    } finally {
      calendarProviderSyncBusy = false;
    }
  }

  async function doEnableCalendarSyncFeed() {
    if (!authed || !isAdmin || calendarSyncBusy) return;
    calendarSyncBusy = true;
    calendarSyncError = null;
    try {
      calendarSyncFeed = await enableCalendarSyncFeed();
      showToast('Kalender-Feed aktiviert');
    } catch {
      calendarSyncError = 'Kalender-Feed konnte nicht aktiviert werden.';
    } finally {
      calendarSyncBusy = false;
    }
  }

  async function doRegenerateCalendarSyncFeed() {
    if (!authed || !isAdmin || calendarSyncBusy) return;
    const ok = window.confirm('Den Kalender-Feed neu generieren? Bestehende Abos mit dem alten Link verlieren den Zugriff.');
    if (!ok) return;
    calendarSyncBusy = true;
    calendarSyncError = null;
    try {
      calendarSyncFeed = await regenerateCalendarSyncFeed();
      showToast('Kalender-Feed neu generiert');
    } catch {
      calendarSyncError = 'Kalender-Feed konnte nicht neu generiert werden.';
    } finally {
      calendarSyncBusy = false;
    }
  }

  async function doDisableCalendarSyncFeed() {
    if (!authed || !isAdmin || calendarSyncBusy) return;
    const ok = window.confirm('Den Kalender-Feed deaktivieren? Bestehende Kalender-Abos können dann keine Termine mehr abrufen.');
    if (!ok) return;
    calendarSyncBusy = true;
    calendarSyncError = null;
    try {
      calendarSyncFeed = await disableCalendarSyncFeed();
      showToast('Kalender-Feed deaktiviert');
    } catch {
      calendarSyncError = 'Kalender-Feed konnte nicht deaktiviert werden.';
    } finally {
      calendarSyncBusy = false;
    }
  }

  async function copyCalendarSyncUrl(kind: 'webcal' | 'https') {
    const link = kind === 'webcal' ? calendarSyncFeed?.webcalUrl : calendarSyncFeed?.url;
    if (!link) {
      calendarSyncError = 'Kein Kalender-Feed aktiv.';
      return;
    }

    calendarSyncError = null;
    try {
      await navigator.clipboard.writeText(link);
      showToast(kind === 'webcal' ? 'Webcal-Link kopiert' : 'HTTPS-Link kopiert');
    } catch {
      calendarSyncError = 'Link konnte nicht kopiert werden.';
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

  async function doCreateSuggestedTag(name: string, color: TagColorKey) {
    if (!authed) return;
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return;

    const alreadyExists = tags.some((t) => t.name.trim().toLowerCase() === normalizedName.toLowerCase());
    if (alreadyExists) {
      tagError = 'Tag existiert bereits.';
      return;
    }

    tagError = null;
    try {
      await createTag({ name: normalizedName, color });
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

  function openTagEditor(tag: TagDto) {
    if (!authed) return;
    editingTag = tag;
    editingTagName = tag.name;
    editingTagColor = tag.color || 'cyan';
    editingTagError = null;
  }

  function closeTagEditor() {
    if (editingTagSaving) return;
    editingTag = null;
    editingTagName = '';
    editingTagColor = 'cyan';
    editingTagError = null;
  }

  async function saveEditingTag() {
    if (!authed || !editingTag || editingTagSaving) return;
    const name = editingTagName.trim();
    const color = editingTagColor.trim();
    if (!name) {
      editingTagError = 'Name darf nicht leer sein.';
      return;
    }
    if (!isTagColorKey(color) && !isHexColor(color)) {
      editingTagError = 'Ungültige Farbe.';
      return;
    }

    editingTagSaving = true;
    editingTagError = null;
    try {
      await updateTag(editingTag.id, { name, color });
      editingTag = null;
      editingTagName = '';
      editingTagColor = 'cyan';
      await refreshTags();
      showToast('Tag gespeichert');
    } catch {
      editingTagError = 'Tag konnte nicht gespeichert werden.';
    } finally {
      editingTagSaving = false;
    }
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
      if (editingTag?.id === id) closeTagEditor();
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
    const email = newUserEmail.trim();
    const name = newUserName.trim();
    if (!email) {
      userError = 'Bitte eine E-Mail eingeben.';
      return;
    }
    if (!email.includes('@')) {
      userError = 'Bitte eine gültige E-Mail eingeben.';
      return;
    }
    if (!name) {
      userError = 'Bitte einen Namen eingeben.';
      return;
    }
    try {
      const requestedAdminInvite = isSuperAdmin ? newUserIsAdmin : false;
      const res = await inviteUser({ email, name, isAdmin: requestedAdminInvite });
      newUserEmail = '';
      newUserName = '';
      newUserIsAdmin = false;
      await refreshUsers();
      try {
        await navigator.clipboard.writeText(res.link);
        showToast(res.mailSent ? 'Einladung gesendet (Link kopiert)' : 'Link kopiert');
      } catch {
        showToast(res.mailSent ? 'Einladung gesendet' : 'Einladungslink erstellt');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('missing_public_app_url')) userError = 'PUBLIC_APP_URL fehlt (wird für Einladungslinks benötigt).';
      else if (msg.includes('email_in_use')) userError = 'Diese E-Mail wird bereits in einem anderen Kalender genutzt.';
      else if (msg.includes('already_active')) userError = 'Dieser Benutzer existiert bereits und hat schon ein Passwort gesetzt.';
      else if (msg.includes('admin_invite_forbidden')) userError = 'Nur der Mainadmin darf weitere Admins einladen.';
      else if (msg.includes('invalid_body')) userError = 'Bitte E-Mail und Name korrekt ausfüllen.';
      else userError = msg || 'Einladung konnte nicht gesendet werden.';
    }
  }

  async function copyInviteLinkForUser(u: any) {
    try {
      const res = await createInviteLinkForUser(Number(u.id));
      await navigator.clipboard.writeText(res.link);
      showToast('Einladungslink kopiert');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg.includes('missing_public_app_url') ? 'PUBLIC_APP_URL fehlt.' : 'Link konnte nicht kopiert werden.');
    }
  }

  async function copyCalendarInviteLink() {
    try {
      const res = await createCalendarInviteLink();
      await navigator.clipboard.writeText(res.link);
      showToast('Familien-Einladungslink kopiert');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg.includes('missing_public_app_url') ? 'PUBLIC_APP_URL fehlt.' : 'Link konnte nicht kopiert werden.');
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

  function openPersonEditor(person: PersonDto) {
    if (!authed) return;
    editingPerson = person;
    editingPersonName = person.name;
    editingPersonColor = person.color || 'cyan';
    editingPersonError = null;
  }

  function closePersonEditor() {
    if (editingPersonSaving) return;
    editingPerson = null;
    editingPersonName = '';
    editingPersonColor = 'cyan';
    editingPersonError = null;
  }

  async function saveEditingPerson() {
    if (!authed || !editingPerson || editingPersonSaving) return;
    const name = editingPersonName.trim();
    const color = editingPersonColor.trim();
    if (!name) {
      editingPersonError = 'Name darf nicht leer sein.';
      return;
    }
    if (!isTagColorKey(color) && !isHexColor(color)) {
      editingPersonError = 'Ungültige Farbe.';
      return;
    }

    editingPersonSaving = true;
    editingPersonError = null;
    try {
      await updatePerson(editingPerson.id, { name, color });
      editingPerson = null;
      editingPersonName = '';
      editingPersonColor = 'cyan';
      await refreshPersons();
      showToast('Person gespeichert');
    } catch {
      editingPersonError = 'Person konnte nicht gespeichert werden.';
    } finally {
      editingPersonSaving = false;
    }
  }

  async function doDeletePerson(id: number) {
    personError = null;
    try {
      await deletePerson(id);
      if (editingPerson?.id === id) closePersonEditor();
      await refreshPersons();
    } catch {
      personError = 'Person konnte nicht gelöscht werden.';
    }
  }

  onMount(async () => {
    // PWA install state
    pwaCanInstall = getCanInstall();
    pwaIsInstalled = getIsInstalled();
    const unsubPwa = pwaSubscribe(() => {
      pwaCanInstall = getCanInstall();
      pwaIsInstalled = getIsInstalled();
    });

    loadEdgeConfig();
    const sessionUser = await resolveStoredUser();
    if (!sessionUser) {
      redirectToLogin();
      return;
    }

    me = sessionUser;
    authed = true;
    isAdmin = !!sessionUser.isAdmin;
    isSuperAdmin = !!sessionUser.isSuperAdmin;

    await refreshSettings();
    await refreshTags();
    await refreshUsers();
    await refreshPersons();
    await refreshOutlook();
    await refreshGoogle();
    await refreshCalendarSyncFeed();
    await refreshCalendarProviderSyncTargets();
    await refreshHueStatus();
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

  async function saveHue() {
    if (!authed) return;
    hueError = null;
    hueSaving = true;
    try {
      await setHueEnabled(hueEnabled);
      await refreshSettings();
      await refreshHueStatus();
      showToast(hueEnabled ? 'Philips Hue aktiviert' : 'Philips Hue deaktiviert');
    } catch {
      hueError = 'Fehler beim Speichern.';
    } finally {
      hueSaving = false;
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

  async function saveScribble() {
    scribbleError = null;
    scribbleSaving = true;
    try {
      await setScribbleEnabled(scribbleEnabled);
      await refreshSettings();
      showToast(scribbleEnabled ? 'Scribble Notizen aktiviert' : 'Scribble Notizen deaktiviert');
    } catch {
      scribbleError = 'Fehler beim Speichern.';
    } finally {
      scribbleSaving = false;
    }
  }

  async function saveScribbleStandbySeconds() {
    if (!authed) return;
    scribbleStandbySecondsError = null;
    scribbleStandbySecondsSaving = true;
    try {
      const n = Math.round(Number(scribbleStandbySeconds));
      await setScribbleStandbySeconds(n);
      await refreshSettings();
      showToast('Scribble Standby-Zeit gespeichert');
    } catch {
      scribbleStandbySecondsError = 'Fehler beim Speichern.';
    } finally {
      scribbleStandbySecondsSaving = false;
    }
  }

  async function saveScribblePaperLook() {
    if (!authed) return;
    scribblePaperLookError = null;
    scribblePaperLookSaving = true;
    try {
      await setScribblePaperLook(scribblePaperLook);
      await refreshSettings();
      showToast(scribblePaperLook ? 'Papier-Look aktiviert' : 'Papier-Look deaktiviert');
    } catch {
      scribblePaperLookError = 'Fehler beim Speichern.';
    } finally {
      scribblePaperLookSaving = false;
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
      <a class="text-white/60 hover:text-white text-sm" href={returnUrl}>← Zurück</a>
    </div>

    <AccountSection
      {authed}
      {isAdmin}
      {me}
      bind:email
      bind:password
      {authError}
      {doLogin}
      {logout}
      {goToLogin}
      requestEmailVerification={doRequestEmailVerification}
    />

    <!-- PWA Install Section -->
    <section class="mb-8" id="section-install">
      <h2 class="text-lg font-semibold text-white/90 mb-4">App installieren</h2>
      <div class="bg-white/5 rounded-xl p-4">
        {#if pwaIsInstalled}
          <div class="flex items-center gap-3">
            <svg class="w-6 h-6 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>
            </svg>
            <div>
              <p class="text-sm text-white/80">Dashbo ist als App installiert.</p>
              <p class="text-xs text-white/50 mt-0.5">Du nutzt die installierte Version — Vollbild, offline-fähig.</p>
            </div>
          </div>
        {:else if pwaCanInstall}
          <div class="flex items-center justify-between gap-4">
            <div class="flex-1">
              <p class="text-sm text-white/80">Dashbo als App auf deinem Gerät installieren — Vollbild, schnellerer Zugriff und offline-fähig.</p>
            </div>
            <button
              class="shrink-0 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-sm font-medium text-white transition-colors disabled:opacity-50"
              disabled={pwaInstalling}
              on:click={async () => {
                pwaInstalling = true;
                try {
                  const ok = await pwaPromptInstall();
                  if (ok) showToast('Dashbo wurde installiert!');
                } finally {
                  pwaInstalling = false;
                }
              }}
            >
              {#if pwaInstalling}
                Installiere…
              {:else}
                <span class="flex items-center gap-2">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Installieren
                </span>
              {/if}
            </button>
          </div>
        {:else}
          <div class="space-y-3">
            <p class="text-sm text-white/80">Dashbo kann als App installiert werden — Vollbild, schnellerer Zugriff und offline-fähig.</p>
            <div class="text-xs text-white/50 space-y-2">
              <div class="flex items-start gap-2">
                <span class="font-semibold text-white/60 shrink-0">Chrome / Edge:</span>
                <span>Tippe auf das Menü (⋮) und wähle „Zum Startbildschirm hinzufügen" oder „App installieren".</span>
              </div>
              <div class="flex items-start gap-2">
                <span class="font-semibold text-white/60 shrink-0">Safari (iOS):</span>
                <span>Tippe auf das Teilen-Symbol und dann „Zum Home-Bildschirm".</span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </section>

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
      {isAdmin}
      {calendarSyncFeed}
      {calendarSyncBusy}
      {calendarSyncError}
      {calendarProviderSyncTargets}
      {calendarProviderSyncBusy}
      {calendarProviderSyncError}
      {googleConnections}
      {doEnableCalendarSyncFeed}
      {doRegenerateCalendarSyncFeed}
      {doDisableCalendarSyncFeed}
      {copyCalendarSyncUrl}
      {doGoogleConnect}
      {doEnableDirectCalendarSync}
      {doSyncDirectCalendarTarget}
      {doDisableDirectCalendarTarget}
      bind:recurringSuggestionsEnabled
      bind:recurringSuggestionsWeekly
      bind:recurringSuggestionsBiweekly
      bind:recurringSuggestionsMonthly
      bind:recurringSuggestionsBirthdays
      {recurringSuggestionsSaving}
      {recurringSuggestionsError}
      {saveRecurringSuggestionsSettings}
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
      {doCreateSuggestedTag}
      {doDeleteTag}
      {openTagEditor}
      {choosePersonColor}
      {chooseCustomPersonColor}
      {doCreatePerson}
      {doDeletePerson}
      {openPersonEditor}
      {doOutlookConnect}
      {doOutlookDisconnect}
      {doOutlookDisconnectConnection}
      {doOutlookSetConnectionColor}
    />

    <DashboardSection
      {authed}
      {settings}
      {outlookConnections}
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
      bind:hueEnabled
      {hueSaving}
      {hueError}
      {saveHue}
      {hueStatus}
      {hueStatusLoading}
      {refreshHueStatus}
      {huePairing}
      {huePairError}
      {huePairMessage}
      {pairHue}
      bind:todoListNamesText
      {todoListNamesSaving}
      {todoListNamesError}
      saveTodoListNames={saveTodoListNamesHandler}
      bind:todoDefaultConnectionId
      {todoDefaultConnectionSaving}
      {todoDefaultConnectionError}
      saveTodoDefaultConnection={saveTodoDefaultConnectionHandler}
      bind:newsEnabled
      {newsSaving}
      {newsError}
      {saveNews}
      bind:scribbleEnabled
      {scribbleSaving}
      {scribbleError}
      {saveScribble}
      bind:scribbleStandbySeconds
      {scribbleStandbySecondsSaving}
      {scribbleStandbySecondsError}
      {saveScribbleStandbySeconds}
      bind:scribblePaperLook
      {scribblePaperLookSaving}
      {scribblePaperLookError}
      {saveScribblePaperLook}
      bind:newsFeeds
      {newsFeedsSaving}
      {newsFeedsError}
      saveNewsFeeds={saveNewsFeedsHandler}
      bind:newsLinkTarget
      {newsLinkTargetSaving}
      {newsLinkTargetError}
      saveNewsLinkTarget={saveNewsLinkTargetHandler}
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
      bind:edgeHeosEnabled
      {saveEdgeHeosEnabled}
      bind:edgeHeosHosts
      {isLocalhostUrl}
      bind:dashboardGlassBlurEnabled
      {saveDashboardGlassBlurEnabled}
      bind:dashboardTextStyle
      {saveDashboardTextStyle}
      bind:dashboardBgDimming
      {saveDashboardBgDimming}
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
      bind:backgroundRotateImages
      {rotateImagesSaving}
      {rotateImagesError}
      {toggleBackgroundRotateImage}
      {saveBackgroundRotateImages}
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
        {isSuperAdmin}
        {users}
        bind:newUserEmail
        bind:newUserName
        bind:newUserIsAdmin
        {userError}
        bind:resetFor
        bind:resetPassword
        bind:resetError
        bind:deletingFor
        {doCreateUser}
        copyInviteLinkForUser={copyInviteLinkForUser}
        copyCalendarInviteLink={copyCalendarInviteLink}
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

<CalendarItemEditModal
  open={Boolean(editingTag)}
  title="Tag bearbeiten"
  bind:name={editingTagName}
  bind:color={editingTagColor}
  saving={editingTagSaving}
  error={editingTagError}
  {colorBg}
  {colorNames}
  {isTagColorKey}
  {isHexColor}
  onSave={saveEditingTag}
  onClose={closeTagEditor}
/>

<CalendarItemEditModal
  open={Boolean(editingPerson)}
  title="Person bearbeiten"
  bind:name={editingPersonName}
  bind:color={editingPersonColor}
  saving={editingPersonSaving}
  error={editingPersonError}
  {colorBg}
  {colorNames}
  {isTagColorKey}
  {isHexColor}
  onSave={saveEditingPerson}
  onClose={closePersonEditor}
/>
