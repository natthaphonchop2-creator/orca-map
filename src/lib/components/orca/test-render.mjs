import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';

const require = createRequire(import.meta.url);
const moduleURL = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// Server-renders a component with its imports replaced by `deps`; every
// imported name not in `deps` renders nothing (icons and child components).
export async function serverComponent(file, deps) {
	const source = await readFile(file, 'utf8');
	const result = compile(source, { filename: file.pathname.split('/').pop(), generate: 'server' });
	const imports = [...result.js.code.matchAll(/^import\s+(?:(\w+)|\{([^}]*)\}|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"];?$/gm)];
	const names = imports.flatMap(([, single, list, star, from]) => from.startsWith('svelte/internal') ? [] : single ? [single] : star ? [star] : list.split(',').map((name) => name.trim().split(/\s+as\s+/).pop()).filter(Boolean));
	const code = result.js.code.replace(/^import[\s\S]*?;\n/gm, '').replace(/export default function (\w+)/, 'const Component = function $1');
	const module = `import * as $ from ${JSON.stringify(pathToFileURL(require.resolve('svelte/internal/server')).href)};
		export function component(deps) {
			const { ${names.join(', ')} } = deps;
			${code}
			return Component;
		}`;
	const { component } = await import(moduleURL(module));
	const noop = () => {};
	return { warnings: result.warnings, Component: component(new Proxy(deps, { get: (target, key) => (key in target ? target[key] : noop) })) };
}
