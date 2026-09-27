export default function FolderIcon({ size = 24, color = '#888' }: { size?: number, color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 7.5V17.5C4.5 18.0523 4.94772 18.5 5.5 18.5H18.5C19.0523 18.5 19.5 18.0523 19.5 17.5V9.5C19.5 8.94772 19.0523 8.5 18.5 8.5H11.5L9.5 6.5H5.5C4.94772 6.5 4.5 6.94772 4.5 7.5Z" stroke={color} strokeLinejoin="round" />
    </svg>
  )
}
