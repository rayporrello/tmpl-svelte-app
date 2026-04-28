<script lang="ts">
	import CmsImage from '$lib/components/CmsImage.svelte';
</script>

<figure>
	<img src="/decorative.svg" alt="" width="24" height="24" />
</figure>

<figure>
	<CmsImage src="/uploads/team.jpg" alt="Team portrait" width={400} height={400} />
</figure>

<figure>
	<enhanced:img src="/src/lib/assets/team.jpg" alt="Team portrait" width={800} height={450} />
</figure>
