'use client';

import { useEffect, type RefObject } from 'react';

interface HeldScrollOptions {
  /** When true the hook is inert (e.g. shortcuts modal open). */
  disabled?: boolean;
}

const DOWN_KEYS = new Set(['j']);
const UP_KEYS = new Set(['k']);

// Per-frame velocity (px). Starts gentle, ramps up the longer the key is held,
// like holding an arrow key in an editor. Tuned for ~60fps.
const BASE_VELOCITY = 11;
const MAX_VELOCITY = 34;
const RAMP_MS = 380;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Continuous hold-to-scroll for a scrollable element: hold J to glide down,
 * K to glide up; release to stop. A quick tap nudges by one step.
 * Bound to document keydown/keyup (the global keyboard.ts registry is
 * keydown-only and cannot express press-and-hold).
 */
export function useHeldScroll(
  ref: RefObject<HTMLElement | null>,
  { disabled = false }: HeldScrollOptions = {},
) {
  useEffect(() => {
    if (disabled) return;

    let direction = 0;
    let rafId: number | null = null;
    let pressStartedAt = 0;

    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const applyScroll = (dir: number, velocity: number) => {
      const el = ref.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      const next = el.scrollTop + dir * velocity;
      el.scrollTop = next < 0 ? 0 : next > max ? max : next;
    };

    const step = () => {
      if (direction === 0) {
        rafId = null;
        return;
      }
      const ramp = Math.min(1, (now() - pressStartedAt) / RAMP_MS);
      applyScroll(direction, BASE_VELOCITY + (MAX_VELOCITY - BASE_VELOCITY) * ramp);
      rafId = requestAnimationFrame(step);
    };

    const start = (dir: number) => {
      // Immediate nudge so a quick tap always produces visible movement even
      // if keyup cancels the rAF loop before the first frame fires.
      applyScroll(dir, BASE_VELOCITY);
      if (direction === dir) return;
      direction = dir;
      pressStartedAt = now();
      if (rafId === null) {
        rafId = requestAnimationFrame(step);
      }
    };

    const stop = () => {
      direction = 0;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return;
      const key = event.key.toLowerCase();
      if (DOWN_KEYS.has(key)) {
        event.preventDefault();
        start(1);
      } else if (UP_KEYS.has(key)) {
        event.preventDefault();
        start(-1);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (DOWN_KEYS.has(key) && direction === 1) stop();
      else if (UP_KEYS.has(key) && direction === -1) stop();
    };

    const onBlur = () => stop();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      stop();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [ref, disabled]);
}
