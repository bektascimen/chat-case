import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '@/errors/UnauthorizedError';
import type { IAuthVerifier, AuthenticatedUser } from './IAuthVerifier';

export class JwtAuthVerifier implements IAuthVerifier {
  constructor(private readonly secret: string) {}

  async verify(header: string | undefined): Promise<AuthenticatedUser> {
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, this.secret) as { sub?: string; email?: string };
      if (!payload.sub || !payload.email) throw new UnauthorizedError('Token missing required claims');
      return { id: payload.sub, email: payload.email };
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}
