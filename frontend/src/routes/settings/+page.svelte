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
    setNewsEnabled,
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

  import {
    EDGE_PLAYER_WIDGET_ENABLED_KEY,
    edgeHealth,
    normalizeEdgeBaseUrl,
    edgeFetchJson
  } from '$lib/edge';

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

  let newsEnabled = false;
  let newsSaving = false;
  let newsError: string | null = null;

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
  let edgeTestBusy = false;
  let edgeTestMessage: string | null = null;
  let edgeTestOk: boolean | null = null;
  let edgeSetupOpen = false;
  let edgeScanBusy = false;
  let edgeScanMessage: string | null = null;
  let edgeScanPollId = 0;
  let edgeScanPollTimer: ReturnType<typeof setTimeout> | null = null;

  type EdgeMusicStatusDto = {
    ok: boolean;
    scanning: boolean;
    lastScanAt: string | null;
    lastError: string | null;
    libraryPath: string;
    counts: { tracks: number; albums: number };
  };

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
          edgeScanMessage = `Scan läuft… (${st.counts?.albums ?? 0} Alben · ${st.counts?.tracks ?? 0} Tracks)`;
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
  }

  function saveEdgeConfig() {
    edgeSaving = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(EDGE_BASE_URL_KEY, normalizeEdgeBaseUrl(edgeBaseUrl));
        localStorage.setItem(EDGE_TOKEN_KEY, edgeToken);
      }
      showToast('Pi Edge gespeichert');
    } finally {
      edgeSaving = false;
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

  async function testEdgeConnection() {
    edgeTestBusy = true;
    edgeTestMessage = null;
    edgeTestOk = null;
    try {
      const health = await edgeHealth(edgeBaseUrl, edgeToken || undefined);
      edgeTestOk = Boolean(health?.ok);
      edgeTestMessage = health?.ok ? `OK: ${health.service ?? 'edge'}` : 'Antwort ungültig.';
      if (health?.ok) showToast('Pi Edge erreichbar');
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
    } catch {
      userError = 'User konnte nicht angelegt werden.';
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
      await createPerson({ name: newPersonName.trim(), color: newPersonColor });
      newPersonName = '';
      newPersonColor = 'cyan';
      personColorMenuOpen = false;
      await refreshPersons();
    } catch {
      personError = 'Person konnte nicht angelegt werden.';
    }
  }

  function choosePersonColor(c: PersonColorKey) {
    newPersonColor = c;
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

    <!-- Account Section -->
    <section class="mb-8" id="section-account">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-white/90">Account</h2>
        {#if authed}
          <button class="text-sm text-white/60 hover:text-white" on:click={logout}>Logout</button>
        {/if}
      </div>

      {#if !authed}
        <div class="bg-white/5 rounded-xl p-4">
          <div class="flex gap-3">
            <input
              class="flex-1 h-10 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="E-Mail"
              bind:value={email}
              autocomplete="username"
            />
            <input
              class="flex-1 h-10 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="Passwort"
              type="password"
              bind:value={password}
              autocomplete="current-password"
            />
            <button
              class="h-10 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium"
              on:click={doLogin}
            >
              Login
            </button>
          </div>
          {#if authError}
            <div class="mt-2 text-red-400 text-sm">{authError}</div>
          {/if}
        </div>
      {:else}
        <div class="bg-white/5 rounded-xl p-4 text-white/70 text-sm">
          Eingeloggt{isAdmin ? ' als Admin' : ''}.
        </div>
      {/if}
    </section>

    {#if showFirstRunWizard}
      <section class="mb-8" id="section-first-run">
        <div class="bg-white/5 rounded-xl p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-lg font-semibold text-white/90">Erste Schritte</div>
              <div class="text-sm text-white/60">Einmal einrichten, danach läuft das Dashboard stabil durch.</div>
            </div>
            <button class="text-sm text-white/60 hover:text-white" type="button" on:click={hideFirstRun}>Später</button>
          </div>

          <div class="mt-4 space-y-2">
            {#if isAdmin}
              <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
                <div class="min-w-0">
                  <div class="text-sm font-medium">
                    {wizardNeedsUsers ? '○' : '✓'} Benutzer anlegen
                  </div>
                  <div class="text-xs text-white/60">Mindestens einen weiteren Account erstellen.</div>
                </div>
                <button
                  class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
                  type="button"
                  on:click={() => scrollToSection('section-users')}
                >
                  Öffnen
                </button>
              </div>
            {/if}

            <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-medium">{wizardNeedsWeather ? '○' : '✓'} Wetter‑Ort setzen</div>
                <div class="text-xs text-white/60">Damit Wetter/Forecast korrekt geladen werden.</div>
              </div>
              <button
                class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
                type="button"
                on:click={() => scrollToSection('section-weather')}
              >
                Öffnen
              </button>
            </div>

            <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-medium">• Hintergrund auswählen (optional)</div>
                <div class="text-xs text-white/60">Optional: Bilder hochladen und als Background setzen.</div>
              </div>
              <button
                class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
                type="button"
                on:click={() => scrollToSection('section-background')}
              >
                Öffnen
              </button>
            </div>

            <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-medium">• News (ZEIT RSS) aktivieren (optional)</div>
                <div class="text-xs text-white/60">Zeigt bis zu 4 Artikel-Links unter To‑Do.</div>
              </div>
              <button
                class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
                type="button"
                on:click={() => scrollToSection('section-weather')}
              >
                Öffnen
              </button>
            </div>

            <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-medium">{wizardNeedsTags ? '○' : '✓'} Erste Tags anlegen</div>
                <div class="text-xs text-white/60">Farben/Kategorien für Termine.</div>
              </div>
              <button
                class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
                type="button"
                on:click={() => scrollToSection('section-tags')}
              >
                Öffnen
              </button>
            </div>

            <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-medium">{wizardNeedsPersons ? '○' : '✓'} Personen anlegen</div>
                <div class="text-xs text-white/60">Damit Termine Personen zugeordnet werden können.</div>
              </div>
              <button
                class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
                type="button"
                on:click={() => scrollToSection('section-persons')}
              >
                Öffnen
              </button>
            </div>

            <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-medium">{wizardOutlookConnected ? '✓' : '○'} Outlook verbinden (optional)</div>
                <div class="text-xs text-white/60">Zusätzliche Termine (nur anzeigen) pro User.</div>
              </div>
              <button
                class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
                type="button"
                on:click={() => scrollToSection('section-outlook')}
              >
                Öffnen
              </button>
            </div>
          </div>
        </div>
      </section>
    {/if}

    <!-- Kalender Section -->
    <section class="mb-8" id="section-calendar">
      <h2 class="text-lg font-semibold text-white/90 mb-4">Kalender</h2>

      <div class="space-y-4">
        <!-- Tags -->
        <div class="bg-white/5 rounded-xl p-4" id="section-tags">
          <div class="flex items-center justify-between mb-3">
            <div class="font-medium">Tags</div>
            <div class="text-white/50 text-xs">Farben für Termine</div>
          </div>

          <div class="flex gap-2 mb-3">
            <input
              class="flex-1 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="Neuer Tag"
              bind:value={newTagName}
              disabled={!authed}
            />
            <div class="relative">
              <button
                class="h-9 px-3 rounded-lg bg-white/10 flex items-center gap-2 text-sm disabled:opacity-50"
                on:click|stopPropagation={() => (tagColorMenuOpen = !tagColorMenuOpen)}
                disabled={!authed}
              >
                {#if isTagColorKey(newTagColor)}
                  <span class={`w-3 h-3 rounded-full ${colorBg[newTagColor]}`}></span>
                {:else}
                  <span class="w-3 h-3 rounded-full" style={`background-color: ${newTagColor}`}></span>
                {/if}
                <span class="text-white/60">▾</span>
              </button>
              {#if tagColorMenuOpen}
                <div class="absolute right-0 mt-1 z-20 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                  {#each colorNames as c}
                    <button
                      class="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-white/10"
                      on:click={() => chooseTagColor(c)}
                    >
                      <span class={`w-3 h-3 rounded-full ${colorBg[c]}`}></span>
                      <span class="capitalize">{c}</span>
                    </button>
                  {/each}

                  <div class="px-3 py-2 border-t border-white/10">
                    <label class="flex items-center justify-between gap-2 text-sm text-white/80">
                      <span>Eigene Farbe</span>
                      <input
                        type="color"
                        class="h-7 w-10 bg-transparent border-0 p-0"
                        value={isHexColor(newTagColor) ? newTagColor : '#22d3ee'}
                        on:input={(e) => chooseCustomTagColor((/** @type {HTMLInputElement} */ (e.currentTarget)).value)}
                      />
                    </label>
                  </div>
                </div>
              {/if}
            </div>
            <button
              class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
              on:click={doCreateTag}
              disabled={!authed || !newTagName.trim()}
            >
              +
            </button>
          </div>

          {#if tagError}
            <div class="text-red-400 text-xs mb-2">{tagError}</div>
          {/if}

          <div class="flex flex-wrap gap-2">
            {#each tags as t (t.id)}
              <div class="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5 text-sm">
                {#if isTagColorKey(t.color)}
                  <span class={`w-2.5 h-2.5 rounded-full ${colorBg[t.color]}`}></span>
                {:else}
                  <span class="w-2.5 h-2.5 rounded-full" style={`background-color: ${t.color}`}></span>
                {/if}
                <span>{t.name}</span>
                {#if authed}
                  <button class="text-white/40 hover:text-white/70 ml-1" on:click={() => doDeleteTag(t.id)}>×</button>
                {/if}
              </div>
            {/each}
            {#if tags.length === 0}
              <div class="text-white/40 text-sm">Keine Tags</div>
            {/if}
          </div>
        </div>

        <!-- Personen -->
        <div class="bg-white/5 rounded-xl p-4" id="section-persons">
          <div class="flex items-center justify-between mb-3">
            <div class="font-medium">Personen</div>
            <div class="text-white/50 text-xs">Für Termine zuweisbar</div>
          </div>

          {#if !authed}
            <div class="text-white/40 text-sm">Login erforderlich</div>
          {:else}
            <div class="flex gap-2 mb-3">
              <input
                class="flex-1 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
                placeholder="Name"
                bind:value={newPersonName}
              />
              <div class="relative">
                <button
                  class="h-9 px-3 rounded-lg bg-white/10 flex items-center gap-2 text-sm"
                  on:click|stopPropagation={() => (personColorMenuOpen = !personColorMenuOpen)}
                >
                  <span class={`w-3 h-3 rounded-full ${colorBg[newPersonColor]}`}></span>
                  <span class="text-white/60">▾</span>
                </button>
                {#if personColorMenuOpen}
                  <div class="absolute right-0 mt-1 z-20 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                    {#each colorNames as c}
                      <button
                        class="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-white/10"
                        on:click={() => choosePersonColor(c as PersonColorKey)}
                      >
                        <span class={`w-3 h-3 rounded-full ${colorBg[c]}`}></span>
                        <span class="capitalize">{c}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
              <button
                class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
                on:click={doCreatePerson}
                disabled={!newPersonName.trim()}
              >
                +
              </button>
            </div>

            {#if personError}
              <div class="text-red-400 text-xs mb-2">{personError}</div>
            {/if}

            <div class="flex flex-wrap gap-2">
              {#each persons as p (p.id)}
                <div class="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5 text-sm">
                  <span class={`w-2.5 h-2.5 rounded-full ${colorBg[p.color as TagColorKey]}`}></span>
                  <span>{p.name}</span>
                  <button class="text-white/40 hover:text-white/70 ml-1" on:click={() => doDeletePerson(p.id)}>×</button>
                </div>
              {/each}
              {#if persons.length === 0}
                <div class="text-white/40 text-sm">Keine Personen</div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Outlook (privat, nur anzeigen) -->
        <div class="bg-white/5 rounded-xl p-4" id="section-outlook">
          <div class="flex items-center justify-between mb-3">
            <div class="font-medium">Outlook Kalender</div>
            <div class="text-white/50 text-xs">Privat · nur anzeigen</div>
          </div>

          {#if !authed}
            <div class="text-white/40 text-sm">Login erforderlich</div>
          {:else}
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm text-white/70">
                {#if (outlookConnections?.length ?? 0) > 0}
                  Verbunden ({outlookConnections.length})
                {:else if outlookStatus?.connected}
                  Verbunden
                {:else}
                  Nicht verbunden
                {/if}
              </div>

              <div class="flex items-center gap-2">
                <button
                  class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
                  on:click={doOutlookConnect}
                  disabled={outlookBusy}
                >
                  {#if (outlookConnections?.length ?? 0) > 0 || outlookStatus?.connected}
                    Weiteren verbinden
                  {:else}
                    Verbinden
                  {/if}
                </button>

                {#if outlookStatus?.connected}
                  <button
                    class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
                    on:click={doOutlookDisconnect}
                    disabled={outlookBusy}
                  >
                    Alle trennen
                  </button>
                {/if}
              </div>
            </div>

            {#if (outlookConnections?.length ?? 0) > 0}
              <div class="mt-3 space-y-2">
                {#each outlookConnections as c (c.id)}
                  <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
                    <div class="min-w-0 flex items-center gap-3">
                      <div class="relative">
                        <button
                          type="button"
                          class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium flex items-center gap-2"
                          aria-label="Farbe"
                          disabled={outlookBusy}
                          on:click|stopPropagation={() => (outlookColorMenuFor = outlookColorMenuFor === c.id ? null : c.id)}
                        >
                          <span class={`w-3 h-3 rounded-full ${colorBg[c.color as TagColorKey]}`}></span>
                          <span class="text-white/70">Farbe</span>
                          <span class="text-white/50">▼</span>
                        </button>

                        {#if outlookColorMenuFor === c.id}
                          <div class="absolute z-20 mt-2 w-44 rounded-xl bg-black/80 backdrop-blur border border-white/10 overflow-hidden">
                            {#each colorNames as col}
                              <button
                                class="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-white/10"
                                on:click={() => doOutlookSetConnectionColor(c.id, col as TagColorKey)}
                              >
                                <span class={`w-3 h-3 rounded-full ${colorBg[col]}`}></span>
                                <span class="capitalize">{col}</span>
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>

                      <div class="min-w-0">
                        <div class="text-sm font-medium text-white/90 truncate">
                          {c.displayName ?? c.email ?? 'Outlook'}
                        </div>
                        {#if c.email && c.displayName}
                          <div class="text-xs text-white/50 truncate">{c.email}</div>
                        {/if}
                      </div>
                    </div>

                    <button
                      class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
                      on:click={() => doOutlookDisconnectConnection(c.id)}
                      disabled={outlookBusy}
                    >
                      Trennen
                    </button>
                  </div>
                {/each}
              </div>
            {/if}

            {#if outlookError}
              <div class="mt-2 text-red-400 text-xs">{outlookError}</div>
            {/if}
          {/if}
        </div>
      </div>
    </section>

    <!-- Dashboard Section -->
    <section class="mb-8" id="section-dashboard">
      <h2 class="text-lg font-semibold text-white/90 mb-4">Dashboard</h2>

      <div class="space-y-4">
        <!-- Wetter -->
        <div class="bg-white/5 rounded-xl p-4" id="section-weather">
          <div class="font-medium mb-3">Wetter & Feiertage</div>

          <div class="flex gap-2 mb-3">
            <input
              class="flex-1 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="Ort (z.B. Berlin)"
              bind:value={weatherLocation}
              disabled={!authed}
            />
            <button
              class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
              on:click={saveWeatherLocation}
              disabled={!authed || weatherSaving}
            >
              Speichern
            </button>
          </div>

          {#if weatherError}
            <div class="text-red-400 text-xs mb-2">{weatherError}</div>
          {/if}

          <label class="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              class="rounded bg-white/10 border-0"
              bind:checked={holidaysEnabled}
              disabled={!authed}
            />
            Feiertage anzeigen
            <button
              class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={saveHolidays}
              disabled={!authed || holidaysSaving}
            >
              Speichern
            </button>
          </label>

          {#if holidaysError}
            <div class="text-red-400 text-xs mt-1">{holidaysError}</div>
          {/if}

          <label class="flex items-center gap-2 text-sm text-white/80 mt-3">
            <input
              type="checkbox"
              class="rounded bg-white/10 border-0"
              bind:checked={todoEnabled}
              disabled={!authed}
            />
            To-Do Liste anzeigen
            {#if settings?.todoListName}
              <span class="text-white/50">({settings.todoListName})</span>
            {/if}
            <button
              class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={saveTodo}
              disabled={!authed || todoSaving}
            >
              Speichern
            </button>
          </label>

          {#if todoError}
            <div class="text-red-400 text-xs mt-1">{todoError}</div>
          {/if}

          <label class="flex items-center gap-2 text-sm text-white/80 mt-3">
            <input
              type="checkbox"
              class="rounded bg-white/10 border-0"
              bind:checked={newsEnabled}
              disabled={!authed}
            />
            News (ZEIT RSS) anzeigen
            <button
              class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={saveNews}
              disabled={!authed || newsSaving}
            >
              Speichern
            </button>
          </label>

          {#if newsError}
            <div class="text-red-400 text-xs mt-1">{newsError}</div>
          {/if}

          {#if !authed}
            <div class="text-white/40 text-xs mt-2">Bitte einloggen, um Einstellungen zu ändern.</div>
          {/if}
        </div>

        <!-- Musik / HEOS (Pi Edge) -->
        <div class="bg-white/5 rounded-xl p-4" id="section-edge">
          <div class="flex items-center justify-between mb-3">
            <div class="font-medium">Musik & HEOS (Pi Edge)</div>
            <button
              class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
              type="button"
              on:click={() => (edgeSetupOpen = true)}
            >
              Setup
            </button>
          </div>

          <div class="text-xs text-white/60 mb-3">
            DashbO läuft auf Mittwald; für SSD-Musik und HEOS im LAN wird ein lokaler Edge-Service am Pi genutzt.
            Verwende hier eine HTTPS-URL (sonst blockt der Browser Mixed-Content).
          </div>

          <div class="grid md:grid-cols-3 gap-2">
            <input
              class="md:col-span-2 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="Edge Base URL (z.B. https://pi.local:8787)"
              bind:value={edgeBaseUrl}
            />
            <button
              class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
              on:click={saveEdgeConfig}
              disabled={edgeSaving}
            >
              Speichern
            </button>
          </div>

          <div class="mt-2 grid md:grid-cols-3 gap-2">
            <input
              class="md:col-span-2 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="Edge Token (Bearer)"
              bind:value={edgeToken}
            />
          </div>

          <label class="flex items-center gap-2 text-sm text-white/80 mt-3">
            <input
              type="checkbox"
              class="rounded bg-white/10 border-0"
              bind:checked={edgePlayerWidgetEnabled}
              on:change={saveEdgePlayerWidgetEnabled}
            />
            Player Widget anzeigen
          </label>

          <div class="flex items-center gap-2 mt-3">
            <button
              class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={testEdgeConnection}
              disabled={edgeTestBusy || !edgeBaseUrl.trim()}
            >
              Verbindung testen
            </button>

            <button
              class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={scanEdgeNow}
              disabled={edgeScanBusy || !edgeBaseUrl.trim()}
              title="Scanne die Musikbibliothek auf dem Edge (force)"
            >
              Rescan starten
            </button>

            {#if edgeTestMessage}
              <div class={edgeTestOk ? 'text-emerald-300 text-xs' : 'text-red-300 text-xs'}>{edgeTestMessage}</div>
            {/if}

            {#if edgeScanMessage}
              <div class="text-white/70 text-xs">{edgeScanMessage}</div>
            {/if}
          </div>

          <div class="text-xs text-white/50 mt-2">
            Diese Werte werden nur im Browser (localStorage) gespeichert.
          </div>
        </div>

        <!-- Hintergründe -->
        <div class="bg-white/5 rounded-xl p-4" id="section-background">
          <div class="font-medium mb-3">Hintergrund</div>

          <div class="flex items-center gap-3 mb-3">
            <label class="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                class="rounded bg-white/10 border-0"
                bind:checked={backgroundRotateEnabled}
                disabled={!authed || rotateSaving}
              />
              Zufällig wechseln (alle 10 Minuten)
            </label>
            <button
              class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={saveBackgroundRotate}
              disabled={!authed || rotateSaving}
            >
              Speichern
            </button>
          </div>

          {#if rotateError}
            <div class="text-red-400 text-xs mb-2">{rotateError}</div>
          {/if}

          <div class="flex gap-2 mb-3">
            <input
              class="flex-1 text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:text-sm file:hover:bg-white/15"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              on:change={(e) => onChooseUploadFilesFrom('files', (e.currentTarget as HTMLInputElement).files)}
              disabled={!authed}
            />

            <button
              class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
              type="button"
              on:click={() => folderInputEl?.click()}
              disabled={!authed}
            >
              Ordner
            </button>

            <input
              class="hidden"
              bind:this={folderInputEl}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              webkitdirectory
              on:change={(e) => onChooseUploadFilesFrom('folder', (e.currentTarget as HTMLInputElement).files)}
              disabled={!authed}
            />

            <button
              class={`h-9 px-4 rounded-lg text-sm font-medium disabled:opacity-50 ${
                uploadFiles.length > 0 && !savingBg
                  ? 'bg-emerald-500/30 hover:bg-emerald-500/40'
                  : 'bg-white/20 hover:bg-white/25'
              }`}
              on:click={doUpload}
              disabled={!authed || uploadFiles.length === 0 || savingBg}
            >
              Upload
            </button>
          </div>

          <div class="flex items-center justify-between text-xs text-white/50 mb-2">
            <div>{uploadFiles.length > 0 ? `${uploadFiles.length} Datei(en) ausgewählt` : 'Mehrere Bilder oder einen Ordner auswählen (Browser-abhängig)'}</div>
            {#if savingBg && uploadTotalLabel}
              <div>{uploadTotalLabel}</div>
            {/if}
          </div>

          {#if savingBg}
            <div class="h-2 rounded-full bg-white/10 overflow-hidden mb-2">
              <div class="h-full bg-white/40" style={`width: ${Math.round(uploadProgress * 100)}%`}></div>
            </div>
          {/if}

          {#if uploadError}
            <div class="text-red-400 text-xs mb-2">{uploadError}</div>
          {/if}

          {#if (settings?.images?.length ?? 0) > 0}
            <div class="grid grid-cols-4 gap-2">
              {#each settings?.images ?? [] as img}
                <div class="relative">
                  <button
                    class={`w-full aspect-video rounded-lg overflow-hidden border-2 ${settings?.background === img ? 'border-white/60' : 'border-transparent'} hover:border-white/30`}
                    on:click={() => chooseBg(img)}
                    disabled={!authed || savingBg || deletingBg}
                    aria-label="Hintergrund auswählen"
                  >
                    <img class="w-full h-full object-cover" src={`/api/media/${img}`} alt={img} />
                  </button>

                  <button
                    type="button"
                    class="absolute top-1 right-1 h-7 w-7 rounded-md bg-black/55 hover:bg-black/70 text-white/80 grid place-items-center disabled:opacity-50"
                    aria-label="Bild löschen"
                    on:click|stopPropagation={() => {
                      deleteBgError = null;
                      deleteBgFor = img;
                    }}
                    disabled={!authed || savingBg || deletingBg}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-white/40 text-sm">Keine Bilder hochgeladen</div>
          {/if}
        </div>
      </div>
    </section>

    <!-- Admin Section -->
    {#if authed && isAdmin}
      <section class="mb-8" id="section-users">
        <h2 class="text-lg font-semibold text-white/90 mb-4">Benutzerverwaltung</h2>

        <div class="bg-white/5 rounded-xl p-4">
          <div class="font-medium mb-3">Neuer Benutzer</div>

          <div class="grid grid-cols-3 gap-2 mb-2">
            <input
              class="h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="E-Mail"
              bind:value={newUserEmail}
            />
            <input
              class="h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="Name"
              bind:value={newUserName}
            />
            <input
              class="h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="Passwort"
              type="password"
              bind:value={newUserPassword}
            />
          </div>

          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" class="rounded bg-white/10 border-0" bind:checked={newUserIsAdmin} />
              Admin
            </label>
            <button
              class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium"
              on:click={doCreateUser}
            >
              Anlegen
            </button>
          </div>

          {#if userError}
            <div class="text-red-400 text-xs mt-2">{userError}</div>
          {/if}

          <!-- User List -->
          {#if users.length > 0}
            <div class="mt-4 pt-4 border-t border-white/10 space-y-2">
              {#each users as u (u.id)}
                <div class="flex items-center justify-between py-2">
                  <div>
                    <span class="font-medium">{u.name}</span>
                    <span class="text-white/50 text-sm ml-2">{u.email}</span>
                    {#if u.isAdmin}
                      <span class="text-xs bg-white/10 rounded px-1.5 py-0.5 ml-2">Admin</span>
                    {/if}
                  </div>
                  <div class="flex gap-2">
                    <button
                      class="text-xs text-white/50 hover:text-white"
                      on:click={() => { resetFor = u; resetPassword = ''; resetError = null; }}
                    >
                      Passwort
                    </button>
                    <button
                      class="text-xs text-white/50 hover:text-red-400"
                      on:click={() => (deletingFor = u)}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    {/if}
  </div>

  {#if deleteBgFor}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="fixed inset-0 z-50 bg-black/60" on:click={() => (!deletingBg ? (deleteBgFor = null) : undefined)}>
      <div class="min-h-full flex items-center justify-center p-6">
        <div class="w-full max-w-md rounded-2xl bg-black/70 border border-white/10 backdrop-blur-md p-5" on:click|stopPropagation>
          <div class="text-base font-semibold mb-1">Bild löschen?</div>
          <div class="text-sm text-white/70 mb-4 break-all">{deleteBgFor}</div>

          {#if deleteBgError}
            <div class="text-red-400 text-xs mb-3">{deleteBgError}</div>
          {/if}

          <div class="flex justify-end gap-2">
            <button
              class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
              type="button"
              on:click={() => (deleteBgFor = null)}
              disabled={deletingBg}
            >
              Abbrechen
            </button>
            <button
              class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
              type="button"
              on:click={confirmDeleteBg}
              disabled={deletingBg}
            >
              Löschen
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if folderConfirmOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="fixed inset-0 z-50 bg-black/60" on:click={cancelFolderSelection}>
      <div class="min-h-full flex items-center justify-center p-6">
        <div class="w-full max-w-md rounded-2xl bg-black/70 border border-white/10 backdrop-blur-md p-5" on:click|stopPropagation>
          <div class="text-base font-semibold mb-1">Ordner-Upload übernehmen?</div>
          <div class="text-sm text-white/70 mb-4">
            {pendingFolderFiles.length} Datei(en) erkannt. Der Upload läuft anschließend Datei für Datei. Danach bitte auf <span class="font-medium">Upload</span> klicken.
          </div>

          <div class="flex items-center justify-end gap-2">
            <button
              class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium"
              type="button"
              on:click={cancelFolderSelection}
            >
              Abbrechen
            </button>
            <button
              class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium"
              type="button"
              on:click={confirmFolderSelection}
            >
              Übernehmen
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Reset Password Modal -->
{#if resetFor}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" on:click={(e) => e.currentTarget === e.target && (resetFor = null)}>
    <div class="absolute inset-0 bg-black/70"></div>
    <div class="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-sm border border-white/10">
      <div class="font-semibold text-lg mb-1">Passwort zurücksetzen</div>
      <div class="text-white/50 text-sm mb-4">{resetFor.email}</div>

      <input
        class="w-full h-10 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40 mb-3"
        placeholder="Neues Passwort"
        type="password"
        bind:value={resetPassword}
      />

      {#if resetError}
        <div class="text-red-400 text-xs mb-3">{resetError}</div>
      {/if}

      <div class="flex gap-2">
        <button class="flex-1 h-10 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium" on:click={doResetPassword}>
          Speichern
        </button>
        <button class="flex-1 h-10 rounded-lg bg-white/10 hover:bg-white/15 text-sm" on:click={() => (resetFor = null)}>
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete User Modal -->
{#if deletingFor}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" on:click={(e) => e.currentTarget === e.target && (deletingFor = null)}>
    <div class="absolute inset-0 bg-black/70"></div>
    <div class="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-sm border border-white/10">
      <div class="font-semibold text-lg mb-1">Benutzer löschen?</div>
      <div class="text-white/50 text-sm mb-4">{deletingFor.name} ({deletingFor.email})</div>

      <div class="flex gap-2">
        <button class="flex-1 h-10 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium" on:click={doDeleteUser}>
          Löschen
        </button>
        <button class="flex-1 h-10 rounded-lg bg-white/10 hover:bg-white/15 text-sm" on:click={() => (deletingFor = null)}>
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edge Setup Modal -->
{#if edgeSetupOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" on:click={(e) => e.currentTarget === e.target && (edgeSetupOpen = false)}>
    <div class="absolute inset-0 bg-black/70"></div>
    <div class="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-lg border border-white/10">
      <div class="flex items-start justify-between gap-4 mb-3">
        <div>
          <div class="font-semibold text-lg">Pi/PC Edge Setup</div>
          <div class="text-white/50 text-sm">Lokale Musikbibliothek + HEOS über einen lokalen Edge-Service</div>
        </div>
        <button class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm" on:click={() => (edgeSetupOpen = false)}>
          Schließen
        </button>
      </div>

      <div class="text-sm text-white/80 space-y-3">
        <div>
          <div class="font-medium mb-1">Wichtig: HTTPS (Mixed Content)</div>
          <div class="text-white/70">
            DashbO läuft über <span class="font-medium">https://dashbohub.de</span>. Browser blockieren Aufrufe zu einem lokalen
            <span class="font-medium">http://</span>-Edge. Verwende daher eine <span class="font-medium">https://</span>-URL (z.B. via Caddy/Nginx Reverse Proxy).
          </div>
        </div>

        <div>
          <div class="font-medium mb-1">Windows PC</div>
          <div class="text-white/70">
            1) Docker Desktop starten
            <br />2) Musik in deiner Bibliothek ablegen (z.B. <span class="font-medium">C:\\Users\\huber\\Musik</span>)
            <br />3) Edge starten: <span class="font-medium">docker compose -f docker-compose.win-edge.yml up -d --build</span>
            <br />4) Hier in den Einstellungen die Edge Base URL + Token eintragen
          </div>
        </div>

        <div>
          <div class="font-medium mb-1">Raspberry Pi</div>
          <div class="text-white/70">
            1) SSD nach <span class="font-medium">/mnt/music</span> mounten
            <br />2) Edge starten: <span class="font-medium">docker compose -f docker-compose.pi-edge.yml up -d --build</span>
            <br />3) Edge Base URL + Token im Browser-Gerät speichern
          </div>
        </div>

        <div class="text-white/60 text-xs">
          Hinweis: Die Edge-Zugangsdaten und der Player-Widget Toggle werden nur lokal im Browser gespeichert (localStorage).
        </div>
      </div>
    </div>
  </div>
{/if}
