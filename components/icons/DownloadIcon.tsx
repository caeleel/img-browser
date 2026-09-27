import { useId } from 'react';

// On hover of the enclosing `group` button, the arrow drops out and a new one drops into place.
// While `loading`, the ring opens into a spinning arc. Animations are in globals.css.
export default function DownloadIcon({ size = 24, color = '#888', loading = false }: {
  size?: number,
  color?: string,
  loading?: boolean,
}) {
  const insideId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={insideId}>
          <circle cx="12" cy="12" r="7" />
        </clipPath>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="7.5"
        stroke={color}
        strokeLinecap="round"
        className={`download-ring ${loading ? 'download-ring-loading' : ''}`}
      />
      <g clipPath={`url(#${insideId})`}>
        <path d="M10 8.5H14V12.5H16L12 16.5L8 12.5H10Z" stroke={color} className="download-arrow" />
      </g>
    </svg>
  )
}
