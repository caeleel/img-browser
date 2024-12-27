import { logout } from "@/lib/utils";
import { ChangeEventHandler } from "react";

export default function Header({ breadcrumbs, onLogout = logout, updatePath, search, onSearch }: {
  breadcrumbs?: { path: string, name: string }[],
  onLogout?: () => void, updatePath?: (path: string) => void,
  search?: string,
  onSearch?: ChangeEventHandler<HTMLInputElement>
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
          <input
            type="text"
            value={search}
            onChange={onSearch}
            placeholder="Search images..."
            className="max-w-md px-2 py-1 h-6 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/50"
          />
        </div>
      )}
      <button
        onClick={onLogout}
        className="py-1 px-4 my-3 border border-black/50 rounded-full hover:bg-black/20 ml-4  text-gray-800 text-xs"
      >
        Logout
      </button>
    </div>
  )
}