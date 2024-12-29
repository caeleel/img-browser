'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const NAV_ITEMS = [
  { label: 'Browse', href: '/' },
  { label: 'Search', href: '/search' },
];

export default function Nav() {
  const pathname = usePathname();
  const [pillStyles, setPillStyles] = useState({ left: 0, width: 0 });
  const [isInitial, setIsInitial] = useState(true);
  const navRef = useRef<HTMLDivElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const updatePillPosition = () => {
      const activeIndex = NAV_ITEMS.findIndex(item =>
        pathname === item.href ||
        (item.href === '/' && pathname === '') ||
        (item.href !== '/' && pathname?.startsWith(item.href))
      );

      if (activeIndex === -1) return;

      const activeLink = activeLinkRef.current;
      const nav = navRef.current;

      if (!activeLink || !nav) return;

      const navRect = nav.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();

      setPillStyles({
        left: linkRect.left - navRect.left,
        width: linkRect.width,
      });

      // After initial position is set, enable transitions
      if (isInitial) {
        setTimeout(() => setIsInitial(false), 100);
      }
    };

    updatePillPosition();

    // Update on resize
    window.addEventListener('resize', updatePillPosition);
    return () => window.removeEventListener('resize', updatePillPosition);
  }, [pathname, isInitial]);

  return (
    <div className="px-1 py-1 my-[5px] bg-black/5 h-9 rounded-full shadow-inner pointer-events-auto z-50">
      <div ref={navRef} className="flex gap-1 relative">
        {/* Animated pill background */}
        <div
          className="absolute h-[28px] rounded-full bg-white shadow"
          style={{
            transform: `translateX(${pillStyles.left}px)`,
            width: pillStyles.width,
            transition: isInitial ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />

        {/* Nav items */}
        {NAV_ITEMS.map(({ label, href }) => {
          const isActive = pathname === href ||
            (href === '/' && pathname === '') ||
            (href !== '/' && pathname?.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              ref={isActive ? activeLinkRef : undefined}
              className={`
                px-4 py-1 text-sm rounded-full transition-colors relative
                ${isActive ? 'text-black' : 'text-black/50 hover:text-black/70'}
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