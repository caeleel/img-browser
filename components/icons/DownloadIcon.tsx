export default function DownloadIcon({ size = 24, color = '#888' }: { size?: number, color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 8.5V8H9.5V8.5H10ZM14 8.5H14.5V8H14V8.5ZM14 12.5H13.5V13H14V12.5ZM16 12.5L16.3536 12.8536L16 12V12.5ZM12 16.5L11.6464 16.8536L12 17.2071L12.3536 16.8536L12 16.5ZM8 12.5V12L7.64645 12.8536L8 12.5ZM10 12.5V13H10.5V12.5H10ZM19 12C19 15.866 15.866 19 12 19V20C16.4183 20 20 16.4183 20 12H19ZM12 19C8.13401 19 5 15.866 5 12H4C4 16.4183 7.58172 20 12 20V19ZM5 12C5 8.13401 8.13401 5 12 5V4C7.58172 4 4 7.58172 4 12H5ZM12 5C15.866 5 19 8.13401 19 12H20C20 7.58172 16.4183 4 12 4V5ZM10 9H14V8H10V9ZM13.5 8.5V12.5H14.5V8.5H13.5ZM14 13H16V12H14V13ZM15.6464 12.1464L11.6464 16.1464L12.3536 16.8536L16.3536 12.8536L15.6464 12.1464ZM12.3536 16.1464L8.35355 12.1464L7.64645 12.8536L11.6464 16.8536L12.3536 16.1464ZM8 13H10V12H8V13ZM10.5 12.5V8.5H9.5V12.5H10.5Z" fill={color} />
    </svg>
  )
}