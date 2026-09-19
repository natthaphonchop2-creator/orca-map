import type { PageLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { safeReturnPath } from "$lib/orca/navigation";

// Existing backend failures/bookmarks still target this path. Keep one visible
// sign-in page, preserving only the return destination, locale and error flag.
export const load: PageLoad = ({ url }) => {
  const params = new URLSearchParams({
    rd: safeReturnPath(url.searchParams.get("rd")),
  });
  const lang = url.searchParams.get("lang");
  if (lang === "th" || lang === "en") params.set("lang", lang);
  if (url.searchParams.has("error")) params.set("error", "1");
  throw redirect(302, `/login?${params}`);
};
