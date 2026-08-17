import { KindeContext, KindeProvider } from "@kinde-oss/kinde-auth-react";
import type { KindeContextProps } from "@kinde-oss/kinde-auth-react";
import { storageSettings } from "@kinde-oss/kinde-auth-react/utils";
import { ClientOnly } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { KindeConfig } from "../../config";
import { useSessionSync } from "../hooks/internal/use-session-sync";
import { getClientSession } from "../store";

export type KindeTanstackProviderProps = {
  children: ReactNode;
  waitForInitialLoad?: boolean;
};

const notReady = (name: string) => async () => {
  throw new Error(
    `useKindeAuth: "${name}" was called before auth is ready — check isLoading before calling auth methods`,
  );
};

// Provided whenever KindeTanstackProvider is mounted but auth is not yet resolved
// (during SSR or client-side loading with waitForInitialLoad). Keeping this non-null
// means KindeContext is null *only* when no provider is present at all — so
// useKindeAuth can throw immediately without needing a typeof window check.
// Explicit stubs (not a Proxy) so the object has a real shape for `in`, spread,
// and Object.keys. Cast is required: the reject stubs cannot match every method
// signature on KindeContextProps.
const loadingContext = {
  isAuthenticated: false,
  isLoading: true,
  user: undefined,
  error: undefined,
  login: notReady("login"),
  register: notReady("register"),
  logout: notReady("logout"),
  getClaims: notReady("getClaims"),
  getIdToken: notReady("getIdToken"),
  getToken: notReady("getToken"),
  getAccessToken: notReady("getAccessToken"),
  getClaim: notReady("getClaim"),
  getOrganization: notReady("getOrganization"),
  getCurrentOrganization: notReady("getCurrentOrganization"),
  getFlag: notReady("getFlag"),
  getUserProfile: notReady("getUserProfile"),
  getPermission: notReady("getPermission"),
  getPermissions: notReady("getPermissions"),
  getUserOrganizations: notReady("getUserOrganizations"),
  getRoles: notReady("getRoles"),
  refreshToken: notReady("refreshToken"),
  generatePortalUrl: notReady("generatePortalUrl"),
  switchOrg: notReady("switchOrg"),
} as unknown as KindeContextProps;

// KindeContext is always non-null inside this provider (loading or not).
// null context means the component tree is outside KindeTanstackProvider entirely.
export const FallbackKindeContextProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  return (
    <KindeContext.Provider value={loadingContext}>{children}</KindeContext.Provider>
  );
};

export const KindeTanstackProvider = ({
  children,
  waitForInitialLoad,
}: KindeTanstackProviderProps) => {
  return (
    <ClientOnly
      fallback={
        <FallbackKindeContextProvider>{children}</FallbackKindeContextProvider>
      }
    >
      <KindeProviderClient waitForInitialLoad={waitForInitialLoad}>
        {children}
      </KindeProviderClient>
    </ClientOnly>
  );
};

const KindeProviderClient = ({
  children,
  waitForInitialLoad,
}: KindeTanstackProviderProps) => {
  const { loading, refreshHandler } = useSessionSync();

  useEffect(() => {
    storageSettings.onRefreshHandler = refreshHandler;
  }, [refreshHandler]);

  if (loading && waitForInitialLoad) {
    return (
      <FallbackKindeContextProvider>{children}</FallbackKindeContextProvider>
    );
  }

  return (
    <KindeProvider
      clientId={KindeConfig.env.KINDE_CLIENT_ID}
      domain={KindeConfig.env.KINDE_ISSUER_URL}
      redirectUri={KindeConfig.callbackUrl}
      store={getClientSession()}
      logoutUri={KindeConfig.logoutUrl}
      forceChildrenRender
    >
      {children}
    </KindeProvider>
  );
};
