import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/app-config.service';
import type { Session } from './auth.service';

export const REFRESH_COOKIE = 'sb_rt';

export function refreshCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE'),
    sameSite: config.get('COOKIE_SAMESITE'),
    domain: config.get('COOKIE_DOMAIN'),
    path: '/api/v1/auth',
  };
}

/** Deja el refresh token en cookie httpOnly y devuelve solo lo que necesita el front. */
export function sendSession(session: Session, res: Response, config: AppConfig) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...refreshCookieOptions(config),
    expires: session.refreshExpiresAt,
  });
  return { accessToken: session.accessToken, user: session.user };
}
