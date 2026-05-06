export interface IAppCheckVerifier {
  verify(token: string | undefined): Promise<void>;
}
