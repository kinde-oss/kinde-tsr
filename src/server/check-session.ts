import { RefreshType, refreshToken, StorageKeys } from '@kinde/js-utils';
import { KindeConfig } from '../config';
import { kindeLog } from '../logger';
import { getServerSession } from './session';
import { type SessionToken, type TokenStatus, verifyToken } from './store';

type CheckSessionResult = Promise<
  | {
      message: 'REFRESH_FAILED';
    }
  | {
      message: 'UNAUTHENTICATED';
    }
  | {
      message: 'VERIFICATION_UNAVAILABLE';
    }
  | {
      message: 'CHECK_SUCCESS';
      idToken: string;
      accessToken: string;
      refreshToken: string;
    }
>;

const verifyIfPresent = (token: string | null, type: SessionToken): Promise<TokenStatus | 'missing'> =>
  token ? verifyToken(token, type) : Promise.resolve('missing');

export const checkSession = async (): CheckSessionResult => {
  const session = getServerSession();
  const [sessionAccessToken, sessionIdToken, sessionRefreshToken] = await Promise.all([
    session.getUnverifiedSessionItem(StorageKeys.accessToken),
    session.getUnverifiedSessionItem(StorageKeys.idToken),
    session.getUnverifiedSessionItem(StorageKeys.refreshToken),
  ]);
  const statuses = await Promise.all([
    verifyIfPresent(sessionAccessToken, StorageKeys.accessToken),
    verifyIfPresent(sessionIdToken, StorageKeys.idToken),
  ]);

  // The tokens couldn't be judged, which isn't the same as them being bad. Keep the session
  // so the next request can try again.
  if (statuses.includes('unavailable')) {
    kindeLog.error('checkSession: could not verify session tokens, keeping the session');
    return {
      message: 'VERIFICATION_UNAVAILABLE',
    };
  }

  if (!sessionRefreshToken) {
    kindeLog.info('checkSession: no refresh token found, user is unauthenticated');
    return {
      message: 'UNAUTHENTICATED',
    };
  }

  if (statuses.every((status) => status === 'valid')) {
    return {
      message: 'CHECK_SUCCESS',
      idToken: sessionIdToken as string,
      accessToken: sessionAccessToken as string,
      refreshToken: sessionRefreshToken,
    };
  }

  // A missing, expired or invalid token is replaced using the refresh token, which Kinde validates.
  kindeLog.info(
    `checkSession: session tokens are ${statuses.join(', ')}, calling refreshToken with domain ${KindeConfig.env.KINDE_ISSUER_URL} and clientId ${KindeConfig.env.KINDE_CLIENT_ID}`,
  );
  const refreshResult = await refreshToken({
    domain: KindeConfig.env.KINDE_ISSUER_URL,
    clientId: KindeConfig.env.KINDE_CLIENT_ID,
    refreshType: RefreshType.refreshToken,
    clientSecret: KindeConfig.env.KINDE_CLIENT_SECRET,
  });

  if (!refreshResult.success) {
    kindeLog.error(`checkSession: refresh token failed with error ${refreshResult.error}`);
    return {
      message: 'REFRESH_FAILED',
    };
  }

  return {
    message: 'CHECK_SUCCESS',
    idToken: refreshResult.idToken!,
    accessToken: refreshResult.accessToken!,
    refreshToken: refreshResult.refreshToken!,
  };
};
