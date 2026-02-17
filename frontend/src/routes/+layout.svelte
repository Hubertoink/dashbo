<script lang="ts">
  import '../app.css';
  import MusicPlayerHost from '$lib/components/MusicPlayerHost.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import { onMount } from 'svelte';
  import { initPwaInstallListeners } from '$lib/pwaInstall';

  onMount(() => {
    initPwaInstallListeners();
  });
</script>

<MusicPlayerHost />
<ToastHost />
<slot />
