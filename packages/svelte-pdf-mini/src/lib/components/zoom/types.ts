import type { ZoomMode } from '../../core/types.js';
import type { ButtonPartProps, SelectPartProps } from '../../internal/component-types.js';

export type ZoomButtonProps = ButtonPartProps<Record<never, never>, { disabled: boolean }>;
export type ZoomModeProps = ButtonPartProps<{ mode: ZoomMode }, { active: boolean }>;
export type ZoomSelectProps = SelectPartProps<{
	/** Fit modes offered, in order. */
	modes?: Exclude<ZoomMode, 'manual'>[];
	/** Labels for fit modes. */
	labels?: Partial<Record<ZoomMode, string>>;
}>;
