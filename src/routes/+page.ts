import { redirect } from '@sveltejs/kit';
export const ssr=false;
export const prerender=false;
export const load = ({url}) => { throw redirect(307, '/app'+url.search); };
