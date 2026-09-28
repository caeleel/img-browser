'use client';

import { useEffect, useState } from 'react';

const QUERY = '(hover: none) and (pointer: coarse)';

// True on phones and tablets (a finger is the main pointer), where the viewer swaps its desktop
// behaviours for touch ones.
export function useIsTouch() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    setIsTouch(media.matches);
    const update = () => setIsTouch(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isTouch;
}
