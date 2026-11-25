import { useLayoutEffect, useRef } from 'react';

const focusableSelector = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

const openPanels: HTMLElement[] = [];
let initialOverflow = '';

export function useDialogFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const panel = useRef<T>(null);
  const close = useRef(onClose);

  useLayoutEffect(() => { close.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openPanels.length === 0) initialOverflow = document.body.style.overflow;
    openPanels.push(element);
    document.body.style.overflow = 'hidden';

    const tabbable = () => [...element.querySelectorAll<HTMLElement>(focusableSelector)]
      .filter((candidate) => candidate.tabIndex >= 0 && !candidate.matches(':disabled') && !candidate.closest('[hidden], [inert], [aria-hidden="true"]'));
    (element.querySelector<HTMLElement>('[data-dialog-initial]') ?? tabbable()[0] ?? element).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || openPanels.at(-1) !== element) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const items = tabbable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        element?.focus();
        return;
      }
      const active = document.activeElement;
      if (!element?.contains(active) || active === element || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const wasTop = openPanels.at(-1) === element;
      openPanels.splice(openPanels.indexOf(element), 1);
      if (openPanels.length === 0) document.body.style.overflow = initialOverflow;
      if (wasTop && previous?.isConnected) previous.focus();
    };
  }, [open]);

  return panel;
}
