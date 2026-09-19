import type { Action } from 'svelte/action';

type RevealOptions = { delay?: number };

/** Progressive enhancement: content stays visible without JavaScript or motion. */
export const reveal: Action<HTMLElement, RevealOptions | undefined> = (node, options) => {
	const media = window.matchMedia('(prefers-reduced-motion: reduce)');
	let observer: IntersectionObserver | undefined;
	let entered = false;
	const setDelay = (value?: RevealOptions) => {
		const delay = Math.min(600, Math.max(0, value?.delay ?? 0));
		node.style.setProperty('--o-reveal-delay', `${delay}ms`);
	};
	const enter = () => {
		if (entered) return;
		entered = true;
		node.dataset.orcaMotion = 'entered';
		observer?.disconnect();
	};
	const preferenceChanged = () => {
		if (media.matches) enter();
	};
	setDelay(options);
	if (media.matches || !('IntersectionObserver' in window)) {
		enter();
	} else {
		observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) enter();
			},
			{ threshold: 0, rootMargin: '0px 0px -32px 0px' }
		);
		observer.observe(node);
	}
	media.addEventListener('change', preferenceChanged);
	return {
		update: setDelay,
		destroy() {
			observer?.disconnect();
			media.removeEventListener('change', preferenceChanged);
		}
	};
};
