export default function PageSwitcher({ currentPage, visible, totalPages, handlePageChange }: {
  currentPage: number,
  totalPages: number,
  visible?: boolean,
  handlePageChange: (page: number) => void
}) {
  return <div className={`flex px-8 flex-wrap gap-2 justify-center max-w-full ${visible ? '' : 'opacity-0 pointer-events-none'}`}>
    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
      <button
        key={page}
        onClick={() => handlePageChange(page)}
        className={`text-xs ${currentPage === page
          ? 'font-bold text-black'
          : 'text-neutral-700 hover:underline hover:text-black'
          }`}
      >
        {page}
      </button>
    ))}
  </div>
}