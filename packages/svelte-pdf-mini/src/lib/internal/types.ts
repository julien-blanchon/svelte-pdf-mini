export type Getter<T> = () => T;
export type MaybeGetter<T> = T | Getter<T>;

export function extract<T>(value: MaybeGetter<T>): T;
export function extract<T>(value: MaybeGetter<T | undefined>, fallback: T): T;
export function extract<T>(value: MaybeGetter<T | undefined>, fallback?: T): T | undefined {
	const v = typeof value === 'function' ? (value as Getter<T | undefined>)() : value;
	return v === undefined ? fallback : v;
}

/** `true` → "" (present), `false` → undefined (absent). For data-* attributes. */
export function dataAttr(on: boolean | undefined): '' | undefined {
	return on ? '' : undefined;
}

/** The value type behind a MaybeGetter option. */
export type Resolved<T> = T extends Getter<infer R> ? R : T;

/** Read an option that may be a value or a getter, fully typed. */
export function readOption<O extends object, K extends keyof O>(opts: O, key: K): Resolved<O[K]> {
	const v = opts[key] as unknown;
	return (typeof v === 'function' ? (v as () => unknown)() : v) as Resolved<O[K]>;
}
