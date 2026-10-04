import { resolveDestination } from '../core/document/destinations.js';
import type { ViewerState } from './viewer.svelte.js';

export interface OutlineItem {
	id: string;
	title: string;
	depth: number;
	/** Resolved target (null when the destination is missing or external). */
	page: number | null;
	/** PDF y of the target (Infinity = top of page). */
	y: number;
	dest?: string | unknown[] | null;
	url?: string | null;
	bold?: boolean;
	italic?: boolean;
	children: OutlineItem[];
	parent: OutlineItem | null;
}

interface RawOutline {
	title: string;
	bold?: boolean;
	italic?: boolean;
	dest: string | unknown[] | null;
	url: string | null;
	items: RawOutline[];
}

/**
 * The PDF outline (bookmarks), resolved to positions, with the item for the
 * current reading position (`activeId`) and expansion state.
 */
export class OutlineState {
	readonly viewer: ViewerState;
	items = $state.raw<OutlineItem[]>([]);
	status = $state<'idle' | 'loading' | 'ready' | 'empty'>('idle');
	expanded = $state<Record<string, boolean>>({});
	/** Flat list in document order. */
	readonly flat = $derived(flatten(this.items));
	/** Deepest item at or before the reading point. */
	readonly active: OutlineItem | null = $derived.by(() => {
		const { page, y } = this.viewer.readingPoint;
		let best: OutlineItem | null = null;
		for (const item of this.flat) {
			if (item.page == null) continue;
			if (item.page < page || (item.page === page && item.y >= y - 4)) best = item;
		}
		return best;
	});
	readonly activeId = $derived(this.active?.id ?? null);
	/** Path from the root to the active item (for breadcrumbs). */
	readonly activePath = $derived.by(() => {
		const path: OutlineItem[] = [];
		for (let n = this.active; n; n = n.parent) path.unshift(n);
		return path;
	});

	constructor(viewer: ViewerState, { expandDepth = 1 }: { expandDepth?: number } = {}) {
		this.viewer = viewer;
		$effect(() => {
			const doc = viewer.document.proxy;
			if (!doc) {
				this.items = [];
				this.status = 'idle';
				return;
			}
			let alive = true;
			this.status = 'loading';
			(async () => {
				const raw = ((await doc.getOutline().catch(() => null)) ?? []) as RawOutline[];
				const items = await resolveTree(raw, 0, null, async (dest) => {
					const r = await resolveDestination(doc, dest).catch(() => null);
					return r ? { page: r.page, y: r.point?.[1] ?? r.rect?.[3] ?? Infinity } : null;
				});
				if (!alive) return;
				const expanded: Record<string, boolean> = {};
				for (const it of flatten(items)) if (it.depth < expandDepth) expanded[it.id] = true;
				this.expanded = expanded;
				this.items = items;
				this.status = items.length ? 'ready' : 'empty';
			})();
			return () => {
				alive = false;
			};
		});
	}

	isExpanded(item: OutlineItem) {
		return !!this.expanded[item.id];
	}

	toggle(item: OutlineItem, open = !this.isExpanded(item)) {
		this.expanded[item.id] = open;
	}

	expandAll(open = true) {
		const next: Record<string, boolean> = {};
		if (open) for (const it of this.flat) if (it.children.length) next[it.id] = true;
		this.expanded = next;
	}

	/** Jump to an item (with history, so Back returns). */
	go(item: OutlineItem) {
		if (item.url) return void window.open(item.url, '_blank', 'noopener');
		if (item.page == null) return;
		const y = Number.isFinite(item.y) ? item.y : undefined;
		return this.viewer.navigate(
			y === undefined ? { page: item.page } : { page: item.page, point: [0, y] },
			{ align: 'start', highlight: false }
		);
	}
}

async function resolveTree(
	raw: RawOutline[],
	depth: number,
	parent: OutlineItem | null,
	resolve: (dest: unknown) => Promise<{ page: number; y: number } | null>,
	prefix = ''
): Promise<OutlineItem[]> {
	const out: OutlineItem[] = [];
	for (let i = 0; i < raw.length; i++) {
		const r = raw[i];
		const pos = r.dest ? await resolve(r.dest) : null;
		const item: OutlineItem = {
			id: `${prefix}${i}`,
			title: r.title.trim(),
			depth,
			page: pos?.page ?? null,
			y: pos?.y ?? Infinity,
			dest: r.dest,
			url: r.url,
			bold: r.bold,
			italic: r.italic,
			children: [],
			parent
		};
		item.children = await resolveTree(r.items ?? [], depth + 1, item, resolve, `${item.id}.`);
		out.push(item);
	}
	return out;
}

function flatten(items: OutlineItem[], out: OutlineItem[] = []) {
	for (const it of items) {
		out.push(it);
		flatten(it.children, out);
	}
	return out;
}
