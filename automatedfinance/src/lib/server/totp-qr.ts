import QRCode from 'qrcode';
import { otpauthUrl } from '@/lib/security/totp';

export function totpQrSvg(secret: string, email: string): Promise<string> {
  return QRCode.toString(otpauthUrl(secret, email, 'Automated Finance'), { type: 'svg', margin: 1, color: { dark: '#161513', light: '#ffffff' } });
}
