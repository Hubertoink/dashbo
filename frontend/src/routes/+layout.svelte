<script lang="ts">
  import '../app.css';
  import MusicPlayerHost from '$lib/components/MusicPlayerHost.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
</script>

<MusicPlayerHost />
<ToastHost />
<slot />
