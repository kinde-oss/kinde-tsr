import { generateAuthUrl, IssuerRouteTypes, Scopes } from '@kinde/js-utils';
import { redirect } from '@tanstack/react-router';
import { KindeConfig } from '../../config';
import { kindeLog } from '../../logger';
import type { KindeRouteHandler } from '../../server/types';

export const loginHandler: KindeRouteHandler = async (request) => {
  kindeLog.info('loginHandler: firing');
  const orgCode = new URL(request.url).searchParams.get('org_code');
  const authUrl = await generateAuthUrl(KindeConfig.env.KINDE_ISSUER_URL, IssuerRouteTypes.login, {
    clientId: KindeConfig.env.KINDE_CLIENT_ID,
    redirectURL: KindeConfig.callbackUrl,
    responseType: 'code',
    scope: [Scopes.openid, Scopes.profile, Scopes.email, Scopes.offline_access],
    orgCode: orgCode || undefined,
  });
  throw redirect({
    href: authUrl.url.toString(),
  });
};
