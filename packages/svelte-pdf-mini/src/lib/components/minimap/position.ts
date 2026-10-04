import type { MinimapState } from '../../state/minimap.svelte.js';
import type { MinimapMarker } from './types.js';

type Placed = Pick<MinimapMarker, 'page' | 'y' | 'fraction' | 'height'>;

/** Strip y (px) of a marker: from its PDF y, else from its fraction of the page. */
export function markerTop(minimap: MinimapState, { page, y, fraction }: Placed): number {
	return y != null ? minimap.yOfPoint(page, y) : minimap.yOf({ page, fraction: fraction ?? 0 });
}

/** Strip height (px) of a marker spanning `height` PDF points; 0 for a thin line. */
export function markerHeight(minimap: MinimapState, { page, height }: Placed): number {
	const box = minimap.pages[page - 1];
	if (!height || !box) return 0;
	return (height / minimap.viewer.document.pageSize(page).height) * box.height;
}
