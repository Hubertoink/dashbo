<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { acceptInvite } from '$lib/api';

  let token: string | null = null;
  let name = '';
  let password = '';
  let password2 = '';

  let busy = false;
  let error: string | null = null;
  let done = false;

  onMount(() => {
    token = $page.url.searchParams.get('token');
  });

  async function submit() {
    error = null;
    if (!token) {
      error = 'Ungültiger Link.';
      return;
    }
    if (name.trim().length < 1) {
      error = 'Bitte einen Namen eingeben.';
      return;
    }
    if (password.length < 6) {
      error = 'Passwort: mindestens 6 Zeichen.';
      return;
    }
    if (password !== password2) {
      error = 'Passwörter stimmen nicht überein.';
      return;
    }

    busy = true;
    try {
      await acceptInvite(token, { name: name.trim(), password });
      done = true;
      setTimeout(() => void goto('/login'), 1200);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler beim Annehmen der Einladung.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
  <div class="w-full max-w-md bg-white/5 rounded-xl p-6">
    <h1 class="text-xl font-semibold text-white/90">Einladung annehmen</h1>
    <p class="text-white/60 text-sm mt-1">Lege dein Passwort fest und bestätige deinen Namen.</p>

    {#if done}
      <div class="mt-4 text-sm text-white/80">Fertig. Weiterleitung zum Login…</div>
    {:else}
      <div class="mt-4 space-y-3">
        <input
          class="w-full h-10 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
          placeholder="Name"
          bind:value={name}
          autocomplete="name"
        />
        <input
          class="w-full h-10 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
          placeholder="Neues Passwort"
          type="password"
          bind:value={password}
          autocomplete="new-password"
        />
        <input
          class="w-full h-10 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
          placeholder="Passwort wiederholen"
          type="password"
          bind:value={password2}
          autocomplete="new-password"
        />

        {#if error}
          <div class="text-red-400 text-xs">{error}</div>
        {/if}

        <button
          class="w-full h-10 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
          on:click={submit}
          disabled={busy}
        >
          {busy ? 'Bitte warten…' : 'Einladung annehmen'}
        </button>
      </div>
    {/if}
  </div>
</div>
