import { describe, expect, it } from 'vitest';
import { layoutLanes } from './geometry.js';

describe('layoutLanes', () => {
	it('puts overlapping intervals in separate lanes and reuses free lanes', () => {
		const { lanes, count } = layoutLanes([
			{ top: 0, bottom: 10 },
			{ top: 5, bottom: 15 },
			{ top: 12, bottom: 20 },
			{ top: 30, bottom: 40 }
		]);
		expect(lanes).toEqual([0, 1, 0, 0]);
		expect(count).toBe(2);
	});
});
