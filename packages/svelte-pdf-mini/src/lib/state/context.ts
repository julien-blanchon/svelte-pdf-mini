import { Context } from 'runed';
import type { PdfDocument } from './document.svelte.js';
import type { FindState } from './find.svelte.js';
import type { PageState } from './page.svelte.js';
import type { ViewerState } from './viewer.svelte.js';

export const DocumentContext = new Context<PdfDocument>('Document.Root');
export const ViewerContext = new Context<ViewerState>('Viewer.Root');
export const PageContext = new Context<PageState>('Viewer.Page');
export const FindContext = new Context<FindState>('Find.Root');
import type { OutlineState } from './outline.svelte.js';
export const OutlineContext = new Context<OutlineState>('Outline.Root');
import type { AnnotationStore } from './annotations.svelte.js';
export const AnnotationsContext = new Context<AnnotationStore>('Annotations.Root');
import type { PaperState } from './paper.svelte.js';
export const PaperContext = new Context<PaperState>('Paper.Root');
import type { MinimapState } from './minimap.svelte.js';
export const MinimapContext = new Context<MinimapState>('Minimap.Root');
