<script lang="ts">
	import { icons, type IconName } from './icons.js';

	let { name, size = 16, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	data-pdf-icon={name}><path d={icons[name]} /></svg
>
