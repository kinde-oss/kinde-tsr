import {
  getRoles,
  getUserProfile,
  isAuthenticated,
  refreshToken,
  setActiveStorage,
  StorageKeys,
  storageSettings,
} from '@kinde/js-utils';
import { checkSession } from './check-session';
import { TanstackStore } from './store';

const ISSUER = 'https://test.kinde.com';
const CLIENT_ID = 'test_client_id';

const cookies = vi.hoisted(() => {
  Object.assign(process.env, {
    KINDE_CLIENT_SECRET: 'test_secret',
    KINDE_CLIENT_ID: 'test_client_id',
    KINDE_ISSUER_URL: 'https://test.kinde.com',
    KINDE_SITE_URL: 'https://myapp.com',
  });
  return {} as Record<string, string>;
});

vi.mock('@tanstack/react-start/server', () => ({
  getCookies: () => cookies,
  getCookie: (key: string) => cookies[key],
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock('@kinde/js-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kinde/js-utils')>()),
  refreshToken: vi.fn(),
}));

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const generateKeyPair = () =>
  crypto.subtle.generateKey({ ...RS256, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, [
    'sign',
    'verify',
  ]);

const kindeKeys = await generateKeyPair();
const attackerKeys = await generateKeyPair();

const fetchJwks = async () =>
  Response.json({
    keys: [{ ...(await crypto.subtle.exportKey('jwk', kindeKeys.publicKey)), kid: 'kinde-key', alg: 'RS256' }],
  });
const fetchMock = vi.fn(fetchJwks);
vi.stubGlobal('fetch', fetchMock);

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);

type SignOptions = {
  key?: CryptoKey;
  kid?: string;
  claims?: Record<string, unknown>;
};

const sign = async ({ key = kindeKeys.privateKey, kid = 'kinde-key', claims = {} }: SignOptions = {}) => {
  const header = encode({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encode({
    iss: ISSUER,
    aud: [CLIENT_ID],
    azp: CLIENT_ID,
    sub: 'kp_real_user',
    iat: nowSeconds(),
    exp: nowSeconds() + 3600,
    ...claims,
  });
  const signature = await crypto.subtle.sign(RS256, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
};

const setCookieToken = (itemKey: string, token: string) => {
  cookies[`${storageSettings.keyPrefix}${itemKey}0`] = token;
};

const unsignedToken = (claims: Record<string, unknown>) =>
  `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ iss: ISSUER, aud: [CLIENT_ID], azp: CLIENT_ID, ...claims })}.`;

// Only Date is faked, so each test can move past jose's 10 minute key cache and start cold.
vi.useFakeTimers({ toFake: ['Date'] });

beforeEach(() => {
  for (const key of Object.keys(cookies)) delete cookies[key];
  vi.setSystemTime(Date.now() + 11 * 60 * 1000);
  fetchMock.mockReset();
  fetchMock.mockImplementation(fetchJwks);
  vi.mocked(refreshToken).mockReset();
});

describe('TanstackStore token verification', () => {
  const store = new TanstackStore();

  it('returns an access token signed by the issuer', async () => {
    const token = await sign();
    setCookieToken(StorageKeys.accessToken, token);
    expect(await store.getSessionItem(StorageKeys.accessToken)).toBe(token);
  });

  it('returns an ID token signed by the issuer for this client', async () => {
    const token = await sign();
    setCookieToken(StorageKeys.idToken, token);
    expect(await store.getSessionItem(StorageKeys.idToken)).toBe(token);
  });

  it('rejects a token signed with a different key', async () => {
    setCookieToken(StorageKeys.accessToken, await sign({ key: attackerKeys.privateKey, claims: { roles: ['admin'] } }));
    expect(await store.getSessionItem(StorageKeys.accessToken)).toBeNull();
  });

  it('rejects an unsigned token', async () => {
    setCookieToken(StorageKeys.accessToken, unsignedToken({ sub: 'kp_victim', exp: 9999999999 }));
    expect(await store.getSessionItem(StorageKeys.accessToken)).toBeNull();
  });

  it('rejects a genuine token whose payload was edited', async () => {
    const [header, , signature] = (await sign()).split('.');
    const payload = encode({ iss: ISSUER, azp: CLIENT_ID, sub: 'kp_victim', exp: 9999999999 });
    setCookieToken(StorageKeys.accessToken, `${header}.${payload}.${signature}`);
    expect(await store.getSessionItem(StorageKeys.accessToken)).toBeNull();
  });

  it('rejects a token from a different issuer', async () => {
    setCookieToken(StorageKeys.accessToken, await sign({ claims: { iss: 'https://evil.kinde.com' } }));
    expect(await store.getSessionItem(StorageKeys.accessToken)).toBeNull();
  });

  it('rejects an ID token issued for a different client', async () => {
    setCookieToken(StorageKeys.idToken, await sign({ claims: { aud: ['other_client'] } }));
    expect(await store.getSessionItem(StorageKeys.idToken)).toBeNull();
  });

  it('rejects an access token issued to a different client', async () => {
    setCookieToken(StorageKeys.accessToken, await sign({ claims: { aud: [], azp: 'other_client' } }));
    expect(await store.getSessionItem(StorageKeys.accessToken)).toBeNull();
  });

  it('rejects an expired but genuine token', async () => {
    setCookieToken(StorageKeys.accessToken, await sign({ claims: { exp: nowSeconds() - 60 } }));
    expect(await store.getSessionItem(StorageKeys.accessToken)).toBeNull();
  });

  it('does not verify the opaque refresh token', async () => {
    setCookieToken(StorageKeys.refreshToken, 'opaque-refresh-token');
    expect(await store.getSessionItem(StorageKeys.refreshToken)).toBe('opaque-refresh-token');
  });

  it('does not fetch the JWKS for a forged token with a known kid', async () => {
    setCookieToken(StorageKeys.accessToken, await sign());
    await store.getSessionItem(StorageKeys.accessToken);
    fetchMock.mockClear();

    setCookieToken(StorageKeys.accessToken, await sign({ key: attackerKeys.privateKey }));
    for (let i = 0; i < 10; i++) await store.getSessionItem(StorageKeys.accessToken);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refetches the JWKS for an unknown kid at most once per cooldown', async () => {
    setCookieToken(StorageKeys.accessToken, await sign());
    await store.getSessionItem(StorageKeys.accessToken);
    fetchMock.mockClear();
    vi.setSystemTime(Date.now() + 31 * 1000);

    setCookieToken(StorageKeys.accessToken, await sign({ kid: 'unknown-key' }));
    for (let i = 0; i < 10; i++) await store.getSessionItem(StorageKeys.accessToken);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads a token as missing when the JWKS cannot be fetched, so helpers fail closed', async () => {
    setActiveStorage(store);
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    setCookieToken(StorageKeys.accessToken, await sign({ key: attackerKeys.privateKey }));

    expect(await store.getSessionItem(StorageKeys.accessToken)).toBeNull();
    expect(await isAuthenticated()).toBe(false);
  });

  it('keeps js-utils claim helpers from reading forged or expired tokens', async () => {
    setActiveStorage(store);
    const forgedClaims = { sub: 'kp_victim', roles: [{ key: 'super-admin' }], exp: 9999999999 };
    setCookieToken(StorageKeys.accessToken, unsignedToken(forgedClaims));
    setCookieToken(StorageKeys.idToken, await sign({ key: attackerKeys.privateKey, claims: forgedClaims }));

    expect(await getUserProfile()).toBeNull();
    await expect(getRoles()).rejects.toThrow('Authentication token not found');

    setCookieToken(
      StorageKeys.accessToken,
      await sign({ claims: { roles: [{ key: 'admin' }], exp: nowSeconds() - 60 } }),
    );
    await expect(getRoles()).rejects.toThrow('Authentication token not found');
  });
});

describe('checkSession', () => {
  const setSession = (accessToken: string, idToken: string) => {
    setCookieToken(StorageKeys.accessToken, accessToken);
    setCookieToken(StorageKeys.idToken, idToken);
    setCookieToken(StorageKeys.refreshToken, 'refresh-token');
  };

  it('returns the session tokens when both are valid', async () => {
    const [accessToken, idToken] = await Promise.all([sign(), sign()]);
    setSession(accessToken, idToken);

    expect(await checkSession()).toEqual({
      message: 'CHECK_SUCCESS',
      accessToken,
      idToken,
      refreshToken: 'refresh-token',
    });
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('keeps the session when the JWKS cannot be fetched', async () => {
    setSession(await sign(), await sign());
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect(await checkSession()).toEqual({ message: 'VERIFICATION_UNAVAILABLE' });
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('refreshes when only the ID token has expired', async () => {
    setSession(await sign(), await sign({ claims: { exp: nowSeconds() - 60 } }));
    vi.mocked(refreshToken).mockResolvedValue({
      success: true,
      accessToken: 'new-access',
      idToken: 'new-id',
      refreshToken: 'new-refresh',
    });

    expect(await checkSession()).toEqual({
      message: 'CHECK_SUCCESS',
      accessToken: 'new-access',
      idToken: 'new-id',
      refreshToken: 'new-refresh',
    });
  });

  it('fails when a forged token cannot be refreshed', async () => {
    setSession(await sign({ key: attackerKeys.privateKey }), await sign());
    vi.mocked(refreshToken).mockResolvedValue({ success: false, error: 'invalid_grant' });

    expect(await checkSession()).toEqual({ message: 'REFRESH_FAILED' });
  });

  it('is unauthenticated without a refresh token', async () => {
    setCookieToken(StorageKeys.accessToken, await sign());
    setCookieToken(StorageKeys.idToken, await sign());

    expect(await checkSession()).toEqual({ message: 'UNAUTHENTICATED' });
  });
});
