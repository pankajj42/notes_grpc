/**
 * Shape of the decoded RS256 access token payload.
 * Signed by auth-service, verified by the API gateway.
 *
 * Standard claims (sub, iss, aud, iat, exp) are handled by the JWT library.
 * Only application-level custom claims are defined here.
 */
export interface AccessTokenPayload {
  /** User UUID — maps to the standard JWT `sub` claim. */
  sub: string;
  /** Session UUID — identifies the specific login session that issued this token. */
  sid: string;
}
