/**
 * UI strings (labels, aria-labels, placeholders). Override globally with
 * `setMessages()` or per viewer with `<Viewer.Root messages={…}>`.
 * `{name}` placeholders are interpolated.
 */
export const defaultMessages = {
	zoom: 'Zoom',
	zoomIn: 'Zoom in',
	zoomOut: 'Zoom out',
	zoomAuto: 'Automatic',
	zoomPageWidth: 'Page width',
	zoomPageHeight: 'Page height',
	zoomPageFit: 'Page fit',
	page: 'Page {page}',
	pages: 'Pages',
	pageInput: 'Page (1–{count})',
	prevPage: 'Previous page',
	nextPage: 'Next page',
	back: 'Back',
	backToPage: 'Back to page {page}',
	find: 'Find in document',
	findNext: 'Next match',
	findPrev: 'Previous match',
	findNoResults: 'No results',
	matchCase: 'Match case',
	wholeWords: 'Whole words',
	regex: 'Regular expression',
	matchAccents: 'Match accents',
	outline: 'Outline',
	toc: 'Table of contents',
	sections: 'Sections',
	currentSection: 'Current section',
	readingProgress: 'Reading progress',
	passwordNeeded: 'This PDF is password protected',
	passwordIncorrect: 'Incorrect password, try again',
	passwordOpen: 'Open',
	annotateSelection: 'Annotate selection',
	highlightColor: 'Highlight {color}',
	underline: 'Underline',
	strikeout: 'Strike out',
	squiggly: 'Squiggly',
	comment: 'Comment',
	copy: 'Copy',
	addNote: 'Add a note…',
	label: 'Label (e.g. Fig. 3)',
	delete: 'Delete',
	undo: 'Undo',
	redo: 'Redo',
	annotation: 'Annotation',
	tool_select: 'Select',
	tool_hand: 'Pan',
	tool_highlight: 'Highlight',
	tool_underline: 'Underline',
	tool_strikeout: 'Strike out',
	tool_squiggly: 'Squiggly',
	tool_area: 'Box a region',
	tool_note: 'Note',
	tool_ink: 'Draw',
	tool_rect: 'Rectangle',
	tool_ellipse: 'Ellipse',
	tool_line: 'Line',
	tool_arrow: 'Arrow',
	tool_freetext: 'Text',
	tool_eraser: 'Eraser',
	reference: 'Reference',
	goToReference: 'Go to reference',
	citedBy: 'Cited by {count}',
	lookingUp: 'Looking up…',
	citation: 'Citation {text}',
	// Context menus / actions
	highlight: 'Highlight',
	highlightIn: 'Highlight in colour',
	copyFormatted: 'Copy with formatting',
	editNote: 'Edit note',
	color: 'Colour',
	changeType: 'Change type',
	copyText: 'Copy text',
	openCitedPaper: 'Open cited paper',
	copyBibtex: 'Copy BibTeX',
	copyImage: 'Copy as image',
	saveImage: 'Save as PNG',
	boxIt: 'Box it',
	copyMarkdown: 'Copy as Markdown',
	openLink: 'Open',
	openInNewTab: 'Open in new tab',
	copyUrl: 'Copy URL',
	addNoteHere: 'Add note here',
	drawBox: 'Draw box',
	fitWidth: 'Fit width',
	shortcuts: 'Keyboard shortcuts'
};

export type Messages = typeof defaultMessages;
export type MessageKey = keyof Messages;

let globalMessages: Messages = { ...defaultMessages };

/** Override UI strings for every viewer (e.g. a translation). */
export function setMessages(messages: Partial<Messages>) {
	globalMessages = { ...globalMessages, ...messages };
}

export function getMessages(): Messages {
	return globalMessages;
}

/** Format a message with `{name}` placeholders. */
export function formatMessage(
	messages: Partial<Messages>,
	key: MessageKey,
	vars?: Record<string, string | number>
): string {
	const template = messages[key] ?? globalMessages[key] ?? key;
	return vars ? template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : template;
}
