import { ScrollTrigger } from './core';

// The page background flips black <-> white as each section crosses the middle of the viewport.
// A "split" section (black and white side by side) gets its own header treatment; when its
// halves stack on narrow screens, each half drives the theme instead.
export function initThemeSwitch() {
  const root = document.documentElement;
  const stacked = window.matchMedia('(max-width: 900px)').matches;
  const watch = (el: HTMLElement, attr: 'sectionTheme' | 'sideTheme') => ScrollTrigger.create({
    trigger: el,
    start: 'top 50%',
    end: 'bottom 50%',
    // read at toggle time so a page can re-theme its sections on the fly (e.g. the /work tabs)
    onToggle: (self) => { const t = el.dataset[attr]; if (self.isActive && t) root.dataset.theme = t; },
  });
  document.querySelectorAll<HTMLElement>('[data-section-theme]').forEach((section) => {
    const halves = section.querySelectorAll<HTMLElement>('[data-side-theme]');
    if (section.dataset.sectionTheme === 'split' && stacked && halves.length) {
      halves.forEach((h) => watch(h, 'sideTheme'));
    } else {
      watch(section, 'sectionTheme');
    }
  });
}
