import { logout } from "@/lib/utils";
import { ChangeEventHandler, useEffect } from "react";
import Nav from "./Nav";
import { useRouter } from "next/navigation";

export default function Header({ breadcrumbs, onLogout = logout, updatePath, search, onSearch }: {
  breadcrumbs?: { path: string, name: string }[],
  onLogout?: () => void,
  updatePath?: (path: string) => void,
  search?: string,
  onSearch?: ChangeEventHandler<HTMLInputElement>
}) {
  const router = useRouter();

  useEffect(() => {
    const keyboardHandler = (e: KeyboardEvent) => {
      if (e.key === 'f' && e.metaKey) {
        e.preventDefault();
        if (onSearch) {
          const input = document.querySelector('input');
          if (input) {
            input.focus();
            input.select();
          }
        } else {
          router.push('/search');
        }
      }
    }
    window.addEventListener('keydown', keyboardHandler);
    return () => window.removeEventListener('keydown', keyboardHandler);
  }, [onSearch, router])

  return (
    <div className="sticky top-8 lg:top-0 z-10 backdrop-blur-lg bg-neutral-100/50 border-b border-black/5">
      {/* Main header content */}
      <div className="flex w-full flex-row-reverse gap-4 items-center justify-between px-4 py-2">
        <button
          onClick={onLogout}
          className="py-1 px-4 border border-black/30 rounded-full hover:bg-black/10 hover:text-black text-black/50 text-sm whitespace-nowrap"
        >
          Sign out
        </button>

        {/* Left section */}
        {breadcrumbs !== undefined && updatePath !== undefined && (
          <div className="flex items-center flex-wrap text-black/50 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center">
                {index > 0 && <span className="mx-3 text-sm">/</span>}
                <button
                  onClick={() => updatePath(crumb.path)}
                  className="hover:text-black hover:underline max-w-[250px] text-left text-ellipsis overflow-hidden text-nowrap"
                >
                  {crumb.name || '/'}
                </button>
              </div>
            ))}
          </div>
        )}

        {search !== undefined && onSearch !== undefined && (
          <div className="relative">
            <div className="absolute left-2 top-[7px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.5707 14.5C15.4548 13.5981 16 12.3627 16 11C16 8.23858 13.7614 6 11 6C8.23858 6 6 8.23858 6 11C6 13.7614 8.23858 16 11 16C12.3987 16 13.6633 15.4257 14.5707 14.5ZM14.5707 14.5L19.0707 19" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="2" />
              </svg>
            </div>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={onSearch}
              placeholder="Search images..."
              className="bg-white/5 w-64 px-2 py-1 pl-8 text-sm rounded-full border border-black/10 focus:outline-none focus:ring-1 focus:ring-black/50"
            />
          </div>
        )}
      </div>
    </div>
  );
}