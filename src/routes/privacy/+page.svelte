<script lang="ts">
	import InstallationNotice from '$lib/components/InstallationNotice.svelte';
</script>

<InstallationNotice title="Installation privacy notice">
	<p>This notice describes the ORCA local development installation. ORCA is an independent fork;
		Obot and Acorn Labs do not operate this environment. A commercial provider and privacy contact
		have not yet been configured. Contact the person who supplied your account for this installation.</p>
	<p>The application stores account identifiers, authentication state, access permissions, connector
		configuration, and activity/audit records. Tool calls can place request and response content in
		logs. Local authentication uses session cookies; the interface also uses browser storage for
		preferences and onboarding state.</p>
	<p>The current local deployment stores its database and application state in a Docker data volume
		on the operator's machine. Development scripts also keep credentials, backups, and verification
		artifacts in a private local directory. Authorized administrators can access system data and logs.
		No automatic retention or deletion period is promised by this development notice.</p>
	<p>When you invoke an external MCP server or enable a model provider, the request and the data
		required by that integration are sent to that provider. For example, a DeepWiki tool call reaches
		DeepWiki. The supplied operations demo uses synthetic records. The current development profile
		disables hosted agents and has no bundled model-provider credentials.</p>
	<p>The interface serves its fonts and syntax styles from this installation. Provider login,
		integration calls, and links to external documentation can still contact external services.
		Their policies apply to those interactions.</p>
	<p>For access, correction, deletion, or retention questions, contact the installation operator.
		Before a public service accepts real customer data, its operator must identify the responsible
		provider, publish contact details and applicable privacy terms, and configure retention and
		third-party processing for the actual deployment.</p>
	<p>Read the <a class="text-link" href="/terms-of-service">installation terms</a> and
		<a class="text-link" href="/third-party.html">open-source notices</a>.</p>
</InstallationNotice>
