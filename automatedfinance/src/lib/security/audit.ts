import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type AuditInput = {
  action: string;
  userId?: string | null;
  email?: string | null;
  target?: string | null;
  details?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
};

export async function audit(entry: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        userId: entry.userId ?? null,
        email: entry.email ?? null,
        target: entry.target ?? null,
        details: entry.details,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error('audit log write failed', (err as Error).message);
  }
}
