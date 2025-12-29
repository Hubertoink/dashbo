<script lang="ts">
  export let isAdmin: boolean;

  export let wizardNeedsUsers: boolean;
  export let wizardNeedsWeather: boolean;
  export let wizardNeedsTags: boolean;
  export let wizardNeedsPersons: boolean;
  export let wizardOutlookConnected: boolean;

  export let hideFirstRun: () => void;
  export let scrollToSection: (id: string) => void;
</script>

<section class="mb-8" id="section-first-run">
  <div class="bg-white/5 rounded-xl p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-lg font-semibold text-white/90">Erste Schritte</div>
        <div class="text-sm text-white/60">Einmal einrichten, danach läuft das Dashboard stabil durch.</div>
      </div>
      <button class="text-sm text-white/60 hover:text-white" type="button" on:click={hideFirstRun}>Später</button>
    </div>

    <div class="mt-4 space-y-2">
      {#if isAdmin}
        <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
          <div class="min-w-0">
            <div class="text-sm font-medium">{wizardNeedsUsers ? '○' : '✓'} Benutzer anlegen</div>
            <div class="text-xs text-white/60">Mindestens einen weiteren Account erstellen.</div>
          </div>
          <button
            class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
            type="button"
            on:click={() => scrollToSection('section-users')}
          >
            Öffnen
          </button>
        </div>
      {/if}

      <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
        <div class="min-w-0">
          <div class="text-sm font-medium">{wizardNeedsWeather ? '○' : '✓'} Wetter‑Ort setzen</div>
          <div class="text-xs text-white/60">Damit Wetter/Forecast korrekt geladen werden.</div>
        </div>
        <button
          class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
          type="button"
          on:click={() => scrollToSection('section-weather')}
        >
          Öffnen
        </button>
      </div>

      <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
        <div class="min-w-0">
          <div class="text-sm font-medium">• Hintergrund auswählen (optional)</div>
          <div class="text-xs text-white/60">Optional: Bilder hochladen und als Background setzen.</div>
        </div>
        <button
          class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
          type="button"
          on:click={() => scrollToSection('section-background')}
        >
          Öffnen
        </button>
      </div>

      <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
        <div class="min-w-0">
          <div class="text-sm font-medium">• News (RSS) aktivieren (optional)</div>
          <div class="text-xs text-white/60">Zeigt bis zu 4 Artikel-Links unter To‑Do.</div>
        </div>
        <button
          class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
          type="button"
          on:click={() => scrollToSection('section-dashboard')}
        >
          Öffnen
        </button>
      </div>

      <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
        <div class="min-w-0">
          <div class="text-sm font-medium">{wizardNeedsTags ? '○' : '✓'} Erste Tags anlegen</div>
          <div class="text-xs text-white/60">Farben/Kategorien für Termine.</div>
        </div>
        <button
          class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
          type="button"
          on:click={() => scrollToSection('section-tags')}
        >
          Öffnen
        </button>
      </div>

      <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
        <div class="min-w-0">
          <div class="text-sm font-medium">{wizardNeedsPersons ? '○' : '✓'} Personen anlegen</div>
          <div class="text-xs text-white/60">Damit Termine Personen zugeordnet werden können.</div>
        </div>
        <button
          class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
          type="button"
          on:click={() => scrollToSection('section-persons')}
        >
          Öffnen
        </button>
      </div>

      <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
        <div class="min-w-0">
          <div class="text-sm font-medium">{wizardOutlookConnected ? '✓' : '○'} Outlook verbinden (optional)</div>
          <div class="text-xs text-white/60">Zusätzliche Termine (nur anzeigen) pro User.</div>
        </div>
        <button
          class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
          type="button"
          on:click={() => scrollToSection('section-outlook')}
        >
          Öffnen
        </button>
      </div>
    </div>
  </div>
</section>
