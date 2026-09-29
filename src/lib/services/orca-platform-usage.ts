// The ORCA team's usage numbers (C4 design §14i, W1-B5): the one call behind
// ภาพรวมแพลตฟอร์ม's "การใช้งาน AI". A platform call, never a company's path; the
// server answers only the ORCA team's operator.
import { platformUsage, type OrcaPlatformUsage } from '$lib/orca/platform-usage';
import { doGet } from './http';

/** GET /api/orca/platform/usage (baseURL adds /api). */
export const PLATFORM_USAGE_PATH = '/orca/platform/usage';

export const PlatformUsageService = {
	async usage(signal?: AbortSignal): Promise<OrcaPlatformUsage> {
		return platformUsage(await doGet(PLATFORM_USAGE_PATH, { dontLogErrors: true, signal }));
	}
};
