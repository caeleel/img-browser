import { useLayoutEffect, useRef } from "react";

export default function PageSwitcher({ currentPage, visible, totalPages, handlePageChange }: {
  currentPage: number,
  totalPages: number,
  visible?: boolean,
  handlePageChange: (page: number) => void
}) {
  const currentPageRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (currentPageRef.current) {
      // check to see if the ref is already in the viewport
      const rect = currentPageRef.current.getBoundingClientRect();
      if (rect.left < 80 || rect.right > window.innerWidth - 80) {
        currentPageRef.current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
    }
  }, [currentPage]);

  return <div className={`flex gap-3 justify-center h-8 w-full overflow-hidden ${visible ? '' : 'opacity-0 pointer-events-none'}`}>
    <div className={`h-5 w-5 mt-1.5 rounded cursor-pointer hover:bg-white/30 ${currentPage === 1 ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={() => handlePageChange(1)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 6L6 12L12 18M18 6L12 12L18 18" stroke="black" />
      </svg>
    </div>
    <div className={`h-5 w-5 mt-1.5 rounded cursor-pointer hover:bg-white/30 ${currentPage === 1 ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={() => handlePageChange(currentPage - 1)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 18L9 12L15 6" stroke="black" />
      </svg>
    </div>
    <div className="flex flex-grow gap-2 pt-1.5 pb-16 overflow-x-scroll overflow-y-hidden px-16" style={{
      maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
      WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
      maskType: 'alpha',
    }}>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          ref={page === currentPage ? currentPageRef : undefined}
          onClick={() => handlePageChange(page)}
          className={`text-xs text-black h-5 px-1 rounded select-none ${currentPage === page
            ? 'font-bold bg-black/10'
            : 'text-neutral-700 hover:bg-black/5'
            }`}
        >
          {page}
        </button>
      ))}
    </div>
    <div className={`h-5 w-5 mt-1.5 rounded cursor-pointer hover:bg-white/30 ${currentPage === totalPages ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={() => handlePageChange(currentPage + 1)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 6L15 12L9 18" stroke="black" />
      </svg>
    </div>
    <div className={`h-5 w-5 mt-1.5 rounded cursor-pointer hover:bg-white/30 ${currentPage === totalPages ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={() => handlePageChange(totalPages)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 6L13 12L7 18M12 6L18 12L12 18" stroke="black" />
      </svg>
    </div>
  </div>
}