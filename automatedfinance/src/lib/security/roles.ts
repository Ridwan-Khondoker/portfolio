import type { Role } from '@prisma/client';

const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };

export function hasRole(role: Role, needed: Role): boolean {
  return RANK[role] >= RANK[needed];
}

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', EDITOR: 'Editor', VIEWER: 'Viewer' };
