import { logout } from "@/lib/utils";
import { ChangeEventHandler } from "react";

export default function Header({ breadcrumbs, onLogout = logout, updatePath, search, onSearch, upload }: {
  breadcrumbs?: { path: string, name: string }[],
  onLogout?: () => void, updatePath?: (path: string) => void,
  search?: string,
  onSearch?: ChangeEventHandler<HTMLInputElement>
  upload?: boolean
}) {
  return (
    <div className="sticky top-0 w-full flex justify-between items-center px-4 z-10 backdrop-blur-lg bg-neutral-100/50 border-b border-black/5">
      {breadcrumbs !== undefined && updatePath !== undefined && (
        <div className="flex items-center flex-wrap text-gray-300 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.path} className="flex items-center">
              {index > 0 && <span className="text-neutral-900 mx-3 text-sm">/</span>}
              <button
                onClick={() => updatePath(crumb.path)}
                className="hover:text-black text-neutral-900 hover:underline max-w-[250px] text-left text-ellipsis overflow-hidden text-nowrap"
              >
                {crumb.name || '/'}
              </button>
            </div>
          ))}
        </div>
      )}
      {search !== undefined && onSearch !== undefined && (
        <div>
          <div className="absolute left-5 top-[15px]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5707 14.5C15.4548 13.5981 16 12.3627 16 11C16 8.23858 13.7614 6 11 6C8.23858 6 6 8.23858 6 11C6 13.7614 8.23858 16 11 16C12.3987 16 13.6633 15.4257 14.5707 14.5ZM14.5707 14.5L19.0707 19" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="2" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={onSearch}
            placeholder="Search images..."
            className="bg-white/5 max-w-md px-2 py-1 pl-8 text-sm rounded-full border border-black/10 focus:outline-none focus:ring-1 focus:ring-black/50"
          />
        </div>
      )}
      {upload && (
        <div className="px-4 text-sm">
          Upload
        </div>
      )}
      <button
        onClick={onLogout}
        className="py-1 px-4 my-3 border border-black/5 rounded-full hover:bg-black/10 hover:text-black/50 ml-4  text-black/30 text-sm"
      >
        Sign out
      </button>
    </div>
  )
}