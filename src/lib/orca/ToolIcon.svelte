<script module lang="ts">
	export type ToolName =
		| 'slack'
		| 'microsoft'
		| 'google-sheets'
		| 'google-docs'
		| 'google-drive'
		| 'line'
		| 'oracle'
		| 'sap'
		| 'salesforce'
		| 'peak'
		| 'flowaccount'
		| 'aws'
		| 'chatgpt'
		| 'claude'
		| 'gemini'
		| 'cursor'
		| 'api';

	const tools: Record<ToolName, { label: string; file: string; scale: number; width?: number }> = {
		slack: { label: 'Slack', file: 'slack.svg', scale: 0.92 },
		microsoft: { label: 'Microsoft', file: 'microsoft.svg', scale: 0.88 },
		'google-sheets': { label: 'Google Sheets', file: 'google-sheets.svg', scale: 1 },
		'google-docs': { label: 'Google Docs', file: 'google-docs.svg', scale: 1 },
		'google-drive': { label: 'Google Drive', file: 'google-drive.svg', scale: 1 },
		line: { label: 'LINE', file: 'line.png', scale: 1 },
		oracle: { label: 'Oracle', file: 'oracle.svg', scale: 1, width: 2.3 },
		sap: { label: 'SAP', file: 'sap.svg', scale: 1, width: 1.9 },
		salesforce: { label: 'Salesforce', file: '../catalog/salesforce.svg', scale: 1, width: 1.45 },
		peak: { label: 'PEAK', file: 'peak.svg', scale: 1 },
		flowaccount: { label: 'FlowAccount', file: 'flowaccount.svg', scale: 1 },
		aws: { label: 'AWS', file: 'aws.svg', scale: 1, width: 1.5 },
		chatgpt: { label: 'ChatGPT', file: 'chatgpt.svg', scale: 0.94 },
		claude: { label: 'Claude', file: 'claude.svg', scale: 1 },
		gemini: { label: 'Gemini', file: 'gemini.svg', scale: 1 },
		cursor: { label: 'Cursor', file: 'cursor.svg', scale: 1 },
		api: { label: 'API', file: 'api.svg', scale: 0.96 }
	};
</script>

<script lang="ts">
	let {
		name,
		size = 44,
		decorative = false
	}: { name: ToolName; size?: number; decorative?: boolean } = $props();

	const tool = $derived(tools[name]);
	// LINE's published mobile minimum is 40 px. Size only changes the image's viewport.
	const dimension = $derived(Math.max(name === 'line' ? 40 : 16, Math.min(size || 44, 128)));
</script>

<span
	class="orca-tool-icon"
	style={`--orca-tool-size: ${dimension}px; --orca-tool-scale: ${tool.scale}; --orca-tool-width: ${tool.width ?? 1};`}
	aria-hidden={decorative ? 'true' : undefined}
>
	<img
		class="orca-tool-icon-image"
		src={`/orca/tools/${tool.file}`}
		alt={decorative ? '' : tool.label}
		width={dimension * (tool.width ?? 1)}
		height={dimension}
		loading="lazy"
		decoding="async"
	/>
</span>

<style>
	.orca-tool-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: calc(var(--orca-tool-size) * var(--orca-tool-width));
		height: var(--orca-tool-size);
		max-width: 100%;
		line-height: 0;
		vertical-align: middle;
	}
	.orca-tool-icon-image {
		display: block;
		width: calc(100% * var(--orca-tool-scale));
		height: calc(100% * var(--orca-tool-scale));
		object-fit: contain;
	}
</style>
