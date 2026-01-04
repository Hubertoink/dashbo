<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { verifyEmailWithToken } from '$lib/api';

  $: token = $page.url.searchParams.get('token') || '';

  let loading = true;
  let ok = false;
  let error: string | null = null;

  onMount(async () => {
    if (!token) {
      loading = false;
      error = 'Ungültiger Link.';
      return;
    }

    try {
      await verifyEmailWithToken(token);
      ok = true;
    } catch {
      error = 'Link ist ungültig oder abgelaufen.';
    } finally {
      loading = false;
    }
  });
</script>

<div class="min-h-screen bg-black text-white flex items-center justify-center p-6">
  <div class="w-full max-w-lg rounded-3xl glass border border-white/10 p-6 md:p-8">
    <div class="text-3xl font-semibold">E-Mail bestätigen</div>

    {#if loading}
      <div class="mt-6 text-white/70">Prüfe Link…</div>
    {:else if ok}
      <div class="mt-6 bg-white/5 rounded-xl p-4 text-white/80">E-Mail wurde bestätigt.</div>
      <a class="inline-block text-white/70 hover:text-white text-sm mt-4" href="/login">Zum Login</a>
    {:else}
      <div class="mt-6 text-red-300">{error}</div>
      <a class="inline-block text-white/70 hover:text-white text-sm mt-4" href="/login">Zum Login</a>
    {/if}
  </div>
</div>
