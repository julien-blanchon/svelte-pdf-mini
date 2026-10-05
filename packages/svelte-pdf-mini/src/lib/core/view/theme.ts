import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';
import { LruCache } from '../cache/lru.js';
import { pageImageBoxes } from '../document/image-boxes.js';

/**
 * Page dark-mode strategies. A strategy decides how the *page content* looks;
 * the UI chrome theme is separate.
 *
 * - CSS-only strategies (`filter`) switch instantly, no re-render.
 * - Render strategies (`pageColors`, `wrapContext`) re-render pages.
 */
export interface PageThemeStrategy {
	/** Unique id, also part of the render cache key. */
	id: string;
	/** CSS filter applied to the page bitmap. */
	filter?: string;
	/** CSS mix-blend-mode of the bitmap over `background` (e.g. 'multiply' to tint paper). */
	blend?: string;
	/** Color behind the bitmap (also shown while it renders). */
	background?: string;
	/** pdf.js duotone recoloring (`render({ pageColors })`). */
	pageColors?: { background: string; foreground: string };
	/** Wrap the 2D context before pdf.js draws (advanced, experimental). */
	wrapContext?: (ctx: CanvasRenderingContext2D) => CanvasRenderingContext2D;
	/** Edit the bitmap after pdf.js has drawn it (e.g. invert everything but figures). */
	postProcess?: (ctx: CanvasRenderingContext2D, info: PostProcessInfo) => void | Promise<void>;
	/** Whether page images should be treated as "dark" (for UI hints). */
	dark?: boolean;
}

export interface PostProcessInfo {
	page: PDFPageProxy;
	viewport: PageViewport;
	/** Device pixels per viewport unit. */
	outputScale: number;
}

export type PageThemeInput = PageThemeStrategy | keyof typeof pageThemes;

export interface InvertOptions {
	brightness?: number;
	contrast?: number;
	saturate?: number;
	/** Keep hues (rotate them back after inverting). Default true. */
	keepHue?: boolean;
}

export const pageThemes = {
	none: (): PageThemeStrategy => ({ id: 'none' }),
	/** Classic invert. Instant; photos get inverted too. */
	invert: ({
		brightness = 1,
		contrast = 1,
		saturate = 1,
		keepHue = true
	}: InvertOptions = {}): PageThemeStrategy => ({
		id: `invert(${brightness},${contrast},${saturate},${keepHue})`,
		filter: `invert(1)${keepHue ? ' hue-rotate(180deg)' : ''} brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`,
		background: '#000',
		dark: true
	}),
	/** Softer: dims and warms the page, keeps colors and images. */
	dim: ({
		brightness = 0.75,
		sepia = 0.25
	}: { brightness?: number; sepia?: number } = {}): PageThemeStrategy => ({
		id: `dim(${brightness},${sepia})`,
		filter: `brightness(${brightness}) sepia(${sepia})`,
		dark: true
	}),
	/** Sepia "paper" look for long reading in light mode. */
	sepia: ({ amount = 0.35 }: { amount?: number } = {}): PageThemeStrategy => ({
		id: `sepia(${amount})`,
		filter: `sepia(${amount}) brightness(0.98)`
	}),
	/**
	 * Tinted paper (un.ms style): white becomes `color`, ink stays dark, images
	 * keep their colors (multiplied). Instant.
	 */
	tint: ({ color = '#e8efdc' }: { color?: string } = {}): PageThemeStrategy => ({
		id: `tint(${color})`,
		blend: 'multiply',
		background: color
	}),
	/**
	 * Dark tinted paper: the page is inverted, then screened over a deep
	 * `color`, so the background takes that color and ink becomes light. Instant.
	 */
	tintDark: ({
		color = '#1f2a1c',
		brightness = 0.92
	}: { color?: string; brightness?: number } = {}): PageThemeStrategy => ({
		id: `tintDark(${color},${brightness})`,
		filter: `invert(1) hue-rotate(180deg) brightness(${brightness})`,
		blend: 'screen',
		background: color,
		dark: true
	}),
	/**
	 * Night mode that keeps figures: the page is inverted pixel by pixel except
	 * inside image / figure boxes (found in the operator list). Re-renders.
	 */
	smartInvert: ({
		background = '#1b1b1d',
		foreground = '#e4e4e7',
		padding = 2
	}: { background?: string; foreground?: string; padding?: number } = {}): PageThemeStrategy => ({
		id: `smartInvert(${background},${foreground})`,
		background,
		dark: true,
		async postProcess(ctx, { page, viewport, outputScale }) {
			const boxes = await pageImageBoxes(page);
			const { width, height } = ctx.canvas;
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			// Region = whole page minus figure boxes (even-odd).
			const region = new Path2D();
			region.rect(0, 0, width, height);
			for (const [x1, y1, x2, y2] of boxes) {
				const [ax, ay] = viewport.convertToViewportPoint(x1 - padding, y1 - padding);
				const [bx, by] = viewport.convertToViewportPoint(x2 + padding, y2 + padding);
				region.rect(
					Math.min(ax, bx) * outputScale,
					Math.min(ay, by) * outputScale,
					Math.abs(bx - ax) * outputScale,
					Math.abs(by - ay) * outputScale
				);
			}
			ctx.clip(region, 'evenodd');
			ctx.globalCompositeOperation = 'difference';
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, width, height);
			// Map black→background and white→foreground (softer than pure invert).
			ctx.globalCompositeOperation = 'lighten';
			ctx.fillStyle = background;
			ctx.fillRect(0, 0, width, height);
			ctx.globalCompositeOperation = 'darken';
			ctx.fillStyle = foreground;
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
		}
	}),
	/**
	 * Experimental: recolor vector content while drawing (text and lines get
	 * light-on-dark colors with their hue kept; images are left untouched).
	 */
	vectorRecolor: ({
		background = '#1b1b1d',
		lightness = [0.08, 0.9] as [number, number]
	}: { background?: string; lightness?: [number, number] } = {}): PageThemeStrategy => ({
		id: `vectorRecolor(${background},${lightness.join('-')})`,
		background,
		dark: true,
		wrapContext: (ctx) => recolorContext(ctx, lightness, { background })
	}),
	/**
	 * The recommended reading theme. Light: a gentle paper tint (multiply, like
	 * sepia). Dark: vector recolor over a deep version of the same hue, with
	 * neutral ink tinted towards it; images are left untouched.
	 * `strength` (0..1) controls how much of `color` shows. Default warm paper.
	 */
	paper: ({
		color = '#efe4cf',
		dark = false,
		strength = 0.55
	}: { color?: string; dark?: boolean; strength?: number } = {}): PageThemeStrategy => {
		if (!dark) {
			const tint = mixHex(color, '#ffffff', 1 - strength);
			return { id: `paper(${tint})`, blend: 'multiply', background: tint };
		}
		const background = mixHex(color, '#141414', 1 - Math.min(1, strength * 0.28));
		return {
			id: `paperDark(${background})`,
			background,
			dark: true,
			wrapContext: (ctx) =>
				recolorContext(ctx, [0.1, 0.88], {
					background,
					tint: color,
					tintSaturation: 0.18 * strength
				})
		};
	},
	/** pdf.js duotone: maps black→foreground and white→background. Images become duotone. */
	recolor: ({
		background = '#1e1e1e',
		foreground = '#e6e6e6'
	}: { background?: string; foreground?: string } = {}): PageThemeStrategy => ({
		id: `recolor(${background},${foreground})`,
		pageColors: { background, foreground },
		background,
		dark: true
	})
} as const;

export function resolvePageTheme(input: PageThemeInput | undefined): PageThemeStrategy {
	if (!input) return pageThemes.none();
	if (typeof input === 'string') {
		const factory = pageThemes[input];
		if (!factory) throw new Error(`svelte-pdf-mini: unknown page theme "${input}"`);
		return factory();
	}
	return input;
}

/** A color per category, with light and dark variants (matte, low-chroma). */
export interface PaperColor {
	name: string;
	light: string;
	dark: string;
	/** A stronger accent for chips, dots and borders. */
	accent: string;
}

/** Matte category palette inspired by un.ms/research (soft, low chroma). */
export const paperColors: PaperColor[] = [
	{ name: 'sage', light: '#e6eddc', dark: '#1c2219', accent: '#7fa36a' },
	{ name: 'lavender', light: '#e9e3f2', dark: '#211d29', accent: '#9a82c4' },
	{ name: 'sand', light: '#efe8d6', dark: '#24221b', accent: '#b3a265' },
	{ name: 'sky', light: '#e0ebf1', dark: '#182127', accent: '#6fa3c2' },
	{ name: 'clay', light: '#f0e3d9', dark: '#271e19', accent: '#c0876a' },
	{ name: 'rose', light: '#f2e1e4', dark: '#281b1f', accent: '#c47d8d' },
	{ name: 'mint', light: '#ddefe8', dark: '#172420', accent: '#64ab93' },
	{ name: 'stone', light: '#ebe9e4', dark: '#21201e', accent: '#8f8a80' }
];

/** Page theme for a palette entry: soft tint in light mode, tinted vector recolor at night. */
export function paperTheme(color: PaperColor, dark = false, strength = 0.6): PageThemeStrategy {
	return pageThemes.paper({
		color: dark ? color.accent : color.light,
		dark,
		strength: dark ? strength : strength + 0.25
	});
}

/** Mix two #rrggbb colors: t = 0 → a, 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
	const pa = parseCss(a);
	const pb = parseCss(b);
	if (!pa || !pb) return a;
	const c = (i: number) =>
		Math.round((pa[i] + (pb[i] - pa[i]) * t) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${c(0)}${c(1)}${c(2)}`;
}

// ── Vector recoloring ──────────────────────────────────────────────────────

/** Recolored CSS colors, by input + range + options (count-bounded). */
const colorCache = new LruCache<string, string>(4096);

interface RecolorOptions {
	/** Page background: pure white is mapped exactly to it. */
	background?: string;
	/** Hue given to neutral (gray) ink. */
	tint?: string;
	tintSaturation?: number;
}

/** HSL hue in [0, 1) of a non-gray color, given its max channel and chroma `d` (> 0). */
function hueOf(r: number, g: number, b: number, max: number, d: number): number {
	let sextant: number;
	if (max === r) sextant = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) sextant = (b - r) / d + 2;
	else sextant = (r - g) / d + 4;
	return sextant / 6;
}

/** Invert a CSS color's lightness into [min, max], keeping its hue. */
export function invertLightness(
	css: string,
	[min, max]: [number, number] = [0.08, 0.9],
	opts: RecolorOptions = {}
): string {
	const key = `${css}|${min}|${max}|${opts.background}|${opts.tint}|${opts.tintSaturation}`;
	const hit = colorCache.get(key);
	if (hit) return hit;
	const rgba = parseCss(css);
	if (!rgba) return css;
	const [r, g, b, a] = rgba;
	if (opts.background && r > 0.98 && g > 0.98 && b > 0.98) {
		colorCache.set(key, opts.background);
		return opts.background;
	}
	const mx = Math.max(r, g, b);
	const mn = Math.min(r, g, b);
	let h = 0;
	let sat = 0;
	const l = (mx + mn) / 2;
	if (mx !== mn) {
		const d = mx - mn;
		sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
		h = hueOf(r, g, b, mx, d);
	}
	const nl = min + (1 - l) * (max - min);
	// Neutral ink takes the tint's hue (warm paper → warm ink).
	if (sat < 0.06 && opts.tint) {
		const t = parseCss(opts.tint);
		if (t) {
			const [tr, tg, tb] = t;
			const tmx = Math.max(tr, tg, tb);
			const tmn = Math.min(tr, tg, tb);
			if (tmx !== tmn) {
				h = hueOf(tr, tg, tb, tmx, tmx - tmn);
				sat = opts.tintSaturation ?? 0.12;
			}
		}
	}
	const out = `hsl(${(h * 360).toFixed(1)} ${(sat * 85).toFixed(1)}% ${(nl * 100).toFixed(1)}% / ${a})`;
	colorCache.set(key, out);
	return out;
}

function parseCss(css: string): [number, number, number, number] | null {
	const s = css.trim().toLowerCase();
	if (s === 'white') return [1, 1, 1, 1];
	if (s === 'black') return [0, 0, 0, 1];
	if (s === 'transparent') return null;
	let m = s.match(/^#([0-9a-f]{6})$/);
	if (m) {
		const n = parseInt(m[1], 16);
		return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
	}
	m = s.match(/^#([0-9a-f]{3})$/);
	if (m)
		return [...m[1]].map((c) => parseInt(c + c, 16) / 255).concat(1) as [
			number,
			number,
			number,
			number
		];
	m = s.match(/^rgba?\(([^)]+)\)$/);
	if (m) {
		const p = m[1]
			.split(/[\s,/]+/)
			.filter(Boolean)
			.map(Number);
		return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] ?? 1];
	}
	return null;
}

/** Proxy a 2D context so solid fill/stroke colors are recolored. */
function recolorContext(
	ctx: CanvasRenderingContext2D,
	range: [number, number],
	opts: RecolorOptions = {}
): CanvasRenderingContext2D {
	// Bound methods, made once (a render calls them thousands of times).
	const bound = new Map<PropertyKey, unknown>();
	return new Proxy(ctx, {
		get(target, key) {
			const v = Reflect.get(target, key, target);
			if (typeof v !== 'function') return v;
			let fn = bound.get(key);
			if (!fn) bound.set(key, (fn = v.bind(target)));
			return fn;
		},
		set(target, key, value) {
			if ((key === 'fillStyle' || key === 'strokeStyle') && typeof value === 'string')
				value = invertLightness(value, range, opts);
			return Reflect.set(target, key, value, target);
		}
	});
}
