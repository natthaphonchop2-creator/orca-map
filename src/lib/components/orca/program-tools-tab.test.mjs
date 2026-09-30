import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
// eslint-disable-next-line svelte/no-svelte-internal -- Exercise the real component script with its matching Svelte runtime.
import { effect_root, flush, untrack } from 'svelte/internal/client';
import { importTypeScript } from '../../orca/test-import.mjs';

// The real script of ProgramToolsTab.svelte (a program's สิ่งที่ AI ทำได้), with
// its props kept reactive, so a refresh that brings a newer program can be
// played out (Codex release review 64).
const tools = await importTypeScript(new URL('../../orca/program-tools.ts', import.meta.url));
const component = await readFile(new URL('./programs/ProgramToolsTab.svelte', import.meta.url), 'utf8');
const script = stripTypeScriptTypes(component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1])
	.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '')
	.replace(/let \{\s*connection,\s*programName,\s*onchanged\s*\}\s*=\s*\$props\(\);/, '__PROPS__')
	.replace(/(?<![.\w])(connection|programName|onchanged)\b/g, 'props.$1')
	.replace(/\.\.\.(connection|programName|onchanged)\b/g, '...props.$1')
	.replace('__PROPS__', 'const props = testProps;');
assert.match(script, /const props = testProps;/, 'the props line was found');
const require = createRequire(import.meta.url);
const compiled = compileModule(
	`export function harness(testProps, deps) {
		const { presetFor, programSaveInput, saveProblem, savedSelection, orcaError, ProgramService, programSaveError, onDestroy, onMount, untrack, showToast, t } = deps;
		${script}
		return {
			load, save, reset: () => reset(tools),
			set(input) { if (input.selected !== undefined) selected = input.selected; if (input.name !== undefined) name = input.name; },
			get state() { return { selected, name, note, error, loading, saving }; }
		};
	}
	export function reactive(value) {
		const proxy = $state(value);
		return proxy;
	}`,
	{ filename: 'program-tools-tab-test.svelte.js', generate: 'client' }
).js.code.replaceAll('svelte/internal/client', pathToFileURL(require.resolve('svelte/internal/client')).href);
const { harness, reactive } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const tool = (name, readOnlyHint) => ({ name, description: name, inputSchema: {}, definition: { name, annotations: { readOnlyHint } } });
const offered = [tool('list', true), tool('get', true), tool('create', false)];
const program = (version, toolNames) => ({ id: 'c1', name: 'FlowAccount', mcpID: 'flow', description: '', enabled: true, scopeNote: '', reviewedTools: true, reviewedReadOnly: false, tools: offered, toolNames, version, createdAt: '', updatedAt: '' });

test('a draft saves on the version it was made on, so a refresh never lets it overwrite a newer program', async (context) => {
	const saves = [];
	const props = reactive({ connection: program(1, ['list', 'get', 'create']), programName: 'FlowAccount', onchanged: async () => {} });
	let view;
	const stop = effect_root(() => {
		view = harness(props, {
			...tools, untrack, t: (th) => th, orcaError: (cause) => cause.message, programSaveError: (cause) => cause.message,
			onMount: () => {}, onDestroy: () => {}, showToast: () => {},
			ProgramService: {
				discover: async () => offered,
				// The server's own rule: a save on an older version is refused.
				save: async (input, id) => { saves.push({ input, id }); if (input.version !== props.connection.version) throw new Error('someone else changed this program'); return { ...props.connection, ...input, version: input.version + 1 }; }
			}
		});
	});
	context.after(stop);
	await view.load();
	flush();
	assert.deepEqual([...view.state.selected].sort(), ['create', 'get', 'list']);
	// Untouched, the draft follows a newer program by itself.
	props.connection = program(2, ['list', 'get']);
	flush();
	assert.deepEqual([...view.state.selected].sort(), ['get', 'list']);
	// Now this admin ticks create back; meanwhile someone else saves version 3, and the page refreshes.
	view.set({ selected: ['list', 'get', 'create'] });
	flush();
	props.connection = program(3, ['list']);
	flush();
	assert.deepEqual([...view.state.selected].sort(), ['create', 'get', 'list'], 'the typed draft stays');
	await view.save();
	assert.equal(saves[0].input.version, 2, 'sent on the version it was made on, so the server refuses it and nothing is overwritten');
	assert.equal(view.state.error, 'someone else changed this program');
	assert.deepEqual([...view.state.selected].sort(), ['create', 'get', 'list'], 'a refusal keeps the draft');
	// "คืนค่าเดิม" takes the newer program; its save goes on version 3.
	view.reset();
	flush();
	assert.deepEqual(view.state.selected, ['list']);
	view.set({ selected: ['list', 'get'] });
	await view.save();
	assert.equal(saves[1].input.version, 3);
});

test('after a save whose refresh failed, the tab shows what was saved, on the version the save made (Codex release review 68)', async (context) => {
	const saves = [];
	let server = 1;
	const props = reactive({ connection: program(1, ['list', 'get', 'create']), programName: 'FlowAccount', onchanged: async () => {} });
	let view;
	const stop = effect_root(() => {
		view = harness(props, {
			...tools, untrack, t: (th) => th, orcaError: (cause) => cause.message, programSaveError: (cause) => cause.message,
			onMount: () => {}, onDestroy: () => {}, showToast: () => {},
			ProgramService: {
				discover: async () => offered,
				save: async (input, id) => {
					saves.push({ input, id });
					if (input.version !== server) throw new Error('someone else changed this program');
					server += 1;
					return { ...props.connection, ...input, version: server };
				}
			}
		});
	});
	context.after(stop);
	await view.load();
	flush();
	// The page's refresh fails (its data stays at version 1): the tab still shows the save.
	view.set({ selected: ['list'], name: 'FlowAccount ขาย' });
	await view.save();
	flush();
	assert.deepEqual(view.state.selected, ['list'], 'what was saved, not the older ticks');
	assert.equal(view.state.name, 'FlowAccount ขาย');
	assert.equal(view.state.error, '');
	view.set({ selected: ['list', 'get'] });
	await view.save();
	assert.equal(saves[1].input.version, 2, 'the next save goes on the version the first one made');
	assert.equal(view.state.error, '', 'and is not refused');
	// A refresh that brings the saved program: the page's copy is used.
	props.connection = program(3, ['list', 'get']);
	flush();
	assert.deepEqual([...view.state.selected].sort(), ['get', 'list']);
});
