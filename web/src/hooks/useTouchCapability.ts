'use client';

import { useEffect, useState } from 'react';

function detectTouchCapability(query: MediaQueryList): boolean {
  return query.matches || navigator.maxTouchPoints > 0;
}

export function useTouchCapability(): boolean {
  const [touchCapable, setTouchCapable] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(any-pointer: coarse)');
    const update = () => setTouchCapable(detectTouchCapability(query));
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return touchCapable;
}
