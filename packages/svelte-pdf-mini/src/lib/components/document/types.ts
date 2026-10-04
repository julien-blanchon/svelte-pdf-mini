import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Snippet } from 'svelte';
import type { DocumentStatus, PdfSource } from '../../core/types.js';
import type { DivPartProps, FormPartProps } from '../../internal/component-types.js';
import type { PdfDocument, PdfLoadError } from '../../state/document.svelte.js';

export interface DocumentRootSnippetProps {
	document: PdfDocument;
	status: DocumentStatus;
	numPages: number;
	progress: number;
	error: PdfLoadError | null;
}

export interface DocumentRootProps {
	/** URL, bytes, File/Blob, `{url, httpHeaders}` or a pdf.js document. Reactive. */
	src: PdfSource | null | undefined;
	/** Password to try first. */
	password?: string;
	/** Extra pdf.js `getDocument()` options. */
	documentOptions?: Record<string, unknown>;
	/** The loaded document state (bind:document to read it outside). */
	document?: PdfDocument;
	onLoad?: (doc: PDFDocumentProxy) => void;
	onError?: (error: PdfLoadError) => void;
	children?: Snippet<[DocumentRootSnippetProps]>;
}

/** Why a password is asked for: none given yet, or the last one was wrong. */
export type PasswordReason = 'need' | 'incorrect';

export type DocumentLoadingProps = DivPartProps<Record<never, never>, { progress: number }>;
export type DocumentErrorProps = DivPartProps<Record<never, never>, { error: PdfLoadError }>;
export type DocumentPasswordProps = FormPartProps<
	Record<never, never>,
	{ reason: PasswordReason; submit: (password: string) => void }
>;
