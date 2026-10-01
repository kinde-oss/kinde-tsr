import { SessionBase, type SessionManager, StorageKeys, splitString, storageSettings } from '@kinde/js-utils';
import { deleteCookie, getCookie, getCookies, setCookie } from '@tanstack/react-start/server';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { KindeConfig } from '../config';
import { kindeLog } from '../logger';

const TWENTY_NINE_DAYS = 2505600;
// Treat tokens as expired slightly early so they don't lapse mid-request.
const EXPIRY_THRESHOLD_MS = 2000;

export type SessionToken = StorageKeys.accessToken | StorageKeys.idToken;
export type TokenStatus = 'valid' | 'expired' | 'invalid' | 'unavailable';

// jose errors that mean the token itself is bad. Any other error (a timeout, a network
// failure, a non-200 JWKS response) means the keys couldn't be fetched to judge the token.
const TOKEN_ERROR_CODES = new Set([
  'ERR_JWS_INVALID',
  'ERR_JWT_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
]);

// jose caches the keys and refetches them for an unknown kid at most every 30 seconds,
// so a forged token doesn't cause a request to Kinde.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export const verifyToken = async (token: string, type: SessionToken): Promise<TokenStatus> => {
  jwks ??= createRemoteJWKSet(new URL(`${KindeConfig.env.KINDE_ISSUER_URL}/.well-known/jwks`));
  const isIdToken = type === StorageKeys.idToken;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['RS256'],
      issuer: KindeConfig.env.KINDE_ISSUER_URL,
      audience: isIdToken ? KindeConfig.env.KINDE_CLIENT_ID : undefined,
      currentDate: new Date(Date.now() + EXPIRY_THRESHOLD_MS),
    });
    // Login sends no audience, so the access token names this app in azp rather than aud.
    return isIdToken || payload.azp === KindeConfig.env.KINDE_CLIENT_ID ? 'valid' : 'invalid';
  } catch (error) {
    // jose checks expiry only after the signature, issuer and audience have passed.
    if (error instanceof errors.JWTExpired) {
      return 'expired';
    }
    if (error instanceof errors.JOSEError && TOKEN_ERROR_CODES.has(error.code)) {
      kindeLog.warn(`verifyToken: ${type} failed verification: ${error.message}`);
      return 'invalid';
    }
    kindeLog.error(`verifyToken: could not fetch the JWKS to verify the ${type}`, error);
    return 'unavailable';
  }
};

export class TanstackStore<V extends string = StorageKeys> extends SessionBase<V> implements SessionManager<V> {
  asyncStore = true;
  async destroySession(): Promise<void> {
    const cookies = getCookies();
    for (const key in cookies) {
      if (key.startsWith(`${storageSettings.keyPrefix}`)) {
        deleteCookie(key);
      }
    }
  }

  async setSessionItem(itemKey: V | StorageKeys, itemValue: unknown): Promise<void> {
    await this.removeSessionItem(itemKey);
    if (typeof itemValue === 'string') {
      splitString(itemValue, storageSettings.maxLength).forEach((splitValue, index) => {
        setCookie(`${storageSettings.keyPrefix}${itemKey}${index}`, splitValue, {
          maxAge: TWENTY_NINE_DAYS,
          domain: KindeConfig.cookieDomain,
          sameSite: 'lax',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          path: '/',
        });
      });
    }

    return;
  }

  // Reads the cookie as stored, without verifying tokens. Only checkSession, which
  // verifies them itself, should use this.
  async getUnverifiedSessionItem(itemKey: V | StorageKeys): Promise<string | null> {
    const cookies = getCookies();
    if (!cookies[`${storageSettings.keyPrefix}${itemKey}0`]) {
      return null;
    }

    let itemValue = '';
    let index = 0;
    let key = `${storageSettings.keyPrefix}${itemKey}${index}`;
    while (cookies[key]) {
      itemValue += getCookie(key);
      index++;
      key = `${storageSettings.keyPrefix}${itemKey}${index}`;
    }

    return itemValue;
  }

  async getSessionItem(itemKey: V | StorageKeys): Promise<unknown | null> {
    const itemValue = await this.getUnverifiedSessionItem(itemKey);

    // Cookies are client-controlled, and every claim helper in @kinde/js-utils reads tokens
    // through here. So a token that isn't valid right now reads as missing: forged, expired,
    // or unverifiable because the JWKS is unreachable.
    if (itemValue && (itemKey === StorageKeys.accessToken || itemKey === StorageKeys.idToken)) {
      return (await verifyToken(itemValue, itemKey as SessionToken)) === 'valid' ? itemValue : null;
    }

    return itemValue;
  }

  async removeSessionItem(itemKey: V | StorageKeys): Promise<void> {
    const cookies = getCookies();
    for (const key in cookies) {
      if (key.startsWith(`${storageSettings.keyPrefix}${itemKey}`)) {
        deleteCookie(key);
      }
    }
  }
}
