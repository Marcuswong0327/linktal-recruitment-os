/**
 * Maps the API's error `code` to a user-facing reason. Shared by the
 * server-rendered /sign-in page (errors surfaced via a query param — see
 * SessionErrorHandler for why) and the inline email/password form (errors
 * surfaced directly from signIn()'s return value).
 */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_INACTIVE: 'Your account has been deactivated. Contact your administrator for access.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  EMAIL_TAKEN: 'An account with this email already exists — try signing in instead.',
};

export const DEFAULT_AUTH_ERROR_MESSAGE = 'Something went wrong. Please try again.';
