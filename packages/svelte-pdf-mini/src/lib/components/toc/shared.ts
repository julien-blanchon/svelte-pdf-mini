import type { Section } from '../../core/paper/types.js';
import type { PaperState } from '../../state/paper.svelte.js';
import type { TocItemSnippetProps } from './types.js';

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

/** Document position (0..1) of a PDF point. */
function docPosition(paper: PaperState, page: number, y: number): number {
	const doc = paper.viewer.document;
	const pages = Math.max(1, doc.numPages);
	const height = doc.pageSize(page).height || 1;
	// PDF y grows upwards: 0 at the top of the page, 1 at the bottom.
	const withinPage = 1 - clamp(y, 0, height) / height;
	return clamp((page - 1 + withinPage) / pages, 0, 1);
}

export function itemProps(paper: PaperState, s: Section, depth: number): TocItemSnippetProps {
	return {
		section: s,
		depth,
		active: paper.activeSection === s,
		inPath: paper.activePath.includes(s),
		position: docPosition(paper, s.page, s.y),
		go: () => paper.goToSection(s)
	};
}

export interface TocSegment {
	section: Section;
	/** Document positions (0..1) where the section starts and ends. */
	start: number;
	end: number;
}

/** Top-level sections as consecutive spans of the document. */
export function topLevelSegments(paper: PaperState): TocSegment[] {
	const starts = paper.sections.map((s) => docPosition(paper, s.page, s.y));
	return paper.sections.map((section, i) => ({
		section,
		start: starts[i],
		end: starts[i + 1] ?? 1
	}));
}

/** Sections down to `maxDepth`, in document order. */
export const sectionsUpTo = (paper: PaperState, maxDepth: number): Section[] =>
	paper.flatSections.filter((s) => s.level <= maxDepth);

export const sectionTitle = (s: Section): string => (s.number ? `${s.number} ${s.title}` : s.title);
