import { StorageKeys } from '@kinde-oss/kinde-auth-react/utils';
import { createServerFn } from '@tanstack/react-start';
import { kindeLog } from '../../logger';
import { checkSession } from '../check-session';
import { getServerSession } from '../session';

type GetSessionResult = Promise<
  | { message: 'SESSION_TERMINATE' }
  | { message: 'SESSION_UNAVAILABLE' }
  | {
      message: 'SESSION_VALID';
      items: {
        [StorageKeys.accessToken]: string;
        [StorageKeys.idToken]: string;
      };
    }
>;

export const getSession = createServerFn().handler(async (): GetSessionResult => {
  const session = getServerSession();
  const checkSessionResult = await checkSession();
  kindeLog.info(`getSession: checkSessionResult is: `, checkSessionResult);

  if (checkSessionResult.message === 'VERIFICATION_UNAVAILABLE') {
    kindeLog.info(`getSession: SESSION_UNAVAILABLE`);
    return { message: 'SESSION_UNAVAILABLE' };
  }

  if (checkSessionResult.message !== 'CHECK_SUCCESS') {
    kindeLog.info(`getSession: SESSION_TERMINATE`);
    await session.destroySession();
    return { message: 'SESSION_TERMINATE' };
  }
  kindeLog.info(`getSession: SESSION_VALID`);
  await session.setItems({
    [StorageKeys.accessToken]: checkSessionResult.accessToken,
    [StorageKeys.idToken]: checkSessionResult.idToken,
    [StorageKeys.refreshToken]: checkSessionResult.refreshToken,
  });
  return {
    message: 'SESSION_VALID',
    items: {
      [StorageKeys.accessToken]: checkSessionResult.accessToken,
      [StorageKeys.idToken]: checkSessionResult.idToken,
    },
  };
});
