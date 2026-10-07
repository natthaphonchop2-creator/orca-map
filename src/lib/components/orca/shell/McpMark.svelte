<script lang="ts">
	// The Model Context Protocol mark: โปรแกรม's icon and สร้าง › เชื่อมโปรแกรม
	// (owner, 2026-10-07). Strokes only, in currentColor, so it sits beside the
	// Lucide line icons at the same size (stroke 12.5 of 152, Lucide's 2 of 24). The same paths as
	// static/orca/brand/mcp-mark.svg; source and hashes in
	// static/orca/catalog/business-sources.json.
	let { size = 18, title = '' }: { size?: number; title?: string } = $props();
</script>

<svg
	class="mcp-mark"
	width={size}
	height={size}
	viewBox="14 12 152 158"
	fill="none"
	stroke="currentColor"
	stroke-width="12.5"
	stroke-linecap="round"
	aria-hidden={title ? undefined : 'true'}
	role={title ? 'img' : undefined}
	aria-label={title || undefined}
	focusable="false"
	><path d="M23.5996 85.2532L86.2021 22.6507C94.8457 14.0071 108.86 14.0071 117.503 22.6507C126.147 31.2942 126.147 45.3083 117.503 53.9519L70.2254 101.23" /><path
		d="M70.8789 100.578L117.504 53.952C126.148 45.3083 140.163 45.3083 148.806 53.952L149.132 54.278C157.776 62.9216 157.776 76.9357 149.132 85.5792L92.5139 142.198C89.6327 145.079 89.6327 149.75 92.5139 152.631L104.14 164.257"
	/><path d="M101.853 38.3013L55.553 84.6011C46.9094 93.2447 46.9094 107.258 55.553 115.902C64.1966 124.546 78.2106 124.546 86.8543 115.902L133.154 69.6025" /></svg
>
