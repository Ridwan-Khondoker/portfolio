import { getLenis } from './motion/core';

// Full-screen menu: toggled by the header button, closed with Escape or a link; focus stays inside while open.
export function initMenu() {
  const btn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.getElementById('site-menu');
  if (!btn || !menu) return;

  const focusables = () => Array.from(menu.querySelectorAll<HTMLElement>('a, button'));
  const setOpen = (open: boolean) => {
    btn.setAttribute('aria-expanded', String(open));
    btn.querySelector('[data-menu-label]')!.textContent = open ? 'Close' : 'Menu';
    menu.toggleAttribute('data-open', open);
    menu.inert = !open;
    document.documentElement.classList.toggle('menu-open', open);
    open ? getLenis()?.stop() : getLenis()?.start();
    if (open) focusables()[0]?.focus();
  };

  menu.inert = true;
  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!menu.hasAttribute('data-open')) return;
    if (e.key === 'Escape') { setOpen(false); btn.focus(); }
    if (e.key === 'Tab') {
      const f = [btn, ...focusables()];
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
}
