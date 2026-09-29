<script lang="ts">
	import { Search, X } from '@lucide/svelte';
	import { t } from '$lib/orca/locale.svelte';
	import {
		addPerson,
		enterChoice,
		matchPeople,
		moveHighlight,
		personInitial,
		removeLastPerson,
		removePerson,
		type PickerPerson
	} from './person-picker';

	// Chosen people as chips, then a search that suggests the others. `youID`
	// marks the viewer's own chip "คุณ"; `locked` chips cannot be removed.
	let {
		people,
		selected = $bindable([]),
		locked = [],
		youID = '',
		label,
		placeholder,
		disabled = false,
		onchange
	}: {
		people: PickerPerson[];
		selected?: string[];
		locked?: string[];
		youID?: string;
		label: string;
		placeholder?: string;
		disabled?: boolean;
		onchange?: (selected: string[]) => void;
	} = $props();
	const uid = $props.id();
	const listID = `orca-person-list-${uid}`;
	let query = $state('');
	let open = $state(false);
	let highlight = $state(-1);
	let input: HTMLInputElement | undefined = $state();
	const suggestions = $derived(matchPeople(people, query, selected));
	const chosen = $derived(selected.map((id) => people.find((person) => person.id === id) ?? { id, name: id }));

	function update(next: string[]) {
		selected = next;
		onchange?.(next);
	}
	function choose(person: PickerPerson) {
		update(addPerson(selected, person.id));
		query = '';
		highlight = -1;
		input?.focus();
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			open = true;
			highlight = moveHighlight(highlight, suggestions.length, event.key === 'ArrowDown' ? 1 : -1);
		} else if (event.key === 'Enter') {
			const person = enterChoice(suggestions, highlight, query, open);
			if (person) {
				event.preventDefault();
				choose(person);
			}
		} else if (event.key === 'Escape' && open) {
			event.preventDefault();
			event.stopPropagation();
			open = false;
			highlight = -1;
		} else if (event.key === 'Backspace' && !query) {
			update(removeLastPerson(selected, locked));
		}
	}
</script>

<div class="orca-picker" class:disabled>
	<div class="orca-picker-field">
		<ul class="orca-picker-chips" aria-label={label}>
			{#each chosen as person (person.id)}
				<li class="orca-picker-chip">
					<span class="orca-picker-avatar" class:you={person.id === youID} aria-hidden="true">{personInitial(person.name)}</span>
					<span class="orca-picker-name">{person.id === youID ? t(`คุณ (${person.name})`, `You (${person.name})`) : person.name}</span>
					{#if 'detail' in person && person.detail}<small>{person.detail}</small>{/if}
					{#if !locked.includes(person.id)}<button
							type="button"
							{disabled}
							onclick={() => {
								update(removePerson(selected, person.id, locked));
								// The chip's button is gone; the search keeps the focus.
								input?.focus();
							}}
							aria-label={t(`เอา ${person.name} ออก`, `Remove ${person.name}`)}><X size={14} aria-hidden="true" /></button
						>{/if}
				</li>
			{/each}
		</ul>
		<span class="orca-picker-search">
			<Search size={16} aria-hidden="true" />
			<input
				bind:this={input}
				bind:value={query}
				type="text"
				role="combobox"
				aria-label={label}
				aria-expanded={open && suggestions.length > 0}
				aria-controls={listID}
				aria-autocomplete="list"
				aria-activedescendant={open && highlight >= 0 && suggestions[highlight] ? `${listID}-${suggestions[highlight].id}` : undefined}
				placeholder={placeholder ?? t('เพิ่มคน…', 'Add people…')}
				autocomplete="off"
				{disabled}
				oninput={() => {
					open = true;
					highlight = -1;
				}}
				onfocus={() => (open = true)}
				onblur={() => setTimeout(() => (open = false), 120)}
				onkeydown={keydown}
			/>
		</span>
	</div>
	{#if open && suggestions.length}
		<ul class="orca-picker-list" id={listID} role="listbox" aria-label={label}>
			{#each suggestions as person, index (person.id)}
				<li
					id={`${listID}-${person.id}`}
					role="option"
					aria-selected={index === highlight}
					class:highlight={index === highlight}
					onmousedown={(event) => {
						event.preventDefault();
						choose(person);
					}}
				>
					<span class="orca-picker-avatar" aria-hidden="true">{personInitial(person.name)}</span>
					<span class="orca-picker-option"><strong>{person.name}</strong>{#if person.detail || person.email}<small>{person.detail ?? person.email}</small>{/if}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.orca-picker {
		position: relative;
	}
	.orca-picker-field {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		min-height: 52px;
		padding: 7px 10px;
		border: 1px solid var(--orca-field-line);
		border-radius: var(--orca-radius);
		background: var(--orca-field);
	}
	.orca-picker-field:focus-within {
		border-color: var(--orca-focus);
		box-shadow: 0 0 0 3px var(--orca-focus-halo);
	}
	.orca-picker.disabled .orca-picker-field {
		opacity: 0.6;
	}
	.orca-picker-chips {
		display: contents;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.orca-picker-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 4px 3px 4px;
		border: 1px solid var(--orca-line);
		border-radius: 999px;
		background: var(--orca-secondary);
		font-size: 13.5px;
	}
	.orca-picker-chip small {
		color: var(--orca-muted);
		font-size: 12px;
	}
	.orca-picker-name {
		font-weight: 600;
	}
	.orca-picker-chip button {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--orca-muted);
		cursor: pointer;
	}
	.orca-picker-chip button:hover {
		background: var(--orca-hover);
		color: var(--orca-ink);
	}
	.orca-picker-avatar {
		display: grid;
		flex: none;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--orca-surface);
		border: 1px solid var(--orca-line);
		color: var(--orca-text-2);
		font-size: 11.5px;
		font-weight: 700;
	}
	.orca-picker-avatar.you {
		border-color: var(--orca-ink);
		background: var(--orca-ink);
		color: var(--orca-on-ink);
	}
	.orca-picker-search {
		display: flex;
		flex: 1 1 160px;
		align-items: center;
		gap: 8px;
		min-width: 140px;
		color: var(--orca-subtle);
	}
	.orca-picker-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--orca-ink);
		font: inherit;
		font-size: 14.5px;
	}
	.orca-picker-list {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		left: 0;
		z-index: 20;
		max-height: 300px;
		margin: 0;
		padding: 6px;
		overflow: auto;
		border: 1px solid var(--orca-line);
		border-radius: var(--orca-radius-lg);
		background: var(--orca-popover);
		box-shadow: var(--orca-popover-shadow);
		list-style: none;
	}
	.orca-picker-list li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: var(--orca-radius);
		cursor: pointer;
	}
	.orca-picker-list li:hover,
	.orca-picker-list li.highlight {
		background: var(--orca-hover);
	}
	.orca-picker-option {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.orca-picker-option strong {
		font-size: 14px;
		font-weight: 600;
	}
	.orca-picker-option small {
		color: var(--orca-muted);
		font-size: 12.5px;
	}
</style>
