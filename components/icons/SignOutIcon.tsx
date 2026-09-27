export default function SignOutIcon({ color = 'currentColor', size = 20 }: { color?: string, size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 5.5H7.5C6.94772 5.5 6.5 5.94772 6.5 6.5V17.5C6.5 18.0523 6.94772 18.5 7.5 18.5H13" stroke={color} strokeLinecap="round" />
      <path d="M11 12H18.5M18.5 12L15.5 9M18.5 12L15.5 15" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
