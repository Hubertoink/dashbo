<script lang="ts">
  import type { UserDto } from '$lib/api';

  export let authed: boolean;
  export let isAdmin: boolean;

  export let users: UserDto[];

  export let newUserEmail: string;
  export let newUserName: string;
  export let newUserIsAdmin: boolean;
  export let userError: string | null;

  export let resetFor: UserDto | null;
  export let resetPassword: string;
  export let resetError: string | null;
  export let deletingFor: UserDto | null;

  export let doCreateUser: () => void | Promise<void>;
  export let copyInviteLinkForUser: (u: UserDto) => void | Promise<void> = () => {};
  export let copyCalendarInviteLink: () => void | Promise<void> = () => {};
</script>

{#if authed}
  <section class="mb-8" id="section-users">
    <h2 class="text-lg font-semibold text-white/90 mb-4">{isAdmin ? 'Benutzerverwaltung' : 'Benutzer'}</h2>

    <div class="bg-white/5 rounded-xl p-4">
      {#if isAdmin}
        <div class="font-medium mb-1">Neuer Benutzer</div>
        <div class="text-white/50 text-xs mb-3">Einladung per E-Mail senden (wenn SMTP konfiguriert) oder Link kopieren.</div>

        <div class="flex items-center justify-between mb-3">
          <div class="text-white/70 text-sm">Familienaccount einladen</div>
          <button
            class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
            on:click={copyCalendarInviteLink}
          >
            Einladungslink kopieren
          </button>
        </div>

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
          <div class="h-9 flex items-center px-3 rounded-lg bg-white/5 text-sm text-white/50">
            Passwort per E-Mail setzen
          </div>
        </div>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" class="rounded bg-white/10 border-0" bind:checked={newUserIsAdmin} />
            Admin
          </label>
          <button class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium" on:click={doCreateUser}>
            Einladung senden
          </button>
        </div>

        {#if userError}
          <div class="text-red-400 text-xs mt-2">{userError}</div>
        {/if}
      {:else}
        <div class="text-white/70 text-sm">Mitglieder dieses Kalenders</div>
      {/if}

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
                {#if u.invited}
                  <span class="text-xs bg-white/10 rounded px-1.5 py-0.5 ml-2">Eingeladen</span>
                {/if}
              </div>
              {#if isAdmin}
                <div class="flex gap-2">
                  {#if u.invited}
                    <button
                      class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15"
                      on:click={() => copyInviteLinkForUser(u)}
                    >
                      Einladungslink
                    </button>
                  {/if}
                  <button
                    class="text-xs text-white/50 hover:text-white"
                    on:click={() => {
                      resetFor = u;
                      resetPassword = '';
                      resetError = null;
                    }}
                  >
                    Passwort
                  </button>
                  <button class="text-xs text-white/50 hover:text-red-400" on:click={() => (deletingFor = u)}>
                    Löschen
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
{/if}
