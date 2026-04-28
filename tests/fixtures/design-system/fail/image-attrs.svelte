<script lang="ts">
	import CmsImage from '$lib/components/CmsImage.svelte';
</script>

<img src="/decorative.svg" alt="" width="24" />

<CmsImage src="/uploads/team.jpg" alt="Team portrait" />

<enhanced:img src="/src/lib/assets/team.jpg" width={800} height={450} />
