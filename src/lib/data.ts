import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';

// Screenshots written by scripts/capture.mjs: <slug>-desktop.webp / <slug>-mobile.webp
const shots = import.meta.glob<{ default: ImageMetadata }>('/src/assets/shots/*.webp', { eager: true });
export const shot = (slug: string | undefined, view: 'desktop' | 'mobile' = 'desktop') =>
  slug ? shots[`/src/assets/shots/${slug}-${view}.webp`]?.default : undefined;

export type DevProject = CollectionEntry<'dev'> & { children: CollectionEntry<'dev'>[] };

export async function getDevProjects(): Promise<DevProject[]> {
  const all = (await getCollection('dev')).sort((a, b) => a.data.order - b.data.order);
  return all
    .filter((e) => !e.data.parent)
    .map((p) => ({ ...p, children: all.filter((c) => c.data.parent === p.id) }));
}

export async function getClients() {
  return (await getCollection('clients')).sort((a, b) => a.data.order - b.data.order);
}

export const host = (url?: string) => (url ? new URL(url).hostname.replace(/^www\./, '') : undefined);

/** Everything in the log: dev projects, their sub-apps and every client. */
export async function projectCount() {
  return (await getCollection('dev')).length + (await getCollection('clients')).length;
}
