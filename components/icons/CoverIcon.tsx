import { useId } from 'react';

// A framed landscape. `set` raises the sun above the mountains; unset, it sinks behind them.
export default function CoverIcon({ size = 24, color = '#888', set = false }: { size?: number, color?: string, set?: boolean }) {
  const skyId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Everything above the ridge line; the sun is only visible inside it. */}
        <clipPath id={skyId}>
          <path d="M4.5 5.5H19.5V17L15.5 13L13 15.5L9 11.5L4.5 16Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${skyId})`}>
        <circle
          cx="15.5"
          cy="9"
          r="1.5"
          stroke={color}
          style={{
            transform: set ? 'translateY(0)' : 'translateY(7px)',
            transition: 'transform 450ms cubic-bezier(0.34, 1.3, 0.64, 1)',
          }}
        />
      </g>
      <rect x="4.5" y="5.5" width="15" height="13" rx="1" stroke={color} />
      <path d="M4.5 16L9 11.5L13 15.5L15.5 13L19.5 17" stroke={color} strokeLinejoin="round" />
    </svg>
  )
}
