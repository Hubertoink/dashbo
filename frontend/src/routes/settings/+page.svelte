<script lang="ts">
  import { onMount } from 'svelte';
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

  let tags: TagDto[] = [];
  let newTagName = '';
  let newTagColor: TagColorKey = 'cyan';
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

  async function refreshSettings() {
    settings = await fetchSettings();
    weatherLocation = settings?.weatherLocation ?? '';
    holidaysEnabled = Boolean(settings?.holidaysEnabled);
    todoEnabled = settings?.todoEnabled !== false;
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
      await createTag({ name: newTagName.trim(), color: newTagColor });
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
    await refreshSettings();
    await refreshTags();

    const existing = getStoredToken();
    if (existing) {
      authed = true;
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
    }
  });

  async function saveWeatherLocation() {
    if (!authed || !isAdmin) return;
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
    if (!authed || !isAdmin) return;
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
    if (!authed || !isAdmin) return;
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
    <section class="mb-8">
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

    <!-- Kalender Section -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold text-white/90 mb-4">Kalender</h2>

      <div class="space-y-4">
        <!-- Tags -->
        <div class="bg-white/5 rounded-xl p-4">
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
                <span class={`w-3 h-3 rounded-full ${colorBg[newTagColor]}`}></span>
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
                <span class={`w-2.5 h-2.5 rounded-full ${colorBg[t.color]}`}></span>
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
        <div class="bg-white/5 rounded-xl p-4">
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
        <div class="bg-white/5 rounded-xl p-4">
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
    <section class="mb-8">
      <h2 class="text-lg font-semibold text-white/90 mb-4">Dashboard</h2>

      <div class="space-y-4">
        <!-- Wetter -->
        <div class="bg-white/5 rounded-xl p-4">
          <div class="font-medium mb-3">Wetter & Feiertage</div>

          <div class="flex gap-2 mb-3">
            <input
              class="flex-1 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="Ort (z.B. Berlin)"
              bind:value={weatherLocation}
              disabled={!authed || !isAdmin}
            />
            <button
              class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
              on:click={saveWeatherLocation}
              disabled={!authed || !isAdmin || weatherSaving}
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
              disabled={!authed || !isAdmin}
            />
            Feiertage anzeigen
            <button
              class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={saveHolidays}
              disabled={!authed || !isAdmin || holidaysSaving}
            >
              Speichern
            </button>
          </label>

          {#if holidaysError}
            <div class="text-red-400 text-xs mt-1">{holidaysError}</div>
          {/if}

          {#if settings?.todoListName}
            <div class="text-white/40 text-xs mt-2">
              Verwendete To-Do-Liste: <span class="font-medium">{settings.todoListName}</span>
            </div>
          {/if}

          <label class="flex items-center gap-2 text-sm text-white/80 mt-3">
            <input
              type="checkbox"
              class="rounded bg-white/10 border-0"
              bind:checked={todoEnabled}
              disabled={!authed || !isAdmin}
            />
            To-Do Liste anzeigen
            <button
              class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={saveTodo}
              disabled={!authed || !isAdmin || todoSaving}
            >
              Speichern
            </button>
          </label>

          {#if todoError}
            <div class="text-red-400 text-xs mt-1">{todoError}</div>
          {/if}

          {#if !authed || !isAdmin}
            <div class="text-white/40 text-xs mt-2">Admin-Login erforderlich</div>
          {/if}
        </div>

        <!-- Hintergründe -->
        <div class="bg-white/5 rounded-xl p-4">
          <div class="font-medium mb-3">Hintergrund</div>

          <div class="flex items-center gap-3 mb-3">
            <label class="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                class="rounded bg-white/10 border-0"
                bind:checked={backgroundRotateEnabled}
                disabled={!authed || !isAdmin || rotateSaving}
              />
              Zufällig wechseln (alle 10 Minuten)
            </label>
            <button
              class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
              on:click={saveBackgroundRotate}
              disabled={!authed || !isAdmin || rotateSaving}
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
              disabled={!authed || !isAdmin}
            />

            <button
              class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
              type="button"
              on:click={() => folderInputEl?.click()}
              disabled={!authed || !isAdmin}
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
              disabled={!authed || !isAdmin}
            />

            <button
              class={`h-9 px-4 rounded-lg text-sm font-medium disabled:opacity-50 ${
                uploadFiles.length > 0 && !savingBg
                  ? 'bg-emerald-500/30 hover:bg-emerald-500/40'
                  : 'bg-white/20 hover:bg-white/25'
              }`}
              on:click={doUpload}
              disabled={!authed || !isAdmin || uploadFiles.length === 0 || savingBg}
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
                    disabled={!authed || !isAdmin || savingBg || deletingBg}
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
                    disabled={!authed || !isAdmin || savingBg || deletingBg}
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
      <section class="mb-8">
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
