import { AppError } from './AppError';
export class FeatureDisabledError extends AppError {
  readonly statusCode = 403;
  readonly errorCode = 'FEATURE_DISABLED';
}
