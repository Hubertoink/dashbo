<script lang="ts">
  import type { MeDto } from '$lib/api';

  export let authed: boolean;
  export let isAdmin: boolean;
  export let me: MeDto | null = null;

  export let email: string;
  export let password: string;

  export let authError: string | null = null;

  export let doLogin: () => void;
  export let logout: () => void;
</script>

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
        <button class="h-10 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium" on:click={doLogin}>
          Login
        </button>
      </div>
      {#if authError}
        <div class="mt-2 text-red-400 text-sm">{authError}</div>
      {/if}
    </div>
  {:else}
    <div class="bg-white/5 rounded-xl p-4 text-white/70 text-sm">
      {#if me}
        Eingeloggt als <span class="text-white/90 font-medium">{me.name || me.email}</span>
        {#if me.email}
          <span class="text-white/50">({me.email})</span>
        {/if}
        {#if me.role === 'admin' || isAdmin}
          <span class="text-xs bg-white/10 rounded px-1.5 py-0.5 ml-2">Admin</span>
        {/if}
      {:else}
        Eingeloggt{isAdmin ? ' als Admin' : ''}.
      {/if}
    </div>
  {/if}
</section>
