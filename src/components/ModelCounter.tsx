interface Props {
  max: number
  value: number
  onChange: (count: number) => void
}

export function ModelCounter({ max, value, onChange }: Props) {
  if (max <= 1) return null // No point showing for single-model units

  return (
    <div class="flex items-center justify-between">
      <span class="text-xs opacity-60">Active models</span>
      <div class="flex items-center gap-2">
        <button
          class="btn btn-ghost btn-xs btn-circle"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
        >
          −
        </button>
        <span class="text-sm font-mono w-8 text-center">
          {value}/{max}
        </span>
        <button
          class="btn btn-ghost btn-xs btn-circle"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  )
}
