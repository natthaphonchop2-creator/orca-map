import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Resolve the shipped helper modules for Node tests without changing Vite's
// extensionless imports or duplicating their implementation in the harness.
const cache = new Map();
export async function typescriptModuleURL(url) {
  const key = String(url);
  if (cache.has(key)) return cache.get(key);
  const loading = (async () => {
    let code = stripTypeScriptTypes(await readFile(url, 'utf8'));
    const imports = [...code.matchAll(/\bfrom\s+(['"])(\.\.?\/[^'"]+)\1/g)];
    for (const [, quote, specifier] of imports) {
      const target = new URL(/\.[a-z]+$/i.test(specifier) ? specifier : `${specifier}.ts`, url);
      const resolved = target.pathname.endsWith('.ts') ? await typescriptModuleURL(target) : target.href;
      code = code.replaceAll(`${quote}${specifier}${quote}`, JSON.stringify(resolved));
    }
    return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  })();
  cache.set(key, loading);
  return loading;
}

export async function importTypeScript(url) {
  return import(await typescriptModuleURL(url));
}
