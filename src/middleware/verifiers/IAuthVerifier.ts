export type AuthenticatedUser = { id: string; email: string };
export interface IAuthVerifier {
  verify(authorizationHeader: string | undefined): Promise<AuthenticatedUser>;
}
