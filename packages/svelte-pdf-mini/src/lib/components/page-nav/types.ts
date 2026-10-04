import type { ButtonPartProps, InputPartProps } from '../../internal/component-types.js';

export type PageNavButtonProps = ButtonPartProps<Record<never, never>, { disabled: boolean }>;
export type PageNavInputProps = InputPartProps<
	Record<never, never>,
	{ page: number; numPages: number }
>;
