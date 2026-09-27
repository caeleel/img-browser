import { useEffect, useId, useRef, useState } from 'react';

// While `downloading`, arrows keep dropping through the circle; when it ends, a last one drops
// into place. The arrow is clipped to the circle's inside, so it slides in and out of view.
export default function DownloadIcon({ size = 24, color = '#888', downloading = false }: {
  size?: number,
  color?: string,
  downloading?: boolean,
}) {
  const insideId = useId();
  const [landing, setLanding] = useState(false);
  const wasDownloading = useRef(downloading);

  useEffect(() => {
    if (wasDownloading.current && !downloading) setLanding(true);
    wasDownloading.current = downloading;
  }, [downloading]);

  const arrowClass = downloading ? 'download-arrow-loop' : landing ? 'download-arrow-land' : '';

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={insideId}>
          <circle cx="12" cy="12" r="7" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="7.5" stroke={color} />
      <g clipPath={`url(#${insideId})`}>
        <path
          d="M10 8.5H14V12.5H16L12 16.5L8 12.5H10Z"
          stroke={color}
          strokeLinejoin="miter"
          className={arrowClass}
          onAnimationEnd={() => setLanding(false)}
        />
      </g>
    </svg>
  )
}
