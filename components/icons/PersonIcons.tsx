// Head-and-shoulders icons for the People views, in the same 24px outline style as the others.

export function NotPersonIcon({ color = '#888', size = 24 }: { color?: string, size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="8.5" r="3" stroke={color} />
      <path d="M4.5 18.5C4.5 15.4624 6.96243 13.5 10 13.5C11.1 13.5 12.1 13.75 12.95 14.2" stroke={color} strokeLinecap="round" />
      <path d="M15 16.5H20" stroke={color} strokeLinecap="round" />
    </svg>
  );
}

export function PortraitIcon({ color = '#888', size = 24 }: { color?: string, size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="7.5" stroke={color} />
      <circle cx="12" cy="10.25" r="2.25" stroke={color} />
      <path d="M7.75 17.25C8.5 15.25 10.1 14.25 12 14.25C13.9 14.25 15.5 15.25 16.25 17.25" stroke={color} />
    </svg>
  );
}

export function MergeIcon({ color = '#888', size = 24 }: { color?: string, size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8.5" cy="12" r="4" stroke={color} />
      <circle cx="15.5" cy="12" r="4" stroke={color} />
    </svg>
  );
}

export function HideIcon({ hidden, color = '#888', size = 24 }: { hidden: boolean, color?: string, size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 12C5.5 8.5 8.5 6.5 12 6.5C15.5 6.5 18.5 8.5 20.5 12C18.5 15.5 15.5 17.5 12 17.5C8.5 17.5 5.5 15.5 3.5 12Z" stroke={color} />
      <circle cx="12" cy="12" r="2.5" stroke={color} />
      {hidden && <path d="M5 19L19 5" stroke={color} strokeLinecap="round" />}
    </svg>
  );
}
