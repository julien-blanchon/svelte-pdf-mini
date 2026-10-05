import type { Getter } from './types.js';

export interface SyncedOptions<T> {
	/** A getter makes the value controlled; a plain value is the initial (uncontrolled) value. */
	value: T | Getter<T>;
	onChange?: (value: T) => void;
	equals?: (a: T, b: T) => boolean;
}

/**
 * Controlled / uncontrolled state (melt's `Synced`).
 * - getter → the owner is the source of truth, writes call `onChange`.
 * - value → internal state, writes update it and call `onChange`.
 */
export class Synced<T> {
	#getter: Getter<T> | null;
	// Raw: values are replaced, never mutated in place, and stay plain objects
	// (structuredClone / postMessage / IndexedDB reject $state proxies).
	#internal = $state.raw<T>() as T;
	#onChange?: (value: T) => void;
	#equals: (a: T, b: T) => boolean;

	constructor({ value, onChange, equals = Object.is }: SyncedOptions<T>) {
		this.#getter = typeof value === 'function' ? (value as Getter<T>) : null;
		if (!this.#getter) this.#internal = value as T;
		this.#onChange = onChange;
		this.#equals = equals;
	}

	get current(): T {
		return this.#getter ? this.#getter() : this.#internal;
	}

	set current(value: T) {
		if (this.#equals(this.current, value)) return;
		if (!this.#getter) this.#internal = value;
		this.#onChange?.(value);
	}
}
