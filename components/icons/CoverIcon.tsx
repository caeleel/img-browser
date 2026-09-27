export default function CoverIcon({ size = 24, color = '#888', done = false }: { size?: number, color?: string, done?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4.5" y="5.5" width="15" height="13" rx="1" stroke={color} />
      {done ? (
        <path d="M8.5 12L11 14.5L15.5 9.5" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <path d="M4.5 16L9 11.5L13 15.5L15.5 13L19.5 17" stroke={color} strokeLinejoin="round" />
          <circle cx="15.5" cy="9" r="1.5" stroke={color} />
        </>
      )}
    </svg>
  )
}
