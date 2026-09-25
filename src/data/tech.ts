import * as si from 'simple-icons';

type Icon = { title: string; path: string };
export type Tech = { name: string; path?: string };

// Logos from simple-icons (CC0). OpenAI and Canva aren't in the set, so they render as text tiles.
const icon = (i: Icon): Tech => ({ name: i.title, path: i.path });

export const technologies: Tech[] = [
  icon(si.siLaravel), icon(si.siVuedotjs), icon(si.siFilament),
  icon(si.siTypescript), icon(si.siJavascript), icon(si.siReact), icon(si.siNextdotjs), icon(si.siNodedotjs),
  icon(si.siExpress), icon(si.siPython), icon(si.siDjango), icon(si.siCplusplus), icon(si.siR),
  icon(si.siNumpy), icon(si.siPandas), icon(si.siTensorflow),
  icon(si.siMysql), icon(si.siPostgresql), icon(si.siMongodb), icon(si.siPrisma), icon(si.siPocketbase),
  icon(si.siTailwindcss), icon(si.siSass), icon(si.siShadcnui), icon(si.siFigma), icon(si.siPwa),
  icon(si.siDocker), icon(si.siNginx), icon(si.siLinux), icon(si.siUbuntu), icon(si.siDigitalocean),
  icon(si.siVercel), icon(si.siGithub), icon(si.siStripe),
  { name: 'OpenAI' }, { name: 'Canva' },
];
