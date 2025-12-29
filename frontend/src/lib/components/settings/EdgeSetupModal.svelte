<script lang="ts">
  export let edgeSetupOpen: boolean;
</script>

<!-- Edge Setup Modal -->
{#if edgeSetupOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    on:click={(e) => e.currentTarget === e.target && (edgeSetupOpen = false)}
  >
    <div class="absolute inset-0 bg-black/70"></div>
    <div class="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-lg border border-white/10">
      <div class="flex items-start justify-between gap-4 mb-3">
        <div>
          <div class="font-semibold text-lg">Pi/PC Edge Setup</div>
          <div class="text-white/50 text-sm">Lokale Musikbibliothek + HEOS über einen lokalen Edge-Service</div>
        </div>
        <button
          class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
          on:click={() => (edgeSetupOpen = false)}
        >
          Schließen
        </button>
      </div>

      <div class="text-sm text-white/80 space-y-3">
        <div>
          <div class="font-medium mb-1">Wichtig: HTTPS (Mixed Content)</div>
          <div class="text-white/70">
            DashbO läuft über <span class="font-medium">https://dashbohub.de</span>. Browser blockieren Aufrufe zu einem lokalen
            <span class="font-medium">http://</span>-Edge. Verwende daher eine <span class="font-medium">https://</span>-URL (z.B. via Caddy/Nginx Reverse Proxy).
          </div>
        </div>

        <div>
          <div class="font-medium mb-1">Windows PC</div>
          <div class="text-white/70">
            1) Docker Desktop starten
            <br />2) Musik in deiner Bibliothek ablegen (z.B. <span class="font-medium">C:\\Users\\huber\\Musik</span>)
            <br />3) Edge starten: <span class="font-medium">docker compose -f docker-compose.win-edge.yml up -d --build</span>
            <br />4) Hier in den Einstellungen die Edge Base URL + Token eintragen
          </div>
        </div>

        <div>
          <div class="font-medium mb-1">Raspberry Pi</div>
          <div class="text-white/70">
            1) SSD nach <span class="font-medium">/mnt/music</span> mounten
            <br />2) Edge starten: <span class="font-medium">docker compose -f docker-compose.pi-edge.yml up -d --build</span>
            <br />3) Edge Base URL + Token im Browser-Gerät speichern
          </div>
        </div>

        <div class="text-white/60 text-xs">
          Hinweis: Die Edge-Zugangsdaten und der Player-Widget Toggle werden nur lokal im Browser gespeichert (localStorage).
        </div>
      </div>
    </div>
  </div>
{/if}
