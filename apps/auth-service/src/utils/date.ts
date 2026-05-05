import { config } from "../config.js";

export function getRefreshTokenExpiryDate(): Date {
  return new Date(Date.now() + config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);
}
