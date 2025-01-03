export default function VolumeIcon({ volume = 1 }: { volume: number }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      {/* Base speaker icon */}
      <path d="M3 9v6h4l5 5V4L7 9H3z" />

      {/* Inner wave (shown when volume > 0) */}
      {volume > 0 && (
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
      )}

      {/* Outer wave (shown when volume > 0.5) */}
      {volume > 0.5 && (
        <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      )}

      {/* Muted slash overlay */}
      {volume === 0 && (
        <>
          {/* Black outline */}
          <path
            stroke="black"
            strokeWidth="4"
            d="M3 4.5l15 15"
            fill="none"
          />
          {/* White slash */}
          <path
            stroke="currentColor"
            strokeWidth="1.5"
            d="M3 4.5l15 15"
            fill="none"
          />
        </>
      )}
    </svg>
  );
} 