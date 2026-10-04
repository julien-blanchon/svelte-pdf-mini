import { clamp } from '../../core/view/geometry.js';
import type { ClientPoint } from './zoom-animator.js';

export interface ZoomGestureTarget {
	/** Gestures are ignored when this returns false. */
	enabled(): boolean;
	zoom(): number;
	/** Current zoom, or the animation target while easing. */
	destination(): number;
	zoomTo(zoom: number, opts: { anchor: ClientPoint; animate?: boolean }): void;
}

/** Pixels per wheel delta unit, by `deltaMode` (pixel, line, page). */
const WHEEL_UNIT_PX = [1, 16, 400];

/**
 * Ctrl/⌘ + wheel and trackpad pinch (wheel events), Safari gesture events,
 * and two-finger touch pinch + pan, all zooming around the pointer.
 * Returns a cleanup function.
 */
export function attachZoomGestures(node: HTMLElement, target: ZoomGestureTarget): () => void {
	const onWheel = (e: WheelEvent) => {
		if (!(e.ctrlKey || e.metaKey) || !target.enabled()) return;
		e.preventDefault();
		const unit = WHEEL_UNIT_PX[e.deltaMode] ?? 1;
		// Scholar's curve: exp(-Δ/100), at most ×1.25 per event.
		const factor = clamp(Math.exp((-e.deltaY * unit) / 100), 0.8, 1.25);
		target.zoomTo(target.destination() * factor, {
			anchor: { clientX: e.clientX, clientY: e.clientY }
		});
	};

	// Safari trackpad pinch (gesture events report a cumulative scale).
	let gestureStart = 1;
	const onGestureStart = (e: Event) => {
		if (!target.enabled()) return;
		e.preventDefault();
		gestureStart = target.zoom();
	};
	const onGestureChange = (e: Event) => {
		if (!target.enabled()) return;
		e.preventDefault();
		const ge = e as Event & { scale: number; clientX: number; clientY: number };
		target.zoomTo(gestureStart * ge.scale, {
			anchor: { clientX: ge.clientX, clientY: ge.clientY }
		});
	};

	// Touch: two-finger pinch zooms around the fingers and pans (one finger scrolls natively).
	const touches = new Map<number, { x: number; y: number }>();
	let pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null;
	const mid = () => {
		const [a, b] = [...touches.values()];
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
	};
	const onPointerDown = (e: PointerEvent) => {
		if (e.pointerType !== 'touch') return;
		touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (touches.size === 2 && target.enabled()) {
			const m = mid();
			pinch = { dist: m.dist, zoom: target.zoom(), mid: { x: m.x, y: m.y } };
		}
	};
	const onPointerMove = (e: PointerEvent) => {
		if (!touches.has(e.pointerId)) return;
		touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (!pinch || touches.size !== 2) return;
		const m = mid();
		node.scrollLeft -= m.x - pinch.mid.x;
		node.scrollTop -= m.y - pinch.mid.y;
		pinch.mid = { x: m.x, y: m.y };
		target.zoomTo(pinch.zoom * (m.dist / Math.max(1, pinch.dist)), {
			anchor: { clientX: m.x, clientY: m.y },
			animate: false
		});
	};
	const onPointerUp = (e: PointerEvent) => {
		touches.delete(e.pointerId);
		if (touches.size < 2) pinch = null;
	};

	node.style.touchAction = 'pan-x pan-y';
	const controller = new AbortController();
	const { signal } = controller;
	node.addEventListener('wheel', onWheel, { passive: false, signal });
	node.addEventListener('gesturestart', onGestureStart, { signal });
	node.addEventListener('gesturechange', onGestureChange, { signal });
	node.addEventListener('pointerdown', onPointerDown, { signal });
	node.addEventListener('pointermove', onPointerMove, { signal });
	node.addEventListener('pointerup', onPointerUp, { signal });
	node.addEventListener('pointercancel', onPointerUp, { signal });
	return () => controller.abort();
}
