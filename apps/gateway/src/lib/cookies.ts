import type { CookieOptions, Response } from "express";
import { config } from "../config.js";

export const REFRESH_COOKIE_NAME = "refreshToken";

function cookieBase(): CookieOptions {
  const options: CookieOptions = {
    path: "/auth",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
  };

  if (typeof config.cookieDomain === "string" && config.cookieDomain.trim() !== "") {
    options.domain = config.cookieDomain;
  }

  return options;
}

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieBase(),
    maxAge: config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieBase());
}
