import { createToastQueue, type ToastItem, type ToastOptions } from './toast-queue';

/** The toasts on screen; Toast.svelte (mounted once by AppShell) renders them. */
export const toasts = $state<{ items: ToastItem[] }>({ items: [] });

const queue = createToastQueue((items) => {
	toasts.items = items;
});

export function showToast(message: string, options?: ToastOptions) {
	return queue.push(message, options);
}

export function dismissToast(id: number) {
	queue.dismiss(id);
}
