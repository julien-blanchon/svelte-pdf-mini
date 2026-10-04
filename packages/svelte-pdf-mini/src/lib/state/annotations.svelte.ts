import { untrack } from 'svelte';
import { on } from 'svelte/events';
import {
	baseFields,
	createId,
	nowIso,
	rectFromQuads,
	translateAnnotation,
	withComputedRect
} from '../core/annotations/create.js';
import {
	defaultPalette,
	hexToRgb,
	rgbToHex,
	type PaletteColor
} from '../core/annotations/colors.js';
import { reanchorAll } from '../core/annotations/anchor.js';
import { hitStack } from '../core/annotations/geometry.js';
import type {
	Annotation,
	AnnotationKind,
	AnnotationInit,
	AnnotationOf,
	AnnotationOp,
	AnnotationPatch,
	Author,
	TextMarkupAnnotation,
	TextMarkupKind,
	TextQuote
} from '../core/annotations/model.js';
import { isTextMarkupKind } from '../core/annotations/model.js';
import { matchAction, matchesCombo, type Keymap, type KeymapAction } from '../core/i18n/keymap.js';
import { cleanQuote, type PageText } from '../core/text/text-index.js';
import {
	exportPdf,
	importAnnotations,
	annotationsToMarkdown,
	annotationsToJSON,
	type ExportOptions,
	type ImportResult
} from '../core/pdf-codec/index.js';
import { isMessageKey } from '../core/i18n/messages.js';
import { Synced } from '../internal/synced.svelte.js';
import { readOption, type Getter, type MaybeGetter, type Resolved } from '../internal/types.js';
import type { ViewerState } from './viewer.svelte.js';

/** Interaction tools. `select` = click to select, text selection opens the menu. */
export type AnnotationTool =
	| 'select'
	| 'hand'
	| TextMarkupKind
	| 'area'
	| 'note'
	| 'ink'
	| 'rect'
	| 'ellipse'
	| 'line'
	| 'arrow'
	| 'freetext'
	| 'eraser';

/** What to do with annotations found in the PDF itself (not created here). */
export type ForeignPolicy = 'editable' | 'readonly' | 'hidden';

export interface AnnotationStoreOptions {
	viewer: ViewerState;
	/** Getter → controlled (the host owns the list). */
	annotations?: Annotation[] | Getter<Annotation[]>;
	/** Writes the new list back to the owner (needed with a controlled getter; `bind:annotations` does this). */
	setAnnotations?: (annotations: Annotation[]) => void;
	/** Called after every change (once per undo step) with the new list and the operations applied. */
	onAnnotationsChange?: (annotations: Annotation[], ops: AnnotationOp[]) => void;
	tool?: AnnotationTool | Getter<AnnotationTool>;
	onToolChange?: (tool: AnnotationTool) => void;
	/** Palette key of the active colour. */
	color?: string | Getter<string>;
	onColorChange?: (color: string) => void;
	/** Getter → controlled. Custom colours picked by the user are appended (see `addColor`). */
	palette?: PaletteColor[] | Getter<PaletteColor[]>;
	onPaletteChange?: (palette: PaletteColor[]) => void;
	author?: MaybeGetter<Author | undefined>;
	/** Disable every edit. */
	readonly?: MaybeGetter<boolean | undefined>;
	foreign?: MaybeGetter<ForeignPolicy | undefined>;
	/**
	 * Keep the tool active after creating something (highlighter sessions).
	 * Default false: every creation returns to 'select' (hold Shift while creating to keep the tool once).
	 */
	stickyTools?: MaybeGetter<boolean | undefined>;
	/** How an existing annotation is selected for editing. Default 'click'. */
	selectOn?: MaybeGetter<'click' | 'dblclick' | undefined>;
	/** New annotations open their note for typing (Enter keeps, Esc discards). Default true. */
	editOnCreate?: MaybeGetter<boolean | undefined>;
	/** Override keyboard shortcuts (merged over the defaults). */
	keymap?: MaybeGetter<Partial<Keymap> | undefined>;
	/** Read the annotations stored in the PDF when it loads (and stop pdf.js painting them). Default false. */
	importFromPdf?: MaybeGetter<boolean | undefined>;
	/** Re-anchor markups to their quoted text once per loaded document (other versions of a paper). Default false. */
	reanchor?: MaybeGetter<boolean | undefined>;
	/** Called with the import result (counts, warnings). */
	onImport?: (result: ImportResult) => void;
	/** Max history length. Default 200. */
	historyLimit?: number;
}

/**
 * The annotation store: the list (controlled or not), undo/redo, tools,
 * colours, selection and helpers to create annotations from the UI.
 * Must be constructed during component initialisation.
 */
export class AnnotationStore {
	readonly viewer: ViewerState;
	/** Selected annotation ids. */
	selectedIds = $state.raw<string[]>([]);
	/** Annotation under the pointer (for hover cards). */
	hoveredId = $state<string | null>(null);
	/** Annotation whose comment is being edited. */
	editingId = $state<string | null>(null);
	/** Element the hover card should point at. */
	hoverAnchor = $state.raw<Element | null>(null);
	/** Show side notes / gutter markers (Annotations.Margin, Annotations.LineMarkers). */
	notesVisible = $state(true);
	/** Show annotations at all. */
	annotationsVisible = $state(true);
	/** Only show annotations whose palette key is in this list (null = all colours). */
	colorFilter = $state.raw<string[] | null>(null);
	/** Only show these kinds (null = all kinds). */
	kindFilter = $state.raw<AnnotationKind[] | null>(null);
	/**
	 * The annotation just created and awaiting confirmation: Enter (or clicking
	 * elsewhere) keeps it; Esc — or Backspace/Delete before anything was typed —
	 * discards it without leaving an undo step.
	 */
	pendingId = $state<string | null>(null);
	/** The user has typed in the pending annotation's note (digits then type, Backspace edits). */
	pendingTyped = $state(false);
	/** Last message for screen readers (Annotations.Root renders it in a live region). */
	announcement = $state('');

	#list: Synced<Annotation[]>;
	#tool: Synced<AnnotationTool>;
	#color: Synced<string>;
	#palette: Synced<PaletteColor[]>;
	#opts: AnnotationStoreOptions;
	#undo = $state.raw<AnnotationOp[][]>([]);
	#redo = $state.raw<AnnotationOp[][]>([]);
	#batch: AnnotationOp[] | null = null;

	readonly author = $derived(this.#opt('author'));
	readonly readonly = $derived(this.#opt('readonly') ?? false);
	readonly foreign: ForeignPolicy = $derived(this.#opt('foreign') ?? 'editable');
	readonly selectOn: 'click' | 'dblclick' = $derived(this.#opt('selectOn') ?? 'click');

	readonly canUndo = $derived(this.#undo.length > 0 && !this.readonly);
	readonly canRedo = $derived(this.#redo.length > 0 && !this.readonly);
	/** Visible annotations: not hidden, not filtered out by colour/kind, foreign ones per policy. */
	readonly visible = $derived.by(() => {
		if (!this.annotationsVisible) return [];
		const colors = this.colorFilter;
		const kinds = this.kindFilter;
		return this.annotations.filter(
			(a) =>
				!a.hidden &&
				!(a.origin === 'foreign' && this.foreign === 'hidden') &&
				(!colors ||
					(a.paletteKey ? colors.includes(a.paletteKey) : colors.includes(rgbToHex(a.color)))) &&
				(!kinds || kinds.includes(a.kind))
		);
	});
	/** Palette keys in use (for "show only colour…" filters). */
	readonly usedColors = $derived([
		...new Set(this.annotations.map((a) => a.paletteKey ?? rgbToHex(a.color)))
	]);
	readonly byPage = $derived.by(() => {
		const map = new Map<number, Annotation[]>();
		for (const a of this.visible) {
			let list = map.get(a.page);
			if (!list) map.set(a.page, (list = []));
			list.push(a);
		}
		return map;
	});
	readonly byId = $derived(new Map(this.annotations.map((a) => [a.id, a])));
	readonly selected = $derived(
		this.selectedIds.map((id) => this.byId.get(id)).filter((a): a is Annotation => !!a)
	);
	readonly activeColor = $derived(
		this.palette.find((p) => p.key === this.color) ?? this.palette[0]
	);
	/** Replies grouped by parent id. */
	readonly replies = $derived.by(() => {
		const map = new Map<string, Annotation[]>();
		for (const a of this.annotations) {
			if (!a.inReplyTo) continue;
			let list = map.get(a.inReplyTo);
			if (!list) map.set(a.inReplyTo, (list = []));
			list.push(a);
		}
		return map;
	});
	/** Top-level annotations in reading order (page, then top-to-bottom). */
	readonly ordered = $derived(
		this.visible
			.filter((a) => !a.inReplyTo)
			.toSorted((a, b) => a.page - b.page || b.rect[3] - a.rect[3] || a.rect[0] - b.rect[0])
	);

	constructor(opts: AnnotationStoreOptions) {
		this.#opts = opts;
		this.viewer = opts.viewer;
		this.#list = new Synced({
			value: opts.annotations ?? [],
			onChange: (list) => opts.setAnnotations?.(list)
		});
		this.#tool = new Synced({ value: opts.tool ?? 'select', onChange: opts.onToolChange });
		this.#color = new Synced({ value: opts.color ?? 'yellow', onChange: opts.onColorChange });
		this.#palette = new Synced({
			value: opts.palette ?? defaultPalette,
			onChange: opts.onPaletteChange
		});

		// Keyboard shortcuts on the viewport.
		$effect(() => {
			const scroller = this.viewer.scrollEl;
			if (!scroller) return;
			const onKey = (e: KeyboardEvent) => this.#onKeydown(e);
			// Capture phase: runs before the viewer's own keys (arrows nudge a selected shape instead of turning pages).
			scroller.addEventListener('keydown', onKey, true);
			return () => scroller.removeEventListener('keydown', onKey, true);
		});

		// Hand tool: drag the pages to scroll (mouse and pen; touch already scrolls).
		$effect(() => {
			const scroller = this.viewer.scrollEl;
			if (this.tool !== 'hand' || !scroller) return;
			return attachPan(scroller);
		});

		// Highlighter mode (a markup tool is active): the settled text selection becomes
		// a markup. Waits briefly so a double-click followed by a triple-click (word ->
		// line) produces one annotation, and extends a markup made a moment ago instead
		// of stacking a second one.
		$effect(() => {
			const tool = this.tool;
			const sel = this.viewer.selection;
			if (!isTextMarkupKind(tool) || sel.selecting || sel.isEmpty) return;
			void sel.ranges;
			const timer = setTimeout(() => untrack(() => this.#markupFromTool(tool)), MARKUP_SETTLE_MS);
			return () => clearTimeout(timer);
		});

		// Selecting new text closes the annotation popover (a mere pointer-down, e.g.
		// grabbing a shape's handle, must not: that used to deselect while moving).
		$effect(() => {
			const sel = this.viewer.selection;
			if (!sel.isEmpty)
				untrack(() => {
					if (this.pendingId) this.commit();
					if (this.selectedIds.length && !this.editingId) this.selectedIds = [];
				});
		});

		// Import the PDF's own annotations when asked.
		$effect(() => {
			const enabled = this.#opt('importFromPdf') ?? false;
			this.viewer.hideNativeAnnotations = enabled;
			const doc = this.viewer.document.proxy;
			if (!enabled || !doc) return;
			untrack(() => this.importFromPdf());
		});

		// Re-anchor once per document when asked.
		$effect(() => {
			const doc = this.viewer.document.proxy;
			if (!doc || !(this.#opt('reanchor') ?? false)) return;
			untrack(() => this.reanchor());
		});

		// Context menus: annotations under the point (or the selected ones from the keyboard).
		$effect(() =>
			this.viewer.addContextResolver((ctx) => {
				if (ctx.source === 'keyboard' && this.selected.length)
					return { annotations: this.selected };
				if (!ctx.page || !ctx.point || !this.annotationsVisible) return;
				return {
					annotations: hitStack(this.byPage.get(ctx.page) ?? [], ctx.point[0], ctx.point[1])
				};
			})
		);

		// Drop selection of annotations that disappeared.
		$effect(() => {
			const ids = this.byId;
			untrack(() => {
				if (this.selectedIds.some((id) => !ids.has(id)))
					this.selectedIds = this.selectedIds.filter((id) => ids.has(id));
			});
		});
	}

	// ── State ───────────────────────────────────────────────────────────────────

	/** Shortcuts in effect: the viewer's keymap plus this store's overrides. */
	get keymap(): Keymap {
		const own = this.#opt('keymap');
		return own ? { ...this.viewer.keymap, ...own } : this.viewer.keymap;
	}

	/** The pending (just created) annotation, if any. */
	get pending(): Annotation | null {
		return this.pendingId ? (this.byId.get(this.pendingId) ?? null) : null;
	}

	get annotations(): Annotation[] {
		return this.#list.current;
	}
	get tool() {
		return this.#tool.current;
	}
	set tool(t: AnnotationTool) {
		// Picking a drawing tool closes the popover (it could sit where you start drawing).
		if (t !== 'select' && t !== 'hand') {
			this.selectedIds = [];
			this.editingId = null;
		}
		this.#tool.current = t;
	}
	get color() {
		return this.#color.current;
	}
	get palette(): PaletteColor[] {
		return this.#palette.current;
	}
	set palette(p: PaletteColor[]) {
		this.#palette.current = p;
	}

	/**
	 * Add a custom colour (any CSS hex) to the palette and return its key; an
	 * existing entry with the same colour is reused. It then appears in pickers
	 * and filters like the built-in ones.
	 */
	addColor(hex: string, label = hex.toUpperCase()): string {
		const norm = rgbToHex(hexToRgb(hex));
		const existing = this.palette.find(
			(p) => rgbToHex(p.rgb) === norm || p.light.toLowerCase() === norm
		);
		if (existing) return existing.key;
		const key = `custom-${norm.slice(1)}`;
		this.palette = [...this.palette, { key, label, rgb: hexToRgb(norm), light: norm, dark: norm }];
		return key;
	}

	/** Show only some colours (null = all). Toggling the last one off shows all again. */
	toggleColorFilter(key: string) {
		const cur = this.colorFilter ?? [];
		const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
		this.colorFilter = next.length ? next : null;
	}

	/** Translated name of an annotation kind (announcements). */
	#kindLabel(kind: AnnotationKind): string {
		const key = `kind_${kind}`;
		return this.viewer.t(isMessageKey(key) ? key : 'kind_other');
	}

	announce(message: string) {
		// Re-set so repeated messages are announced again.
		this.announcement = '';
		queueMicrotask(() => (this.announcement = message));
	}
	set color(c: string) {
		this.#color.current = c;
	}

	/** Can this annotation be edited (readonly mode, lock, foreign policy)? */
	canEdit(a: Annotation | undefined | null): boolean {
		if (!a || this.readonly || a.locked) return false;
		return !(a.origin === 'foreign' && this.foreign === 'readonly');
	}

	isSelected(id: string) {
		return this.selectedIds.includes(id);
	}

	select(id: string | null, { additive = false } = {}) {
		if (id == null) this.selectedIds = [];
		else if (additive)
			this.selectedIds = this.isSelected(id)
				? this.selectedIds.filter((x) => x !== id)
				: [...this.selectedIds, id];
		else this.selectedIds = [id];
	}

	// ── Mutations (all recorded for undo, all emit onAnnotationsChange) ─────────

	add(annotation: Annotation): Annotation {
		const a = withComputedRect({ ...annotation, author: annotation.author ?? this.author });
		this.#apply([{ type: 'add', annotation: a }]);
		return a;
	}

	update(id: string, patch: AnnotationPatch | ((a: Annotation) => Annotation)) {
		const before = this.byId.get(id);
		if (!before || !this.canEdit(before)) return;
		const next =
			typeof patch === 'function' ? patch(before) : ({ ...before, ...patch } as Annotation);
		const after = withComputedRect({ ...next, modifiedAt: nowIso() } as Annotation);
		this.#apply([{ type: 'update', id, before, after }]);
	}

	remove(ids: string | string[]) {
		const list = (Array.isArray(ids) ? ids : [ids])
			.map((id) => this.byId.get(id))
			.filter((a): a is Annotation => !!a && this.canEdit(a));
		// Removing a parent removes its replies too.
		const all = new Map(list.map((a) => [a.id, a]));
		for (const a of list) for (const r of this.replies.get(a.id) ?? []) all.set(r.id, r);
		if (!all.size) return;
		this.#apply([...all.values()].map((annotation) => ({ type: 'remove' as const, annotation })));
		this.announce(
			all.size === 1
				? this.viewer.t('announceDeleted')
				: this.viewer.t('announceDeletedMany', { count: all.size })
		);
	}

	/** Replace the whole list (e.g. after importing a PDF). Recorded as one undo step. */
	replaceAll(next: Annotation[]) {
		const ops: AnnotationOp[] = [
			...this.annotations.map((annotation) => ({ type: 'remove' as const, annotation })),
			...next.map((annotation) => ({ type: 'add' as const, annotation }))
		];
		this.#apply(ops);
	}

	/** Group several mutations into one undo step. */
	batch(fn: () => void) {
		const outer = this.#batch;
		this.#batch = outer ?? [];
		try {
			fn();
		} finally {
			if (!outer) {
				const ops = this.#batch;
				this.#batch = null;
				if (ops?.length) this.#commit(ops);
			}
		}
	}

	undo() {
		const ops = this.#undo.at(-1);
		if (!ops || this.readonly) return;
		this.#undo = this.#undo.slice(0, -1);
		this.#redo = [...this.#redo, ops];
		this.#write(invert(ops));
	}

	redo() {
		const ops = this.#redo.at(-1);
		if (!ops || this.readonly) return;
		this.#redo = this.#redo.slice(0, -1);
		this.#undo = [...this.#undo, ops];
		this.#write(ops);
	}

	move(id: string, dx: number, dy: number) {
		this.update(id, (a) => translateAnnotation(a, dx, dy));
	}

	recolor(ids: string[], key: string) {
		const c = this.palette.find((p) => p.key === key);
		if (!c) return;
		this.batch(() => ids.forEach((id) => this.update(id, { color: c.rgb, paletteKey: c.key })));
	}

	/** Add a reply to an annotation's thread. */
	reply(parentId: string, contents: string) {
		const parent = this.byId.get(parentId);
		if (!parent || this.readonly) return;
		return this.add({
			...baseFields({ page: parent.page, color: parent.color, author: this.author }),
			kind: 'note',
			rect: parent.rect,
			contents,
			inReplyTo: parentId,
			hidden: false
		} as Annotation);
	}

	/** Replace the list without recording history (loading saved data). */
	load(list: Annotation[]) {
		this.#undo = [];
		this.#redo = [];
		this.#list.current = list;
		this.#opts.onAnnotationsChange?.(list, []);
	}

	/** Read the annotations stored in the PDF (ours losslessly, others as 'foreign'). */
	async importFromPdf(): Promise<ImportResult | null> {
		const doc = this.viewer.document;
		if (!doc.proxy) return null;
		const result = await importAnnotations(await doc.getData(), {
			foreign: this.foreign !== 'hidden',
			textOf: async (page, quads) => (await doc.getPageText(page)).textInQuads(quads)
		});
		this.load(result.annotations);
		this.#opts.onImport?.(result);
		return result;
	}

	/**
	 * Move markups whose quads no longer cover their quote (searching ±1 page).
	 * One undo step. Returns how many moved and how many could not be found
	 * (those get `extra.orphan = true`).
	 */
	async reanchor(): Promise<{ moved: number; orphans: number }> {
		const doc = this.viewer.document;
		if (!doc.proxy) return { moved: 0, orphans: 0 };
		const { annotations, moved, orphans } = await reanchorAll(
			this.annotations,
			(n) => doc.getPageText(n).catch(() => null),
			{ numPages: doc.numPages }
		);
		if (moved || orphans) {
			const before = new Map(this.annotations.map((a) => [a.id, a]));
			this.#apply(
				annotations
					.filter((a) => before.get(a.id) !== a)
					.map((after) => ({
						type: 'update' as const,
						id: after.id,
						before: before.get(after.id)!,
						after
					}))
			);
		}
		return { moved, orphans };
	}

	/** The PDF with the current annotations written in (standard PDF annotations, readable anywhere). */
	async exportPdf(opts?: ExportOptions): Promise<Uint8Array> {
		return exportPdf(await this.viewer.document.getData(), this.annotations, opts);
	}

	/** Markdown summary (grouped by page, or by section when given). */
	toMarkdown(opts?: Parameters<typeof annotationsToMarkdown>[1]) {
		return annotationsToMarkdown(this.annotations, opts);
	}

	toJSON() {
		return annotationsToJSON(this.annotations);
	}

	// ── Creation helpers ─────────────────────────────────────────────────────────

	/** Turn the current text selection into one markup per page. Returns the new annotations. */
	createFromSelection(
		kind: TextMarkupKind = 'highlight',
		init: Partial<TextMarkupAnnotation> = {}
	): TextMarkupAnnotation[] {
		if (this.readonly) return [];
		const ranges = this.viewer.selection.ranges;
		if (!ranges.length) return [];
		const color = this.activeColor;
		const created: TextMarkupAnnotation[] = [];
		this.batch(() => {
			for (const r of ranges) {
				const text = this.viewer.document.pageTextSync(r.page);
				const a: TextMarkupAnnotation = {
					...baseFields({
						page: r.page,
						color: color.rgb,
						paletteKey: color.key,
						opacity: 1,
						author: this.author
					}),
					kind,
					quads: r.quads,
					rect: rectFromQuads(r.quads),
					quote: text
						? quoteFor(text, r.start, r.end)
						: { exact: r.text, start: r.start, end: r.end },
					...init
				};
				created.push(this.add(a) as TextMarkupAnnotation);
			}
		});
		this.viewer.selection.clear();
		if (created.length) this.#afterCreate(created[0]);
		return created;
	}

	#lastMarkup: { id: string; at: number } | null = null;
	#shiftHeld = false;
	#lastCommitAt = 0;

	#markupFromTool(kind: TextMarkupKind) {
		const ranges = this.viewer.selection.ranges;
		if (!ranges.length || this.readonly) return;
		// Extend the markup created a moment ago when the new selection overlaps it (word -> line).
		const recent =
			this.#lastMarkup && Date.now() - this.#lastMarkup.at < MARKUP_EXTEND_MS
				? this.byId.get(this.#lastMarkup.id)
				: null;
		if (
			recent &&
			'quads' in recent &&
			recent.kind === kind &&
			ranges.length === 1 &&
			ranges[0].page === recent.page
		) {
			const r = ranges[0];
			const q = recent.quote;
			if (q?.start != null && q.end != null && r.start <= q.end && r.end >= q.start) {
				const text = this.viewer.document.pageTextSync(r.page);
				this.#lastMarkup = { id: recent.id, at: Date.now() };
				this.update(recent.id, {
					quads: r.quads,
					rect: rectFromQuads(r.quads),
					quote: text ? quoteFor(text, r.start, r.end) : { exact: r.text }
				});
				this.viewer.selection.clear();
				return;
			}
		}
		const [a] = this.createFromSelection(kind);
		if (a) this.#lastMarkup = { id: a.id, at: Date.now() };
	}

	/** After creating: it becomes the pending annotation (note open); the tool goes back to select unless sticky. */
	#afterCreate(a: Annotation) {
		if (this.pendingId && this.pendingId !== a.id) this.commit();
		this.pendingId = a.id;
		this.pendingTyped = false;
		this.announce(this.viewer.t('announceCreated', { kind: this.#kindLabel(a.kind) }));
		this.selectedIds = [a.id];
		if (this.#opt('editOnCreate') ?? true) this.editingId = a.id;
		if (!this.#shiftHeld && !(this.#opt('stickyTools') ?? false)) this.#tool.current = 'select';
	}

	/** Keep the pending annotation. */
	commit() {
		if (!this.pendingId) return;
		const id = this.pendingId;
		this.pendingId = null;
		this.editingId = null;
		// Kept: close its popover (double-click it later to edit again).
		if (this.selectedIds.length === 1 && this.selectedIds[0] === id) this.selectedIds = [];
		this.viewer.scrollEl?.focus({ preventScroll: true });
	}

	/** Drop the pending annotation (no undo step left behind). */
	discard() {
		const id = this.pendingId;
		if (!id) return;
		this.pendingId = null;
		this.editingId = null;
		const a = this.byId.get(id);
		if (!a) return;
		// Its creation (and edits) leave the history: discarding is not an undoable step.
		const touches = (op: AnnotationOp) => op.type !== 'remove' && opTargetId(op) === id;
		this.#undo = this.#undo.filter((ops) => !ops.some(touches));
		this.#write([{ type: 'remove', annotation: a }]);
		this.selectedIds = [];
		this.announce(this.viewer.t('announceDiscarded'));
		this.viewer.scrollEl?.focus({ preventScroll: true });
	}

	/**
	 * Keyboard handling for a note editor (popover / margin textarea) so the
	 * pending flow works while it has focus:
	 * - Enter keeps (Shift+Enter = new line), Esc discards a pending one / stops editing;
	 * - before anything is typed: digits 1–9 recolour, Backspace/Delete discard;
	 * - Alt+1–9 always recolour.
	 * Returns true when the key was handled.
	 */
	handleNoteKey(e: KeyboardEvent, annotation: Annotation): boolean {
		const pending = this.pendingId === annotation.id;
		const pristine = pending && !this.pendingTyped;
		const digit = colorDigit(e);
		if (digit && (e.altKey || (pristine && !e.ctrlKey && !e.metaKey && !e.shiftKey))) {
			const c = this.palette[Number(digit) - 1];
			if (c) {
				e.preventDefault();
				this.color = c.key;
				this.recolor([annotation.id], c.key);
				return true;
			}
		}
		if (pristine && (e.key === 'Backspace' || e.key === 'Delete')) {
			e.preventDefault();
			this.discard();
			return true;
		}
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			if (pending) this.commit();
			else this.#stopEditing();
			return true;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			if (pending) this.discard();
			else this.#stopEditing();
			return true;
		}
		return false;
	}

	/** Close the note editor and give the keyboard back to the viewer. */
	#stopEditing() {
		this.editingId = null;
		this.viewer.scrollEl?.focus({ preventScroll: true });
	}

	/** Mark the pending annotation's note as typed in (digits type, Backspace edits from now on). */
	markTyped(id: string) {
		if (this.pendingId === id) this.pendingTyped = true;
	}

	// ── Overlap cycling ──────────────────────────────────────────────────────────

	#lastPick: { page: number; x: number; y: number; ids: string[]; index: number } | null = null;

	/**
	 * Select from a stack of annotations under the pointer (innermost first).
	 * Clicking again at the same spot — or with `cycle` (Alt+click) — moves to
	 * the next one down the stack.
	 */
	pick(
		stack: Annotation[],
		at: { page: number; x: number; y: number },
		{ cycle = false, additive = false } = {}
	) {
		if (!stack.length) return null;
		const ids = stack.map((a) => a.id);
		const last = this.#lastPick;
		const same =
			last &&
			last.page === at.page &&
			Math.hypot(last.x - at.x, last.y - at.y) < 3 &&
			last.ids.join() === ids.join();
		let index = 0;
		if ((same || cycle) && last && last.ids.join() === ids.join())
			index = (last.index + 1) % ids.length;
		else if (
			cycle &&
			ids.length > 1 &&
			this.selectedIds.length === 1 &&
			ids.includes(this.selectedIds[0])
		)
			index = (ids.indexOf(this.selectedIds[0]) + 1) % ids.length;
		this.#lastPick = { ...at, ids, index };
		this.select(ids[index], { additive });
		if (ids.length > 1)
			this.announce(this.viewer.t('announceOverlap', { index: index + 1, count: ids.length }));
		return stack[index];
	}

	/** Start editing the note of an annotation (default: the selected one). */
	edit(id = this.selectedIds[0]) {
		if (!id || !this.canEdit(this.byId.get(id))) return;
		this.selectedIds = [id];
		this.editingId = id;
	}

	/** Track Shift (held while creating = keep the tool once). */
	setShift(held: boolean) {
		this.#shiftHeld = held;
	}

	/** Create an annotation of any kind with defaults (colour, author, ids, dates). */
	create<K extends AnnotationKind>(kind: K, fields: AnnotationInit<K>): AnnotationOf<K> | null {
		if (this.readonly) return null;
		const color = this.activeColor;
		const a = {
			...baseFields({
				page: fields.page,
				color: color.rgb,
				paletteKey: color.key,
				author: this.author
			}),
			...createDefaults(kind),
			kind,
			...fields
		} as Annotation;
		const created = this.add(a) as AnnotationOf<K>;
		this.#afterCreate(created);
		return created;
	}

	// ── Internals ───────────────────────────────────────────────────────────────

	#opt<K extends keyof AnnotationStoreOptions>(key: K): Resolved<AnnotationStoreOptions[K]> {
		return readOption(this.#opts, key);
	}

	#apply(ops: AnnotationOp[]) {
		// Applied immediately (also inside a batch, so later mutations see the new state);
		// history and onAnnotationsChange follow once per step in #commit.
		this.#write(ops, false);
		if (this.#batch) this.#batch.push(...ops);
		else this.#commit(ops);
	}

	#commit(ops: AnnotationOp[]) {
		const limit = this.#opts.historyLimit ?? 200;
		// Merge consecutive updates of the same annotation (typing, dragging) into one step.
		const last = this.#undo.at(-1);
		const prev = last?.[0];
		const op = ops[0];
		const sameTarget =
			ops.length === 1 &&
			last?.length === 1 &&
			op.type === 'update' &&
			prev?.type === 'update' &&
			op.id === prev.id;
		if (sameTarget && Date.now() - this.#lastCommitAt < UNDO_MERGE_MS) {
			this.#undo = [...this.#undo.slice(0, -1), [{ ...prev, after: op.after }]];
		} else {
			this.#undo = [...this.#undo, ops].slice(-limit);
		}
		this.#lastCommitAt = Date.now();
		this.#redo = [];
		this.#opts.onAnnotationsChange?.(this.annotations, ops);
	}

	/** Write ops to the list (no history). */
	#write(ops: AnnotationOp[], notify = true) {
		let list = this.annotations;
		for (const op of ops) {
			if (op.type === 'add')
				list = [...list.filter((a) => a.id !== op.annotation.id), op.annotation];
			else if (op.type === 'remove') list = list.filter((a) => a.id !== op.annotation.id);
			else list = list.map((a) => (a.id === op.id ? op.after : a));
		}
		this.#list.current = list;
		if (notify) this.#opts.onAnnotationsChange?.(list, ops);
	}

	#onKeydown(e: KeyboardEvent) {
		this.#shiftHeld = e.shiftKey;
		if (e.defaultPrevented || this.readonly) return;
		const target = e.target as HTMLElement;
		// A note editor inside the viewer handles its own keys (see handleNoteKey).
		if (target.closest?.('[data-pdf-annotation-comment], [data-pdf-annotation-freetext]')) return;
		const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
		const km = this.keymap;
		const has = (a: KeymapAction) => km[a]?.some((c) => matchesCombo(e, c));
		const colorAction = matchAction(e, km, COLOR_ACTIONS);
		// Colours with Alt work even while typing a note.
		if (colorAction && (!typing || e.altKey)) {
			const c = this.palette[COLOR_ACTIONS.indexOf(colorAction)];
			if (c) {
				e.preventDefault();
				this.color = c.key;
				const ids = this.#recolorTargets();
				if (ids.length) this.recolor(ids, c.key);
				else if (!this.viewer.selection.isEmpty) this.createFromSelection('highlight');
			}
			return;
		}
		if (typing) return;
		let handled = true;
		const sel = this.viewer.selection;
		if (has('undo')) this.undo();
		else if (has('redo')) this.redo();
		else if (has('confirm') && this.pendingId) this.commit();
		else if (has('cancel') && this.pendingId) this.discard();
		else if (has('cancel') && (this.selectedIds.length || this.tool !== 'select')) {
			this.selectedIds = [];
			this.editingId = null;
			this.#tool.current = 'select';
		} else if (has('delete') && this.selectedIds.length) this.remove(this.selectedIds);
		else if (has('edit') && this.selectedIds.length === 1) this.edit();
		else if (!sel.isEmpty && has('markup.highlight')) this.createFromSelection('highlight');
		else if (!sel.isEmpty && has('markup.underline')) this.createFromSelection('underline');
		else if (!sel.isEmpty && has('markup.strikeout')) this.createFromSelection('strikeout');
		else if (!sel.isEmpty && has('markup.comment')) this.createFromSelection('highlight');
		else {
			// Only shapes nudge: text markups stay on their text.
			const nudgeable = this.selected.length && !this.selected.some((a) => 'quads' in a);
			const nudge = nudgeable ? NUDGES.find(([action]) => has(action)) : undefined;
			const tool = matchAction(e, km, TOOL_ACTIONS);
			if (nudge) {
				const step = e.shiftKey ? 10 : 1;
				const [, dx, dy] = nudge;
				this.batch(() => this.selectedIds.forEach((id) => this.move(id, dx * step, dy * step)));
			} else if (tool) this.tool = TOOL_SHORTCUTS[tool];
			else handled = false;
		}
		if (handled) e.preventDefault();
	}

	/** Annotations a colour shortcut applies to: the selection, else the pending one. */
	#recolorTargets(): string[] {
		if (this.selectedIds.length) return this.selectedIds;
		return this.pendingId ? [this.pendingId] : [];
	}
}

/** Highlighter mode waits this long for the selection to settle (double- then triple-click). */
const MARKUP_SETTLE_MS = 320;
/** A new selection overlapping a markup made this recently extends it instead of stacking another. */
const MARKUP_EXTEND_MS = 2500;
/** Consecutive updates of one annotation within this window (typing, dragging) are one undo step. */
const UNDO_MERGE_MS = 800;

const COLOR_ACTIONS: KeymapAction[] = [
	'color.1',
	'color.2',
	'color.3',
	'color.4',
	'color.5',
	'color.6',
	'color.7',
	'color.8',
	'color.9'
];

const TOOL_SHORTCUTS = {
	'tool.select': 'select',
	'tool.highlight': 'highlight',
	'tool.underline': 'underline',
	'tool.strikeout': 'strikeout',
	'tool.squiggly': 'squiggly',
	'tool.area': 'area',
	'tool.note': 'note',
	'tool.ink': 'ink',
	'tool.rect': 'rect',
	'tool.ellipse': 'ellipse',
	'tool.arrow': 'arrow',
	'tool.freetext': 'freetext',
	'tool.eraser': 'eraser'
} as const satisfies Partial<Record<KeymapAction, AnnotationTool>>;
const TOOL_ACTIONS = Object.keys(TOOL_SHORTCUTS) as (keyof typeof TOOL_SHORTCUTS)[];

/** Nudge direction per action (PDF space: y up), scaled by the step. */
const NUDGES: [action: KeymapAction, dx: number, dy: number][] = [
	['nudge.left', -1, 0],
	['nudge.right', 1, 0],
	['nudge.up', 0, 1],
	['nudge.down', 0, -1]
];

/** Default fields per kind for `create` (shapes get a 1.5pt stroke). */
function createDefaults(kind: AnnotationKind): object {
	switch (kind) {
		case 'area':
			return { fillOpacity: 0.12, width: 1.5 };
		case 'rect':
		case 'ellipse':
		case 'line':
		case 'polygon':
		case 'polyline':
			return { width: 1.5 };
		case 'arrow':
			return { width: 1.5, lineEndings: ['none', 'open-arrow'] };
		case 'ink':
			return { width: 2, paths: [], style: 'freehand' };
		case 'note':
			return { icon: 'Comment' };
		case 'freetext':
			return { text: '', font: { family: 'Helvetica', size: 12 } };
		default:
			return {};
	}
}

/**
 * Digit 1–9 of a colour shortcut typed in a note editor. Alt+digit reports a
 * symbol in e.key on macOS: read the key code then; otherwise use e.key so
 * Shift+8 ("*") is a character, not colour 8.
 */
function colorDigit(e: KeyboardEvent): string | undefined {
	if (e.altKey) return /^Digit([1-9])$/.exec(e.code)?.[1];
	return /^[1-9]$/.test(e.key) ? e.key : undefined;
}

/** Id of the annotation an op adds, updates or removes. */
function opTargetId(op: AnnotationOp): string {
	return op.type === 'update' ? op.id : op.annotation.id;
}

function invert(ops: AnnotationOp[]): AnnotationOp[] {
	return ops
		.map((op): AnnotationOp => {
			if (op.type === 'add') return { type: 'remove', annotation: op.annotation };
			if (op.type === 'remove') return { type: 'add', annotation: op.annotation };
			return { type: 'update', id: op.id, before: op.after, after: op.before };
		})
		.reverse();
}

/** Quote with ~32 chars of context on both sides (for re-anchoring). */
export function quoteFor(text: PageText, start: number, end: number): TextQuote {
	return {
		exact: text.textOf(start, end),
		prefix: cleanQuote(text.raw.slice(Math.max(0, start - 32), start), { trim: false }).trimStart(),
		suffix: cleanQuote(text.raw.slice(end, end + 32), { trim: false }).trimEnd(),
		start,
		end
	};
}

export { createId };

/** Interactive UI inside the pages that keeps its own click behaviour while panning. */
const PAN_IGNORE =
	'a, button, input, textarea, select, [contenteditable], [data-pdf-annotation-ui]';

/**
 * Drag-to-scroll on `scroller`. Sets `data-pan` while active and `data-panning`
 * during a drag (the cursors live in Annotations.Layer's styles).
 */
function attachPan(scroller: HTMLElement): () => void {
	let last: { x: number; y: number } | null = null;
	const onDown = (e: PointerEvent) => {
		if (e.button !== 0 || e.pointerType === 'touch') return;
		if (e.target instanceof Element && e.target.closest(PAN_IGNORE)) return;
		e.preventDefault(); // no text selection
		last = { x: e.clientX, y: e.clientY };
		scroller.setPointerCapture(e.pointerId);
		scroller.dataset.panning = '';
	};
	const onMove = (e: PointerEvent) => {
		if (!last) return;
		scroller.scrollBy({ left: last.x - e.clientX, top: last.y - e.clientY, behavior: 'instant' });
		last = { x: e.clientX, y: e.clientY };
	};
	const onUp = () => {
		last = null;
		delete scroller.dataset.panning;
	};
	scroller.dataset.pan = '';
	const off = [
		on(scroller, 'pointerdown', onDown),
		on(scroller, 'pointermove', onMove),
		on(scroller, 'pointerup', onUp),
		on(scroller, 'pointercancel', onUp)
	];
	return () => {
		off.forEach((fn) => fn());
		onUp();
		delete scroller.dataset.pan;
	};
}
