import { getRoles, getUserProfile, setActiveStorage, StorageKeys, storageSettings } from '@kinde/js-utils';
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

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const generateKeyPair = () =>
  crypto.subtle.generateKey({ ...RS256, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, [
    'sign',
    'verify',
  ]);

const kindeKeys = await generateKeyPair();
const attackerKeys = await generateKeyPair();

vi.stubGlobal(
  'fetch',
  vi.fn(async () =>
    Response.json({
      keys: [{ ...(await crypto.subtle.exportKey('jwk', kindeKeys.publicKey)), kid: 'kinde-key', use: 'sig' }],
    }),
  ),
);

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

type SignOptions = {
  key?: CryptoKey;
  claims?: Record<string, unknown>;
  expiresAt?: number;
};

const sign = async ({ key = kindeKeys.privateKey, claims = {}, expiresAt }: SignOptions = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: 'kinde-key' });
  const payload = encode({
    iss: ISSUER,
    aud: [CLIENT_ID],
    sub: 'kp_real_user',
    iat: now,
    exp: expiresAt ?? now + 3600,
    ...claims,
  });
  const signature = await crypto.subtle.sign(RS256, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
};

const setCookieToken = (itemKey: string, token: string) => {
  cookies[`${storageSettings.keyPrefix}${itemKey}0`] = token;
};

const unsignedToken = (claims: Record<string, unknown>) =>
  `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ iss: ISSUER, aud: [CLIENT_ID], ...claims })}.`;

describe('TanstackStore token verification', () => {
  const store = new TanstackStore();

  beforeEach(() => {
    for (const key of Object.keys(cookies)) delete cookies[key];
  });

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
    const payload = encode({ iss: ISSUER, sub: 'kp_victim', exp: 9999999999 });
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

  it('returns an expired but genuine access token so checkSession can refresh it', async () => {
    const token = await sign({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
    setCookieToken(StorageKeys.accessToken, token);
    expect(await store.getSessionItem(StorageKeys.accessToken)).toBe(token);
  });

  it('does not verify the opaque refresh token', async () => {
    setCookieToken(StorageKeys.refreshToken, 'opaque-refresh-token');
    expect(await store.getSessionItem(StorageKeys.refreshToken)).toBe('opaque-refresh-token');
  });

  it('keeps js-utils claim helpers from reading forged tokens', async () => {
    setActiveStorage(store);
    const forgedClaims = { sub: 'kp_victim', roles: [{ key: 'super-admin' }], exp: 9999999999 };
    setCookieToken(StorageKeys.accessToken, unsignedToken(forgedClaims));
    setCookieToken(StorageKeys.idToken, await sign({ key: attackerKeys.privateKey, claims: forgedClaims }));

    expect(await getUserProfile()).toBeNull();
    await expect(getRoles()).rejects.toThrow('Authentication token not found');
  });
});
