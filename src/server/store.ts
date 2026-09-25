import { SessionBase, type SessionManager, StorageKeys, splitString, storageSettings } from '@kinde/js-utils';
import { deleteCookie, getCookie, getCookies, setCookie } from '@tanstack/react-start/server';
import { jwtDecoder } from '@kinde/jwt-decoder';
import { validateToken } from '@kinde/jwt-validator';
import { KindeConfig } from '../config';
import { kindeLog } from '../logger';

const TWENTY_NINE_DAYS = 2505600;

// Checks the token was signed by the issuer's keys and issued for this app. Expiry is
// left to checkSession so an expired session can still be refreshed.
const isTrustedToken = async (token: string, isIdToken: boolean): Promise<boolean> => {
  try {
    const result = await validateToken({ token, domain: KindeConfig.env.KINDE_ISSUER_URL });
    if (!result.valid) {
      kindeLog.warn(`isTrustedToken: token failed verification: ${result.message}`);
      return false;
    }

    // Safe to decode now that the signature over the payload has been verified.
    const claims = jwtDecoder(token);
    if (claims?.iss !== KindeConfig.env.KINDE_ISSUER_URL) {
      return false;
    }

    return !isIdToken || [claims.aud].flat().includes(KindeConfig.env.KINDE_CLIENT_ID);
  } catch (error) {
    kindeLog.warn('isTrustedToken: token failed verification', error);
    return false;
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

  async getSessionItem(itemKey: V | StorageKeys): Promise<unknown | null> {
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

    // Cookies are client-controlled, so tokens are only trusted once their signature
    // is verified. Every claim helper in @kinde/js-utils reads tokens through here.
    if (itemKey === StorageKeys.accessToken || itemKey === StorageKeys.idToken) {
      return (await isTrustedToken(itemValue, itemKey === StorageKeys.idToken)) ? itemValue : null;
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
