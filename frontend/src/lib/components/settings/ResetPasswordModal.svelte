<script lang="ts">
  import type { UserDto } from '$lib/api';

  export let resetFor: UserDto | null;
  export let resetPassword: string;
  export let resetError: string | null;

  export let doResetPassword: () => void | Promise<void>;
</script>

<!-- Reset Password Modal -->
{#if resetFor}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    on:click={(e) => e.currentTarget === e.target && (resetFor = null)}
  >
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
        <button
          class="flex-1 h-10 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium"
          on:click={doResetPassword}
        >
          Speichern
        </button>
        <button
          class="flex-1 h-10 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
          on:click={() => (resetFor = null)}
        >
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}
