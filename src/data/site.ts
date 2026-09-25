export const site = {
  name: 'Ridwan Khondoker',
  role: 'Software engineer & project manager',
  email: 'ridwan.tribemarketing@gmail.com',
  base: 'Dhaka, Bangladesh',
  companies: ['Tribe Marketing', 'Happy To Deliver'],
  // Add links here and the footer/menu pick them up.
  socials: [] as { label: string; href: string }[],
};

// Profile facts shown on the home page (About section) and the About page.
export const profile = {
  fullName: 'Khondoker Ridwan Mahin',
  facts: [
    ['Roles', 'Software engineer · Project manager'],
    ['Companies', 'Tribe Marketing · Happy To Deliver'],
    ['Based in', 'Dhaka, Bangladesh'],
    ['Core stack', 'Laravel · Vue · Filament · MySQL'],
    ['Team', '5 countries'],
    ['Availability', '24/7, teams on call'],
  ] as const,
};

export const stats = {
  pmYears: 7,
  devYears: 3,
  companies: 2,
};
