// Optional invite emails through Resend (RESEND_API_KEY + MAIL_FROM). Without them, admins copy the link instead.
export function mailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendLinkEmail(to: string, link: string, kind: 'invite' | 'reset'): Promise<boolean> {
  if (!mailConfigured()) return false;
  const subject = kind === 'invite' ? 'You have been invited to Automated Finance' : 'Reset your Automated Finance access';
  const text = `${kind === 'invite' ? 'You have been invited to a private finance workspace.' : 'An admin reset your password and two-step verification.'}\n\nOpen this link within 72 hours to set a password and turn on two-step verification (it works once):\n\n${link}\n\nIf you weren't expecting this, ignore this email.`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
  });
  return res.ok;
}
