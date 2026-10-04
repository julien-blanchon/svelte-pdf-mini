/**
 * Small inline icons (Lucide-style, 24×24, stroke = currentColor) for the
 * default UIs. Apps can replace any default UI through snippets.
 */
export const icons = {
	trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
	comment: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
	copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
	highlight: 'm9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
	underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16',
	strikeout: 'M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16',
	squiggly: 'M2 12c2-4 3-4 5 0s3 4 5 0 3-4 5 0 3 4 5 0',
	check: 'M20 6 9 17l-5-5',
	close: 'M18 6 6 18M6 6l12 12',
	edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
	note: 'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5zM15 3v6h6'
} as const;

export type IconName = keyof typeof icons;
