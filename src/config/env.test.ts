// getValidatedKindeEnv is server-only: it checks KINDE_CLIENT_SECRET only when
// window is undefined. This file runs in the node environment (the global default),
// which ensures that branch is exercised.
import { getValidatedKindeEnv } from "./env";

const REQUIRED = {
  KINDE_CLIENT_SECRET: "test_secret",
  KINDE_CLIENT_ID: "test_client_id",
  KINDE_ISSUER_URL: "https://test.kinde.com",
  KINDE_SITE_URL: "https://myapp.com",
};

describe("getValidatedKindeEnv", () => {
  beforeEach(() => {
    Object.entries(REQUIRED).forEach(([k, v]) => {
      process.env[k] = v;
    });
  });

  afterEach(() => {
    Object.keys(REQUIRED).forEach((k) => {
      delete process.env[k];
    });
  });

  it("returns env when all required vars are set", () => {
    const env = getValidatedKindeEnv();
    expect(env.KINDE_CLIENT_ID).toBe("test_client_id");
    expect(env.KINDE_CLIENT_SECRET).toBe("test_secret");
  });

  it("trims trailing slash from KINDE_ISSUER_URL", () => {
    process.env.KINDE_ISSUER_URL = "https://test.kinde.com/";
    const env = getValidatedKindeEnv();
    expect(env.KINDE_ISSUER_URL).toBe("https://test.kinde.com");
  });

  it("trims trailing slash from KINDE_SITE_URL", () => {
    process.env.KINDE_SITE_URL = "https://myapp.com/";
    const env = getValidatedKindeEnv();
    expect(env.KINDE_SITE_URL).toBe("https://myapp.com");
  });

  it("throws when KINDE_CLIENT_ID is missing", () => {
    delete process.env.KINDE_CLIENT_ID;
    expect(() => getValidatedKindeEnv()).toThrow("KINDE_CLIENT_ID");
  });

  it("throws when KINDE_ISSUER_URL is missing", () => {
    delete process.env.KINDE_ISSUER_URL;
    expect(() => getValidatedKindeEnv()).toThrow("KINDE_ISSUER_URL");
  });

  it("throws when KINDE_SITE_URL is missing", () => {
    delete process.env.KINDE_SITE_URL;
    expect(() => getValidatedKindeEnv()).toThrow("KINDE_SITE_URL");
  });

  it("throws when KINDE_CLIENT_SECRET is missing", () => {
    delete process.env.KINDE_CLIENT_SECRET;
    expect(() => getValidatedKindeEnv()).toThrow("KINDE_CLIENT_SECRET");
  });
});
