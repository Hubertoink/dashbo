<script lang="ts">
  import { onDestroy } from 'svelte';

  export let edgeSetupOpen: boolean;

  let prevBodyOverflow: string | null = null;

  $: {
    if (typeof document !== 'undefined') {
      if (edgeSetupOpen) {
        if (prevBodyOverflow === null) prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      } else if (prevBodyOverflow !== null) {
        document.body.style.overflow = prevBodyOverflow;
        prevBodyOverflow = null;
      }
    }
  }

  onDestroy(() => {
    if (typeof document !== 'undefined' && prevBodyOverflow !== null) {
      document.body.style.overflow = prevBodyOverflow;
      prevBodyOverflow = null;
    }
  });

  type Target = 'windows' | 'pi';
  let target: Target = 'windows';

  let edgePort = '8787';
  let edgeToken = '1000';
  let musicDir = 'C:/Users/<you>/Music';
  let edgeAllowedOrigins = 'https://dashbohub.de,http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173';
  let edgePublicBaseUrl = 'http://192.168.178.27:8787';
  let edgeImage = 'ghcr.io/Hubertoink/dashbo-edge:latest';
  let heosHosts = '';
  let heosScanCidr = '';

  function applyTargetDefaults(nextTarget: Target) {
    if (nextTarget === 'pi') {
      edgePort = '8787';
      musicDir = '/mnt/music';
      edgeAllowedOrigins = 'https://dashbohub.de';
      edgePublicBaseUrl = '';
    } else {
      edgePort = '8787';
      musicDir = 'C:/Users/<you>/Music';
      edgeAllowedOrigins = 'https://dashbohub.de,http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173';
      edgePublicBaseUrl = 'http://192.168.178.27:8787';
    }
  }

  function normalizeHostPath(input: string): string {
    return (input || '').trim().replace(/\\/g, '/');
  }

  function quote(v: string): string {
    return `"${String(v).replace(/\\/g, '\\\\').replace(/\"/g, '\\"')}"`;
  }

  function buildComposeYaml(): string {
    const port = (edgePort || '8787').trim();
    const token = (edgeToken || '').trim();
    const allowed = (edgeAllowedOrigins || '').trim();
    const publicBase = (edgePublicBaseUrl || '').trim();
    const music = normalizeHostPath(musicDir);
    const image = (edgeImage || '').trim();

    const envLines: string[] = [
      `      PORT: 8787`,
      `      EDGE_TOKEN: ${quote(token)}`,
      `      EDGE_ALLOWED_ORIGINS: ${quote(allowed)}`,
      `      EDGE_PUBLIC_BASE_URL: ${quote(publicBase)}`,
      `      MUSIC_LIBRARY_PATH: /mnt/music`,
      `      HEOS_HOST: ""`,
      `      HEOS_HOSTS: ${quote((heosHosts || '').trim())}`,
      `      HEOS_SCAN_CIDR: ${quote((heosScanCidr || '').trim())}`,
      `      HEOS_DISCOVERY_TIMEOUT_MS: 5000`,
      `      HEOS_COMMAND_TIMEOUT_MS: 5000`,
      `      HEOS_SCAN_TIMEOUT_MS: 200`,
      `      HEOS_SCAN_CONCURRENCY: 64`
    ];

    return [
      `services:`,
      `  dashbo-edge:`,
      `    image: ${quote(image)}`,
      `    container_name: dashbo-edge`,
      `    restart: unless-stopped`,
      `    environment:`,
      ...envLines,
      `    ports:`,
      `      - ${quote(`${port}:8787`)}`,
      `    volumes:`,
      `      - ${quote(`${music}:/mnt/music:ro`)}`,
      `      - dashbo_edge_data:/var/lib/dashbo-edge`,
      ``,
      `volumes:`,
      `  dashbo_edge_data:`
    ].join('\n');
  }

  function downloadYaml() {
    const yaml = buildComposeYaml();
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = target === 'windows' ? 'docker-compose.win-edge.generated.yml' : 'docker-compose.pi-edge.generated.yml';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  let canDownload = false;
  $: canDownload = (edgeToken || '').trim().length > 0 && (musicDir || '').trim().length > 0 && (edgeImage || '').trim().length > 0;
</script>

<!-- Edge Setup Modal -->
{#if edgeSetupOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    on:click={(e) => e.currentTarget === e.target && (edgeSetupOpen = false)}
  >
    <div class="absolute inset-0 bg-black/70"></div>
    <div class="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-3xl border border-white/10 max-h-[85vh] flex flex-col">
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

      <div class="text-sm text-white/80 space-y-3 overflow-y-auto pr-1 max-h-[calc(85vh-88px)]">
        <div class="rounded-xl border border-white/10 bg-white/5 p-3">
          <div class="font-medium mb-2">YML herunterladen</div>

          <div class="grid grid-cols-1 gap-2">
            <label class="text-white/70 text-xs">
              <span class="inline-flex items-center gap-2">
                Ziel
                <span class="relative group inline-flex">
                  <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                  <span
                    class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Windows erzeugt eine Compose-Datei mit Windows-Musikpfad. Pi nutzt standardmäßig /mnt/music.
                  </span>
                </span>
              </span>
              <select
                class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                bind:value={target}
                on:change={() => applyTargetDefaults(target)}
              >
                <option value="windows">Windows PC</option>
                <option value="pi">Raspberry Pi</option>
              </select>
            </label>

            <label class="text-white/70 text-xs">
              <span class="inline-flex items-center gap-2">
                Token (EDGE_TOKEN)
                <span class="relative group inline-flex">
                  <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                  <span
                    class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Muss mit dem Token übereinstimmen, den du im Dashboard unter Edge-Zugangsdaten speicherst.
                  </span>
                </span>
              </span>
              <input
                class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                bind:value={edgeToken}
                placeholder="z.B. 1000 (nur zum Testen)"
              />
            </label>

            <label class="text-white/70 text-xs">
              <span class="inline-flex items-center gap-2">
                Docker Image (EDGE_IMAGE)
                <span class="relative group inline-flex">
                  <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                  <span
                    class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Prebuilt Edge Image (z.B. ghcr.io/&lt;owner&gt;/dashbo-edge:latest). Damit sind Updates nur noch: docker compose pull ; docker compose up -d.
                  </span>
                </span>
              </span>
              <input
                class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                bind:value={edgeImage}
                placeholder="ghcr.io/<owner>/dashbo-edge:latest"
              />
            </label>

            <label class="text-white/70 text-xs">
              <span class="inline-flex items-center gap-2">
                Musikordner (Host) (MUSIC_DIR)
                <span class="relative group inline-flex">
                  <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                  <span
                    class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Pfad auf deinem Host-System, der als /mnt/music in den Container gemountet wird.
                  </span>
                </span>
              </span>
              <input
                class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                bind:value={musicDir}
                placeholder={target === 'windows' ? 'C:/Users/<you>/Music' : '/mnt/music'}
              />
            </label>

            <div class="grid grid-cols-2 gap-2">
              <label class="text-white/70 text-xs">
                <span class="inline-flex items-center gap-2">
                  Port (EDGE_PORT)
                  <span class="relative group inline-flex">
                    <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                    <span
                      class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Host-Port, unter dem der Edge erreichbar ist (Container bleibt 8787).
                    </span>
                  </span>
                </span>
                <input
                  class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                  bind:value={edgePort}
                  placeholder="8787"
                />
              </label>

              <label class="text-white/70 text-xs">
                <span class="inline-flex items-center gap-2">
                  Public Base URL (EDGE_PUBLIC_BASE_URL)
                  <span class="relative group inline-flex">
                    <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                    <span
                      class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        Das ist die öffentliche/LAN-URL deines Edge (für HEOS-Streams), nicht die Docker-interne Container-URL. Typisch: http://192.168.x.x:8787.
                    </span>
                  </span>
                </span>
                <input
                  class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                  bind:value={edgePublicBaseUrl}
                  placeholder={target === 'windows' ? 'http://192.168.x.x:8787' : ''}
                />
              </label>
            </div>

            <label class="text-white/70 text-xs">
              <span class="inline-flex items-center gap-2">
                Allowed Origins (EDGE_ALLOWED_ORIGINS)
                <span class="relative group inline-flex">
                  <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                  <span
                    class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Komma-separierte URLs, von denen der Browser den Edge aufrufen darf (CORS).
                  </span>
                </span>
              </span>
              <input
                class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                bind:value={edgeAllowedOrigins}
              />
            </label>

            <div class="grid grid-cols-2 gap-2">
              <label class="text-white/70 text-xs">
                <span class="inline-flex items-center gap-2">
                  HEOS Hosts (optional)
                  <span class="relative group inline-flex">
                    <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                    <span
                      class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Optional: Komma-separierte IPs deiner HEOS-Geräte. Hilft, wenn automatische Discovery (SSDP) nicht klappt.
                    </span>
                  </span>
                </span>
                <input
                  class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                  bind:value={heosHosts}
                  placeholder="192.168.178.10,192.168.178.11"
                />
              </label>
              <label class="text-white/70 text-xs">
                <span class="inline-flex items-center gap-2">
                  HEOS Scan CIDR (optional)
                  <span class="relative group inline-flex">
                    <span class="h-5 w-5 rounded-full bg-white/10 border border-white/10 inline-flex items-center justify-center text-[11px] text-white/80">i</span>
                    <span
                      class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 w-72 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Optional: Netzbereich für TCP-Scan-Fallback (Port 1255), z.B. 192.168.178.0/24.
                    </span>
                  </span>
                </span>
                <input
                  class="mt-1 w-full h-9 rounded-lg bg-zinc-950/40 border border-white/10 px-3 text-sm"
                  bind:value={heosScanCidr}
                  placeholder="192.168.178.0/24"
                />
              </label>
            </div>

            <div class="flex items-center justify-between gap-3 mt-1">
              <div class="text-xs text-white/50">
                Hinweis: Wenn DashbO unter https läuft, braucht der Edge typischerweise HTTPS (Mixed Content).
              </div>
              <button
                class="h-9 px-3 rounded-lg text-sm bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:hover:bg-white/10"
                on:click={downloadYaml}
                disabled={!canDownload}
              >
                YML herunterladen
              </button>
            </div>
          </div>
        </div>

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
            <br />3) Oben auf <span class="font-medium">YML herunterladen</span> klicken (Datei: <span class="font-medium">docker-compose.win-edge.generated.yml</span>)
            <br />4) Image holen: <span class="font-medium">docker compose -f docker-compose.win-edge.generated.yml pull</span>
            <br />5) Starten: <span class="font-medium">docker compose -f docker-compose.win-edge.generated.yml up -d</span>
            <br />6) Hier in den Einstellungen die Edge Base URL + Token eintragen
          </div>
        </div>

        <div>
          <div class="font-medium mb-1">Raspberry Pi</div>
          <div class="text-white/70">
            1) SSD nach <span class="font-medium">/mnt/music</span> mounten
            <br />2) Oben auf <span class="font-medium">YML herunterladen</span> klicken (Datei: <span class="font-medium">docker-compose.pi-edge.generated.yml</span>)
            <br />3) Image holen: <span class="font-medium">docker compose -f docker-compose.pi-edge.generated.yml pull</span>
            <br />4) Starten: <span class="font-medium">docker compose -f docker-compose.pi-edge.generated.yml up -d</span>
            <br />5) Edge Base URL + Token im Browser-Gerät speichern
          </div>
        </div>

        <div class="text-white/60 text-xs">
          Hinweis: Die Edge-Zugangsdaten und der Player-Widget Toggle werden nur lokal im Browser gespeichert (localStorage).
        </div>
      </div>
    </div>
  </div>
{/if}
