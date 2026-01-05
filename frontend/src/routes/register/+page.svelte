<script lang="ts">
  import { goto } from '$app/navigation';
  import { register, setToken } from '$lib/api';

  let email = '';
  let name = '';
  let password = '';
  let password2 = '';

  let busy = false;
  let error: string | null = null;

  async function submit() {
    if (busy) return;
    error = null;

    if (!email.includes('@')) {
      error = 'Bitte eine gültige E-Mail eingeben.';
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
      const res = await register(email.trim(), name.trim(), password);
      setToken(res.token);
      await goto('/settings');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error = msg.includes('email_in_use') ? 'Diese E-Mail ist bereits registriert.' : 'Registrierung fehlgeschlagen.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="min-h-screen bg-black text-white flex items-center justify-center p-6">
  <div class="w-full max-w-lg rounded-3xl glass border border-white/10 p-6 md:p-8">
    <div class="text-3xl font-semibold">Registrieren</div>
    <div class="text-white/70 mt-1">Erstelle einen neuen Familien-Kalender (du bist danach Admin).</div>

    <div class="mt-6 grid grid-cols-1 gap-3">
      <input
        class="h-12 rounded-xl bg-black/30 border-white/10"
        placeholder="E-Mail"
        bind:value={email}
        autocomplete="email"
      />
      <input
        class="h-12 rounded-xl bg-black/30 border-white/10"
        placeholder="Name"
        bind:value={name}
        autocomplete="name"
      />
      <input
        class="h-12 rounded-xl bg-black/30 border-white/10"
        placeholder="Passwort"
        type="password"
        bind:value={password}
        autocomplete="new-password"
      />
      <input
        class="h-12 rounded-xl bg-black/30 border-white/10"
        placeholder="Passwort wiederholen"
        type="password"
        bind:value={password2}
        autocomplete="new-password"
      />

      <button
        class="h-12 rounded-xl bg-white/20 hover:bg-white/25 font-semibold disabled:opacity-40"
        type="button"
        on:click={submit}
        disabled={busy}
      >
        {busy ? 'Bitte warten…' : 'Registrieren'}
      </button>

      {#if error}
        <div class="text-red-300">{error}</div>
      {/if}

      <div class="flex items-center justify-between mt-2">
        <a class="text-white/70 hover:text-white text-sm" href="/login">← Zurück zum Login</a>
      </div>
    </div>
  </div>
</div>
