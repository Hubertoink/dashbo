<script lang="ts">
  import type { UserDto } from '$lib/api';

  export let deletingFor: UserDto | null;

  export let doDeleteUser: () => void | Promise<void>;
</script>

<!-- Delete User Modal -->
{#if deletingFor}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    on:click={(e) => e.currentTarget === e.target && (deletingFor = null)}
  >
    <div class="absolute inset-0 bg-black/70"></div>
    <div class="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-sm border border-white/10">
      <div class="font-semibold text-lg mb-1">Benutzer löschen?</div>
      <div class="text-white/50 text-sm mb-4">{deletingFor.name} ({deletingFor.email})</div>

      <div class="flex gap-2">
        <button
          class="flex-1 h-10 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium"
          on:click={doDeleteUser}
        >
          Löschen
        </button>
        <button
          class="flex-1 h-10 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
          on:click={() => (deletingFor = null)}
        >
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}
