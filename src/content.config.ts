import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Development work: a flagship case study, with sub-apps/integrations nested under it via `parent`.
const dev = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/dev' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    parent: z.string().optional(),
    url: z.string().url().optional(),
    place: z.string().optional(),
    role: z.string(),
    stack: z.array(z.string()),
    status: z.enum(['Live', 'In progress', 'Planned']),
    scale: z.string().optional(),
    shot: z.string().optional(),
    order: z.number().default(99),
    // true until Ridwan confirms the write-up
    draft: z.boolean().default(false),
  }),
});

// Project management / marketing clients: a light grid, not deep dives.
const clients = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/clients' }),
  schema: z.object({
    name: z.string(),
    url: z.string().url().optional(),
    scope: z.string(),
    note: z.string().optional(),
    result: z.string().optional(),
    shot: z.string().optional(),
    shotHover: z.string().optional(),
    order: z.number().default(99),
  }),
});

export const collections = { dev, clients };
