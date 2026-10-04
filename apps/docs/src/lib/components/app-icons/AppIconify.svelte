<!-- Section icon from an Iconify class (e.g. "icon-[lucide--layers]"), sized like the Nucleo icons. -->
<script lang="ts">
	let { icon, size = 16, class: className = '' }: { icon: string; size?: number; class?: string } = $props();
</script>

<span class="{icon} inline-block shrink-0 {className}" style:width="{size}px" style:height="{size}px" aria-hidden="true"></span>
