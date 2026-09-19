<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<footer class="flex w-full flex-col justify-between text-sm shadow-md">
	<div class="flex w-full flex-col items-center gap-3 px-5 py-4 md:flex-row">
		<a href="/" aria-label="ORCA home" class="flex items-center gap-2 font-semibold">
			<img src="/orca-assets/icon.svg" class="size-9" alt="" /> ORCA
		</a>
		<div class="flex grow"></div>
		<div class="mt-8 flex flex-col gap-2 md:mt-0">
			<p class="self-center text-[11px] md:self-end">ORCA · Local development installation</p>
			<div class="flex flex-wrap justify-center gap-3">
				<a href={resolve('/privacy')}>Privacy Policy</a> |
				<a href={resolve('/terms-of-service')}>Terms of Service</a> |
				<a href="/third-party.html">Open-source notices</a>
			</div>
		</div>
	</div>
</footer>

<style lang="postcss">
	:global {
		.line {
			position: relative;
			z-index: 1;
			&::after {
				content: '';
				position: absolute;
				top: 10px;
				z-index: -1;
				left: 50%;
				transform: translate(-50%, -50%);
				width: 100%;
				height: 1px;
				background-color: #000;
			}
			.dark & {
				&::after {
					background-color: #fff;
				}
			}
		}
	}
</style>
