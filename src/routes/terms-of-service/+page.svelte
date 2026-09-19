<script lang="ts">
	import InstallationNotice from '$lib/components/InstallationNotice.svelte';
</script>

<InstallationNotice title="Installation terms">
	<p>This ORCA installation is a development environment based on the Obot open-source project.
		It is maintained independently. It is not a service operated by Obot or Acorn Labs.</p>
	<p>Access is intended for the operator and invited test users. The included operations connector
		uses synthetic records. This installation does not publish commercial service terms, pricing,
		a service-level commitment, or an identified commercial provider.</p>
	<p>Obot and other third-party components retain their own licenses and notices. Those rights are
		not replaced by this page. Read the <a class="text-link" href="/third-party.html">open-source notices</a>
		for the frontend components included with this app. The existing backend is operated separately and retains its own runtime notices.
		Product names belonging to other providers identify those providers; no endorsement is implied.</p>
	<p>The operator controls accounts, permissions, integrations, backups, and retention. Only connect
		services and data that you are authorized to use. An external provider's own terms apply when
		its integration is enabled. This page does not grant access to third-party paid services or
		change upstream commercial entitlements.</p>
	<p>Before offering a hosted service, the operator must replace this development notice with
		terms that identify the provider, contact details, service scope, and applicable commitments.
		For this local environment, contact the person who supplied your account.</p>
	<p>See the <a class="text-link" href="/privacy">installation privacy notice</a> for the current data flow.</p>
</InstallationNotice>
