import { ScrollTrigger } from './core';

// The page background flips black <-> white as each section crosses the middle of the viewport.
export function initThemeSwitch() {
  const root = document.documentElement;
  document.querySelectorAll<HTMLElement>('[data-section-theme]').forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) root.dataset.theme = section.dataset.sectionTheme;
      },
    });
  });
}
