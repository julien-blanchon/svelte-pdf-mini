import { OPS as pdfjsOps } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { OPS } from './ops.js';

describe('OPS', () => {
	it('matches the installed pdf.js operator codes', () => {
		for (const [name, code] of Object.entries(OPS))
			expect(pdfjsOps[name as keyof typeof pdfjsOps], name).toBe(code);
	});
});
