<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { login, setToken } from '$lib/api';
  import { normalizeNextPath, resolveStoredUser } from '$lib/auth';

  let identifier = '';
  let password = '';
  let error: string | null = null;
  let loading = false;

  $: nextPath = normalizeNextPath($page.url.searchParams.get('next'));
  $: forceLogin = $page.url.searchParams.get('force') === '1';

  onMount(() => {
    void (async () => {
      if (forceLogin) {
        setToken(null);
        return;
      }

      if (await resolveStoredUser()) {
        await goto(nextPath);
      }
    })();
  });

  async function doLogin() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      const res = await login(identifier, password);
      setToken(res.token);
      await goto(nextPath);
    } catch {
      error = 'Login fehlgeschlagen';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-black text-white flex items-center justify-center p-6">
  <div class="w-full max-w-lg rounded-3xl glass border border-white/10 p-6 md:p-8">
    <div class="text-3xl font-semibold">Login</div>
    <div class="text-white/70 mt-1">Bitte anmelden, um Dashbo zu nutzen.</div>

    <div class="mt-6 grid grid-cols-1 gap-3">
      <input
        class="h-12 rounded-xl bg-black/30 border-white/10"
        placeholder="E-Mail oder Benutzername"
        bind:value={identifier}
        autocomplete="username"
      />
      <input
        class="h-12 rounded-xl bg-black/30 border-white/10"
        placeholder="Passwort"
        type="password"
        bind:value={password}
        autocomplete="current-password"
      />
      <button
        class="h-12 rounded-xl bg-white/20 hover:bg-white/25 font-semibold disabled:opacity-40"
        type="button"
        on:click={doLogin}
        disabled={loading}
      >
        Login
      </button>
      {#if error}
        <div class="text-red-300">{error}</div>
      {/if}

      <div class="flex items-center justify-between mt-2">
        <a class="text-white/70 hover:text-white text-sm" href="/forgot-password">Passwort vergessen?</a>
        <span class="text-white/50 text-sm">Registrierung nur per Einladung</span>
      </div>
    </div>
  </div>
</div>
