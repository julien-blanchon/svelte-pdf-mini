/** arXiv papers used across the examples (PDFs are fetched directly: arXiv sends CORS + range headers). */
export interface Paper {
	id: string;
	title: string;
	note: string;
}

export const papers: Paper[] = [
	{ id: '1706.03762', title: 'Attention Is All You Need', note: 'one column, hyperref links, figures' },
	{ id: '1512.03385', title: 'Deep Residual Learning for Image Recognition', note: 'two columns, many figures and tables' },
	{ id: '2601.05637', title: 'arXiv 2601.05637', note: 'recent paper' },
	{ id: '1312.6114', title: 'Auto-Encoding Variational Bayes', note: 'equations' },
	{ id: '2005.14165', title: 'Language Models are Few-Shot Learners', note: '75 pages: stress test' },
	{ id: 'hep-th/9711200', title: 'The Large N Limit of Superconformal Field Theories', note: 'old TeX, no hyperref' }
];

export const arxivPdf = (id: string) => `https://arxiv.org/pdf/${id}`;
export const defaultPaper = arxivPdf('1706.03762');
