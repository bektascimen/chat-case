import { AppError } from './AppError';
export type ValidationIssue = { path: string; message: string };
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly errorCode = 'VALIDATION_ERROR';
  constructor(message: string, public readonly issues: ValidationIssue[] = []) {
    super(message);
  }
}
