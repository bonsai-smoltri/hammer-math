interface Props {
  /** Accessible name for the group; also the visible label unless `compact`. */
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Extra context after the label, e.g. the damage each failed save deals. */
  hint?: string
  /** Text shown instead of the bare number, e.g. "12/20W". */
  display?: string
  /** Offered when the value has been overridden, to put it back. */
  onReset?: () => void
  resetLabel?: string
  /** Drops the visible label, for laying several steppers out in a row. */
  compact?: boolean
}

/**
 * Number entry sized for thumbs.
 *
 * The value is deliberately not typeable: at the table these counts are small
 * (failed saves, weapons firing, wounds), so +/- is always the faster path and a
 * text field only serves to raise the keyboard over the readout. The buttons are
 * still buttons, so keyboard and switch access work through them.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max,
  hint,
  display,
  onReset,
  resetLabel,
  compact = false,
}: Props) {
  const id = `stepper-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min, next))

  const controls = (
    <div class="flex items-center gap-1 shrink-0">
      <StepButton
        symbol="−"
        label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      />

      <span
        class={`font-mono text-center tabular-nums ${
          display ? 'w-20 text-sm' : compact ? 'w-7 text-base' : 'w-10 text-base'
        }`}
        aria-live="polite"
      >
        {display ?? value}
      </span>

      <StepButton
        symbol="+"
        label={`Increase ${label}`}
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(clamp(value + 1))}
      />
    </div>
  )

  if (compact) {
    return (
      <div
        class="flex items-center rounded-lg border border-base-content/10 px-1 py-0.5"
        role="group"
        aria-label={label}
      >
        {controls}
      </div>
    )
  }

  return (
    <div class="flex items-center gap-2 flex-wrap" role="group" aria-labelledby={id}>
      <span class="text-sm flex-1 min-w-24" id={id}>
        {label}
        {hint && <span class="text-xs opacity-70"> ({hint})</span>}
      </span>

      {onReset && (
        <button type="button" class="btn btn-ghost btn-xs h-8" onClick={onReset}>
          {resetLabel ?? 'Reset'}
        </button>
      )}

      {controls}
    </div>
  )
}

function StepButton({
  symbol,
  label,
  disabled,
  onClick,
}: {
  symbol: string
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      class="btn btn-circle btn-ghost border border-base-content/20 h-9 w-9 min-h-9 text-lg leading-none select-none"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  )
}
