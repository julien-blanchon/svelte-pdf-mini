/** Metadata every demo exports from its `<script module>` (`export const meta`). */
export interface ExampleMeta {
	title: string;
	description: string;
	/** Sort order in the sidebar. */
	order: number;
	/** 'example' = single feature, 'app' = integrated use case. */
	kind: 'example' | 'app';
}
