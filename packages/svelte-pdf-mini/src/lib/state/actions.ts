/**
 * Context actions: the concise, ready-to-render action lists for a
 * `PdfContext` (selected text, an annotation, a citation, a figure, a link or
 * the page). Each action carries its label, its keymap action (so menus show
 * the same shortcut the keyboard uses) and a `run`. Render them with any menu
 * component (bits-ui / melt ContextMenu, a command palette, a toolbar…).
 */
import {
	TEXT_MARKUP_KINDS,
	isTextMarkupKind,
	type Annotation,
	type TextMarkupKind
} from '../core/annotations/model.js';
import {
	canvasToPng,
	copyCanvasImage,
	copyRich,
	downloadCanvas
} from '../core/document/clipboard.js';
import type { RegionExtractor } from '../core/extract/types.js';
import { comboLabel, type KeymapAction } from '../core/i18n/keymap.js';
import { referenceToBibtex } from '../core/paper/bibtex.js';
import type { Reference } from '../core/paper/types.js';
import type { AnnotationStore } from './annotations.svelte.js';
import type { PaperState } from './paper.svelte.js';
import { contextKind, type PdfContext } from './pointer-context.js';
import type { ViewerState } from './viewer.svelte.js';

export interface PdfAction {
	/** Stable id, e.g. 'selection.highlight'. */
	id: string;
	label: string;
	/** Keymap action whose shortcut this menu entry shares. */
	shortcut?: KeymapAction;
	/** Display label of that shortcut ("H", "⌘C"), resolved from the active keymap. */
	keys?: string;
	run?: () => unknown;
	/** Submenu. */
	items?: PdfAction[];
	/** CSS colour for colour entries. */
	color?: string;
	checked?: boolean;
	danger?: boolean;
	disabled?: boolean;
}

export interface PdfActionGroup {
	kind: ReturnType<typeof contextKind>;
	actions: PdfAction[];
}

export interface ContextActionsOptions {
	viewer: ViewerState;
	annotations?: AnnotationStore | null;
	paper?: PaperState | null;
	/** Enables "Copy as Markdown" on figures / tables. */
	extractor?: RegionExtractor | null;
	/** Replace the default "Open cited paper" (e.g. import it into your app). */
	onOpenReference?: (reference: Reference) => void;
	/**
	 * Save a file (e.g. "Save as PNG"). Default: a browser download, which
	 * desktop webviews (Tauri, Electron) ignore; pass a native save dialog there.
	 */
	saveFile?: (file: Blob, name: string) => unknown;
}

/** Actions for a context, grouped by what the context is about (most specific first). */
export function contextActions(ctx: PdfContext, opts: ContextActionsOptions): PdfActionGroup[] {
	const { viewer, annotations: store, paper } = opts;
	const t = viewer.t.bind(viewer);
	const km = store?.keymap ?? viewer.keymap;
	const a = (
		id: string,
		label: string,
		run: (() => unknown) | undefined,
		shortcut?: KeymapAction,
		extra: Partial<PdfAction> = {}
	): PdfAction => ({
		id,
		label,
		run,
		shortcut,
		keys: shortcut ? comboLabel(km, shortcut) : undefined,
		...extra
	});
	const colors = (apply: (key: string) => void, current?: string) =>
		(store?.palette ?? []).slice(0, 9).map((c, i) =>
			a(`color.${c.key}`, c.label, () => apply(c.key), `color.${i + 1}` as KeymapAction, {
				color: c.light,
				checked: c.key === current
			})
		);
	const groups: PdfActionGroup[] = [];
	const kind = contextKind(ctx);

	if (kind === 'selection') {
		const r = ctx.selection[0];
		const actions: PdfAction[] = [];
		if (store && !store.readonly) {
			actions.push(
				a(
					'selection.highlight',
					t('highlight'),
					() => store.createFromSelection('highlight'),
					'markup.highlight'
				),
				a('selection.highlightColor', t('highlightIn'), undefined, undefined, {
					items: colors((key) => {
						store.color = key;
						store.createFromSelection('highlight');
					}, store.color)
				}),
				...(store.allows('underline')
					? [
							a(
								'selection.underline',
								t('underline'),
								() => store.createFromSelection('underline'),
								'markup.underline'
							)
						]
					: []),
				...(store.allows('strikeout')
					? [
							a(
								'selection.strikeout',
								t('strikeout'),
								() => store.createFromSelection('strikeout'),
								'markup.strikeout'
							)
						]
					: [])
			);
		}
		actions.push(
			a(
				'selection.copy',
				t('copy'),
				() => navigator.clipboard.writeText(ctx.selectedText),
				'edit.copy'
			),
			a(
				'selection.copyFormatted',
				t('copyFormatted'),
				async () => {
					const parts = await Promise.all(
						ctx.selection.map((s) => viewer.document.richText(s.page, s.start, s.end))
					);
					const source = `${viewer.document.fileName}, p. ${viewer.document.pageLabel(r.page)}`;
					await copyRich(
						parts.map((p) => p.plain).join('\n'),
						parts.map((p) => p.html).join('') + `<p><small>— ${source}</small></p>`,
						parts.map((p) => p.markdown).join('\n\n') + `\n\n— ${source}`
					);
				},
				'edit.copyFormatted'
			)
		);
		groups.push({ kind, actions });
	}

	if (kind === 'annotation' && store) {
		const ann: Annotation = ctx.annotations[0];
		const editable = store.canEdit(ann);
		const quote = annotationText(ann);
		const actions: PdfAction[] = [
			a('annotation.edit', t('editNote'), () => store.edit(ann.id), 'edit', {
				disabled: !editable
			}),
			a('annotation.color', t('color'), undefined, undefined, {
				items: colors((key) => store.recolor([ann.id], key), ann.paletteKey),
				disabled: !editable
			})
		];
		if (isTextMarkupKind(ann.kind))
			actions.push(
				a('annotation.type', t('changeType'), undefined, undefined, {
					disabled: !editable,
					items: TEXT_MARKUP_KINDS.map((k: TextMarkupKind) =>
						a(`annotation.type.${k}`, t(k), () => store.update(ann.id, { kind: k }), undefined, {
							checked: ann.kind === k
						})
					)
				})
			);
		if (quote)
			actions.push(
				a('annotation.copyText', t('copyText'), () => navigator.clipboard.writeText(quote))
			);
		actions.push(
			a('annotation.delete', t('delete'), () => store.remove(ann.id), 'delete', {
				danger: true,
				disabled: !editable
			})
		);
		groups.push({ kind, actions });
	}

	if (ctx.citation && paper && ctx.references?.length) {
		const ref = ctx.references[0];
		const meta = paper.metadata.get(ref.id);
		const data = meta?.status === 'done' ? meta.data : null;
		const url = data?.urls.arxiv ?? data?.urls.doi ?? referenceUrl(ref);
		groups.push({
			kind: 'citation',
			actions: [
				a('citation.goTo', t('goToReference'), () => paper.goToReference(ref)),
				a(
					'citation.open',
					t('openCitedPaper'),
					() =>
						opts.onOpenReference
							? opts.onOpenReference(ref)
							: url && window.open(url, '_blank', 'noopener'),
					undefined,
					{
						disabled: !opts.onOpenReference && !url
					}
				),
				a('citation.bibtex', t('copyBibtex'), () =>
					navigator.clipboard.writeText(referenceToBibtex(ref, data))
				)
			]
		});
	}

	if (ctx.figure && !ctx.annotations.length) {
		const f = ctx.figure;
		const name = `${f.label.replace(/\s+/g, '-').toLowerCase()}.png`;
		const actions: PdfAction[] = [
			a('figure.copyImage', t('copyImage'), async () =>
				copyCanvasImage(await viewer.document.renderRegion(f.page, f.rect, 1600))
			),
			a('figure.saveImage', t('saveImage'), async () => {
				const canvas = await viewer.document.renderRegion(f.page, f.rect, 1600);
				if (opts.saveFile) await opts.saveFile(await canvasToPng(canvas), name);
				else downloadCanvas(canvas, name);
			})
		];
		if (store && !store.readonly)
			actions.push(
				a(
					'figure.box',
					t('boxIt'),
					() => store.create('area', { page: f.page, rect: f.rect, label: f.label }),
					'tool.area'
				)
			);
		const mentions = paper?.mentions.get(f.id) ?? [];
		if (mentions.length)
			actions.push(
				a('figure.mentions', `${t('mentions')} (${mentions.length})`, undefined, undefined, {
					items: mentions.map((x, i) =>
						a(`figure.mention.${i}`, `p. ${viewer.document.pageLabel(x.page)} · ${x.text}`, () =>
							paper!.goToMention(x)
						)
					)
				})
			);
		if (opts.extractor)
			actions.push(
				a('figure.markdown', t('copyMarkdown'), async () => {
					const r = await opts.extractor!.extract({
						page: f.page,
						rect: f.rect,
						kind: f.kind === 'table' ? 'table' : 'figure'
					});
					if (r) await copyRich(r.markdown, r.html, r.markdown);
				})
			);
		groups.push({ kind: 'figure', actions });
	}

	if (ctx.link && !ctx.citation) {
		const link = ctx.link;
		const actions: PdfAction[] = [];
		if (link.url) {
			actions.push(
				a('link.open', t('openLink'), () => window.open(link.url, '_self')),
				a('link.openNewTab', t('openInNewTab'), () => window.open(link.url, '_blank', 'noopener')),
				a('link.copy', t('copyUrl'), () => navigator.clipboard.writeText(link.url!))
			);
		} else if (link.dest) {
			actions.push(
				a('link.open', t('openLink'), () =>
					viewer.navigate({ dest: link.dest as string | unknown[] })
				)
			);
		}
		if (actions.length) groups.push({ kind: 'link', actions });
	}

	if (ctx.page) {
		const page = ctx.page;
		const pt = ctx.point;
		const actions: PdfAction[] = [];
		if (store && !store.readonly && pt) {
			actions.push(
				a(
					'page.note',
					t('addNoteHere'),
					() => store.create('note', { page, rect: [pt[0], pt[1] - 20, pt[0] + 20, pt[1]] }),
					'tool.note'
				),
				a('page.box', t('drawBox'), () => (store.tool = 'area'), 'tool.area')
			);
		}
		actions.push(
			a('page.back', t('back'), () => viewer.back(), 'nav.back', { disabled: !viewer.canGoBack }),
			a('page.fitWidth', t('fitWidth'), () => (viewer.zoomMode = 'page-width'), 'view.fitWidth')
		);
		// Only show the page group alone, or after a more specific one when it adds something.
		if (!groups.length || kind === 'page' || kind === 'figure')
			groups.push({ kind: 'page', actions });
	}
	return groups;
}

/** Shortcut reference (for a "?" help panel), grouped and labelled, from the active keymap. */
export function shortcutGroups(viewer: ViewerState, store?: AnnotationStore | null) {
	const km = store?.keymap ?? viewer.keymap;
	const t = viewer.t.bind(viewer);
	const item = (action: KeymapAction, label: string) => ({
		action,
		label,
		keys: (km[action] ?? []).map((_, i) => comboLabel({ [action]: [km[action][i]] }, action))
	});
	const groups = [
		{
			title: 'View',
			items: [
				item('view.zoomIn', t('zoomIn')),
				item('view.zoomOut', t('zoomOut')),
				item('view.fitWidth', t('fitWidth')),
				item('view.rotateCw', 'Rotate'),
				item('find.open', t('find'))
			]
		},
		{
			title: 'Navigate',
			items: [
				item('nav.nextPage', t('nextPage')),
				item('nav.prevPage', t('prevPage')),
				item('nav.firstPage', 'First page'),
				item('nav.lastPage', 'Last page'),
				item('nav.back', t('back')),
				item('nav.forward', 'Forward')
			]
		}
	];
	if (store)
		groups.push(
			{
				title: 'Annotate selected text',
				items: [
					item('markup.highlight', t('highlight')),
					...(store.allows('underline') ? [item('markup.underline', t('underline'))] : []),
					...(store.allows('strikeout') ? [item('markup.strikeout', t('strikeout'))] : []),
					item('markup.comment', t('comment')),
					item('color.1', `${t('color')} 1–9`)
				]
			},
			{
				title: 'Tools',
				items: (
					[
						'select',
						'highlight',
						'area',
						'note',
						'ink',
						'arrow',
						'rect',
						'freetext',
						'eraser'
					] as const
				)
					.filter((tool) => store.allows(tool))
					.map((tool) => item(`tool.${tool}` as KeymapAction, t(`tool_${tool}`)))
			},
			{
				title: 'Edit',
				items: [
					item('confirm', 'Keep new annotation'),
					item('cancel', 'Discard / deselect'),
					item('delete', t('delete')),
					item('edit', t('editNote')),
					item('undo', t('undo')),
					item('redo', t('redo')),
					item('nudge.left', 'Nudge (Shift ×10)')
				]
			}
		);
	groups.push({
		title: 'Other',
		items: [
			item('edit.copy', t('copy')),
			item('edit.copyFormatted', t('copyFormatted')),
			item('menu.context', 'Context menu'),
			item('help.shortcuts', t('shortcuts'))
		]
	});
	return groups;
}

/** Copyable text of an annotation: its quoted passage or a text box's text. */
function annotationText(ann: Annotation): string | undefined {
	if ('quote' in ann) return ann.quote?.exact;
	if ('text' in ann) return ann.text;
	return '';
}

/** Landing page from the reference's own identifiers: arXiv first, then DOI. */
function referenceUrl(ref: Reference): string | undefined {
	if (ref.parsed.arxivId) return `https://arxiv.org/abs/${ref.parsed.arxivId}`;
	if (ref.parsed.doi) return `https://doi.org/${ref.parsed.doi}`;
	return undefined;
}
