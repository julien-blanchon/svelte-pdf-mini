import { Context } from 'runed';

/** Shared by Minimap.Root with its parts: whether the strip is being dragged. */
export interface MinimapDrag {
	readonly dragging: boolean;
}

export const MinimapDragContext = new Context<MinimapDrag>('Minimap.Root drag');
