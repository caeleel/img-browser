'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV_ITEMS = [
  { label: 'Browse', href: '/' },
  { label: 'Search', href: '/search' },
  { label: 'Upload', href: '/upload' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <div className="px-1 py-1 my-[5px] bg-black/5 rounded-full shadow-inner">
      <div className="flex gap-1">
        {NAV_ITEMS.map(({ label, href }) => {
          const isActive = pathname === href ||
            (href === '/' && pathname === '') ||
            (href !== '/' && pathname?.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={`
                px-4 py-1 text-sm rounded-full transition-colors
                ${isActive
                  ? 'bg-white shadow text-black'
                  : 'text-black/50 hover:text-black/70'
                }
              `}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
} 