import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { dispatchKey, registerShortcut, unregisterShortcut } from './keyboard';

afterEach(() => {
  unregisterShortcut('j');
  unregisterShortcut('g t');
});

beforeEach(() => {
  document.body.innerHTML = '';
});

test('J key triggers handler', () => {
  const handler = vi.fn();
  registerShortcut('j', handler);

  expect(dispatchKey('J')).toBe(true);
  expect(handler).toHaveBeenCalledTimes(1);
});

test('ignored when focused in input', () => {
  const handler = vi.fn();
  registerShortcut('j', handler);

  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();

  expect(dispatchKey('j')).toBe(false);
  expect(handler).not.toHaveBeenCalled();
});

test('two-key chord g t works', () => {
  const handler = vi.fn();
  registerShortcut('g t', handler);

  expect(dispatchKey('g')).toBe(true);
  expect(handler).not.toHaveBeenCalled();
  expect(dispatchKey('t')).toBe(true);
  expect(handler).toHaveBeenCalledTimes(1);
});

test('chord times out after 1 second', () => {
  vi.useFakeTimers();
  const handler = vi.fn();
  registerShortcut('g t', handler);

  expect(dispatchKey('g')).toBe(true);
  vi.advanceTimersByTime(1001);
  expect(dispatchKey('t')).toBe(false);
  expect(handler).not.toHaveBeenCalled();
  vi.useRealTimers();
});
