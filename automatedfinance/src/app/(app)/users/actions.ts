'use server';

import { revalidatePath } from 'next/cache';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { run, str } from '@/lib/server/actions';
import { adminResetAccess, createLink, isEmail, normalizeEmail } from '@/lib/server/accounts';
import { revokeAllSessions, revokeSession } from '@/lib/security/session';
import { audit } from '@/lib/security/audit';
import { appUrl } from '@/lib/env';
import { sendLinkEmail } from '@/lib/server/mail';
import type { ActionResult } from '@/components/ui/ActionForm';

const ROLES: Role[] = ['ADMIN', 'EDITOR', 'VIEWER'];

async function activeAdminCount(exceptId?: string) {
  return prisma.user.count({ where: { role: 'ADMIN', active: true, totpEnabled: true, ...(exceptId ? { id: { not: exceptId } } : {}) } });
}

export async function inviteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireActionUser('ADMIN');
    const email = normalizeEmail(str(fd, 'email'));
    const role = str(fd, 'role') as Role;
    if (!isEmail(email)) throw new Error('Enter a valid email address.');
    if (!ROLES.includes(role)) throw new Error('Choose a role.');
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.active && existing.totpEnabled) throw new Error('That person already has an account. Change their role instead.');
    const token = await createLink({ kind: 'INVITE', email, role, createdById: admin.userId });
    const link = new URL(`/invite/${token}`, appUrl()).toString();
    const emailed = str(fd, 'send') === 'on' ? await sendLinkEmail(email, link, 'invite') : false;
    await audit({ action: 'invite.created', userId: admin.userId, target: email, details: { role, emailed }, ...(await requestMeta()) });
    revalidatePath('/users');
    return { ok: true, message: emailed ? `Invite emailed to ${email}. You can also copy the link below.` : `Invite created for ${email}. Copy the link and send it to them privately.`, data: { link } };
  });
}

export async function changeRoleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireActionUser('ADMIN');
    const id = str(fd, 'userId');
    const role = str(fd, 'role') as Role;
    if (!ROLES.includes(role)) throw new Error('Unknown role.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.role === 'ADMIN' && role !== 'ADMIN' && (await activeAdminCount(id)) === 0) throw new Error('Keep at least one active admin.');
    await prisma.user.update({ where: { id }, data: { role } });
    await audit({ action: 'user.role_changed', userId: admin.userId, target: user.email, details: { from: user.role, to: role }, ...(await requestMeta()) });
    revalidatePath('/users');
    return { ok: true, message: `${user.email} is now ${role.toLowerCase()}.` };
  });
}

export async function setActiveAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireActionUser('ADMIN');
    const id = str(fd, 'userId');
    const active = str(fd, 'active') === '1';
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (!active && id === admin.userId) throw new Error('You cannot deactivate yourself.');
    if (!active && user.role === 'ADMIN' && (await activeAdminCount(id)) === 0) throw new Error('Keep at least one active admin.');
    await prisma.user.update({ where: { id }, data: { active } });
    if (!active) await revokeAllSessions(id, 'account deactivated');
    await audit({ action: active ? 'user.reactivated' : 'user.deactivated', userId: admin.userId, target: user.email, ...(await requestMeta()) });
    revalidatePath('/users');
    return { ok: true, message: active ? `${user.email} can sign in again.` : `${user.email} is deactivated and signed out everywhere.` };
  });
}

export async function resetAccessAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireActionUser('ADMIN');
    const id = str(fd, 'userId');
    if (id === admin.userId) throw new Error('Reset your own access from the Account page, or ask another admin.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.role === 'ADMIN' && (await activeAdminCount(id)) === 0) throw new Error('Keep at least one admin with working 2FA.');
    const token = await adminResetAccess(id, admin.userId, await requestMeta());
    const link = new URL(`/reset/${token}`, appUrl()).toString();
    const emailed = str(fd, 'send') === 'on' ? await sendLinkEmail(user.email, link, 'reset') : false;
    revalidatePath('/users');
    return { ok: true, message: `2FA and password reset for ${user.email}; their sessions are ended. ${emailed ? 'Link emailed.' : 'Send them this one-time link:'}`, data: { link } };
  });
}

export async function revokeSessionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireActionUser('ADMIN');
    const id = str(fd, 'sessionId');
    const s = await prisma.session.findUniqueOrThrow({ where: { id }, include: { user: true } });
    await revokeSession(id, 'revoked by admin');
    await audit({ action: 'session.revoked', userId: admin.userId, target: s.user.email, details: { sessionId: id }, ...(await requestMeta()) });
    revalidatePath('/users');
    return { ok: true, message: 'Session ended.' };
  });
}

export async function revokeInviteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireActionUser('ADMIN');
    const id = str(fd, 'tokenId');
    const t = await prisma.authToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit({ action: 'invite.revoked', userId: admin.userId, target: t.email, ...(await requestMeta()) });
    revalidatePath('/users');
    return { ok: true, message: 'Link cancelled.' };
  });
}
