<script lang="ts">
  import { requestPasswordReset } from '$lib/api';

  let email = '';
  let loading = false;
  let done = false;
  let error: string | null = null;

  async function submit() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await requestPasswordReset(email);
      done = true;
    } catch {
      // Still show the same outcome to avoid leaking account existence.
      done = true;
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-black text-white flex items-center justify-center p-6">
  <div class="w-full max-w-lg rounded-3xl glass border border-white/10 p-6 md:p-8">
    <div class="text-3xl font-semibold">Passwort vergessen</div>
    <div class="text-white/70 mt-2 text-sm">
      Gib deine E-Mail-Adresse ein. Wenn ein Konto existiert, senden wir dir einen Link zum Zurücksetzen.
    </div>

    {#if done}
      <div class="mt-6 bg-white/5 rounded-xl p-4 text-white/80">
        Wenn ein Konto existiert, wurde ein Link per E-Mail versendet.
      </div>
      <a class="inline-block text-white/70 hover:text-white text-sm mt-4" href="/login">Zurück zum Login</a>
    {:else}
      <div class="mt-6 grid grid-cols-1 gap-3">
        <input
          class="h-12 rounded-xl bg-black/30 border-white/10"
          placeholder="E-Mail"
          bind:value={email}
          autocomplete="email"
        />
        <button
          class="h-12 rounded-xl bg-white/20 hover:bg-white/25 font-semibold disabled:opacity-40"
          type="button"
          on:click={submit}
          disabled={loading}
        >
          {loading ? 'Senden…' : 'Link senden'}
        </button>
        {#if error}
          <div class="text-red-300">{error}</div>
        {/if}
        <a class="text-white/70 hover:text-white text-sm mt-2" href="/login">Zurück zum Login</a>
      </div>
    {/if}
  </div>
</div>
