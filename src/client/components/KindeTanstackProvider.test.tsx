// @vitest-environment jsdom
import { KindeContext } from "@kinde-oss/kinde-auth-react";
import { renderHook } from "@testing-library/react";
import { useContext } from "react";
// FallbackKindeContextProvider imports KindeConfig which validates env vars at module
// load time — mock it so tests don't require a real .env setup.
vi.mock("../../config", () => ({
  KindeConfig: {
    env: { KINDE_CLIENT_ID: "test_id", KINDE_ISSUER_URL: "https://test.kinde.com" },
    callbackUrl: "https://localhost:3000/api/auth/callback",
    logoutUrl: "https://localhost:3000/api/auth/logout",
    loginUrl: "https://localhost:3000/api/auth/login",
    registerUrl: "https://localhost:3000/api/auth/register",
  },
}));

import { FallbackKindeContextProvider } from "./KindeTanstackProvider";

const useKindeContext = () => useContext(KindeContext);

describe("FallbackKindeContextProvider", () => {
  describe("state fields", () => {
    it("provides isLoading: true", () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      expect(result.current?.isLoading).toBe(true);
    });

    it("provides isAuthenticated: false", () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      expect(result.current?.isAuthenticated).toBe(false);
    });

    it("provides user: undefined", () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      expect(result.current?.user).toBeUndefined();
    });

    it("provides error: undefined", () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      expect(result.current?.error).toBeUndefined();
    });
  });

  describe("method stubs", () => {
    it("exposes methods as own properties", () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      expect(result.current && "getToken" in result.current).toBe(true);
    });

    it("returns a rejected Promise — not a synchronous throw", async () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      const call = result.current?.getToken();
      expect(call).toBeInstanceOf(Promise);
      await expect(call).rejects.toThrow(
        'useKindeAuth: "getToken" was called before auth is ready — check isLoading before calling auth methods'
      );
    });

    it("includes the method name in the rejection message", async () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      await expect(result.current?.getClaim("sub")).rejects.toThrow('"getClaim"');
    });
  });

  describe("thenable guard", () => {
    it("then is undefined — context value is not a thenable", () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      expect((result.current as unknown as Record<string, unknown>).then).toBeUndefined();
    });

    it("catch is undefined", () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      expect((result.current as unknown as Record<string, unknown>).catch).toBeUndefined();
    });

    it("finally is undefined", () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      expect((result.current as unknown as Record<string, unknown>).finally).toBeUndefined();
    });

    it("Promise.resolve does not unwrap the context value", async () => {
      const { result } = renderHook(useKindeContext, { wrapper: FallbackKindeContextProvider });
      const resolved = await Promise.resolve(result.current as unknown);
      expect(resolved).toBe(result.current);
    });
  });
});
