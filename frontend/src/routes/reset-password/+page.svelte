<script lang="ts">
  import { page } from '$app/stores';
  import { resetPasswordWithToken } from '$lib/api';

  $: token = $page.url.searchParams.get('token') || '';

  let password = '';
  let password2 = '';
  let loading = false;
  let done = false;
  let error: string | null = null;

  async function submit() {
    if (loading) return;
    error = null;

    if (!token) {
      error = 'Ungültiger Link.';
      return;
    }
    if (password.length < 6) {
      error = 'Mindestens 6 Zeichen.';
      return;
    }
    if (password !== password2) {
      error = 'Passwörter stimmen nicht überein.';
      return;
    }

    loading = true;
    try {
      await resetPasswordWithToken(token, password);
      done = true;
    } catch {
      error = 'Link ist ungültig oder abgelaufen.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-black text-white flex items-center justify-center p-6">
  <div class="w-full max-w-lg rounded-3xl glass border border-white/10 p-6 md:p-8">
    <div class="text-3xl font-semibold">Neues Passwort</div>

    {#if done}
      <div class="mt-6 bg-white/5 rounded-xl p-4 text-white/80">Passwort wurde gesetzt. Du kannst dich jetzt einloggen.</div>
      <a class="inline-block text-white/70 hover:text-white text-sm mt-4" href="/login">Zum Login</a>
    {:else}
      <div class="mt-6 grid grid-cols-1 gap-3">
        <input
          class="h-12 rounded-xl bg-black/30 border-white/10"
          placeholder="Neues Passwort"
          type="password"
          bind:value={password}
          autocomplete="new-password"
        />
        <input
          class="h-12 rounded-xl bg-black/30 border-white/10"
          placeholder="Neues Passwort (wiederholen)"
          type="password"
          bind:value={password2}
          autocomplete="new-password"
        />
        <button
          class="h-12 rounded-xl bg-white/20 hover:bg-white/25 font-semibold disabled:opacity-40"
          type="button"
          on:click={submit}
          disabled={loading}
        >
          {loading ? 'Speichern…' : 'Passwort setzen'}
        </button>
        {#if error}
          <div class="text-red-300">{error}</div>
        {/if}
        <a class="text-white/70 hover:text-white text-sm mt-2" href="/login">Zurück zum Login</a>
      </div>
    {/if}
  </div>
</div>
