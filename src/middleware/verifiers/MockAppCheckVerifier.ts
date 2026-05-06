import { ForbiddenError } from '@/errors/ForbiddenError';
import type { IAppCheckVerifier } from './IAppCheckVerifier';

export class MockAppCheckVerifier implements IAppCheckVerifier {
  constructor(private readonly expectedToken: string) {}

  async verify(token: string | undefined): Promise<void> {
    if (!token) throw new ForbiddenError('Missing X-Firebase-AppCheck header');
    if (token !== this.expectedToken) throw new ForbiddenError('Invalid app check token');
  }
}
