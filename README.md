# `@kinde/tsr`

Kinde Auth for [TanStack Start](https://tanstack.com/start).

This package introduces first-party support [Kinde auth](https://www.kinde.com/) in a TanStack Start app.

## Installation

```bash
npm install @kinde/tsr
```

This package expects a TanStack Start app with:

- `@tanstack/react-router` `^1.167.8`
- `@tanstack/react-start` `^1.167.8`

## Quick start

### 1. Add your environment variables

Create a `.env` file in your app:

```env
VITE_KINDE_CLIENT_ID=your_kinde_client_id
KINDE_CLIENT_SECRET=your_kinde_client_secret
VITE_KINDE_ISSUER_URL=https://your-subdomain.kinde.com
VITE_KINDE_SITE_URL=http://localhost:3000

# Optional but commonly used
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000/protected
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
```

`KINDE_CLIENT_SECRET` must stay server-only. Do not prefix it with `VITE_`.

### 2. Wrap your app with `KindeTanstackProvider`

Add the provider near the root of your app, usually in `src/routes/__root.tsx`:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { KindeTanstackProvider } from '@kinde/tsr'

export const Route = createRootRoute({
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <KindeTanstackProvider>{children}</KindeTanstackProvider>
        <Scripts />
      </body>
    </html>
  )
}
```

If you want to wait until the initial session sync has finished before rendering children, pass `waitForInitialLoad`.

### 3. Add the auth catch-all route

Create `src/routes/api.auth.$.tsx` if you are using the default auth path:

```tsx
import { kindeAuthHandler } from '@kinde/tsr/server'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => kindeAuthHandler(request),
      POST: async ({ request }) => kindeAuthHandler(request),
    },
  },
})
```

With the default configuration, this single route handles:

- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/callback`
- `/api/auth/register`
- `/api/auth/create-org`
- `/api/auth/health`

For organization-scoped login via the server route, append `?org_code=org_…` to `/api/auth/login`. That value is forwarded into the Kinde authorize request (same meaning as `login({ orgCode })` from `useKindeAuth` on the client).

If you change `KINDE_AUTH_API_PATH`, the file route path must match that custom path.

### 4. Use the client helpers

```tsx
import { LoginLink, LogoutLink, RegisterLink, useKindeAuth } from '@kinde/tsr'

export function AuthButtons() {
  const { isAuthenticated, isLoading, user } = useKindeAuth()

  if (isLoading) {
    return <div>Loading...</div>
  }

  return isAuthenticated ? (
    <div>
      <p>Welcome, {user?.givenName ?? 'friend'}.</p>
      <LogoutLink>Sign out</LogoutLink>
    </div>
  ) : (
    <div>
      <LoginLink>Sign in</LoginLink>
      <RegisterLink>Create account</RegisterLink>
    </div>
  )
}
```

### 5. Protect routes with `protect()`

For routes that only require an authenticated user:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { protect } from '@kinde/tsr/server'

export const Route = createFileRoute('/protected')({
  beforeLoad: async () => {
    await protect()
  },
})
```

For routes that need roles, permissions, feature flags, or billing entitlements:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { protect } from '@kinde/tsr/server'

export const Route = createFileRoute('/protected/admin')({
  beforeLoad: async () => {
    await protect({
      has: {
        roles: ['admin'],
        permissions: ['read:admin'],
        featureFlags: ['new-dashboard'],
        billingEntitlements: ['pro'],
        // optionally force a Kinde API check as opposed to checking tokens
        forceApi: true,
      },
      redirectTo: '/',
    })
  },
})
```

To protect multiple routes, we recommend using this utility inside a layout (optionally a pathless one):
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { protect } from '@kinde/tsr/server'

// Anything under the `_auth` pathless layout is now protected.
export const Route = createFileRoute('/_auth')({
  beforeLoad: async () => {
    await protect()
  },
})
```

`protect()` throws a TanStack redirect when the user is unauthenticated or does not satisfy the `has` checks. We do **not** recommend wrapping `protect()` in a `try/catch` block, unless you plan on re-throwing the redirect.

`redirectTo` defaults to `/`.

## Environment reference

The SDK reads required client-facing values from `VITE_*` variables and reads server-only values from regular environment variables.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_KINDE_CLIENT_ID` | Yes | - | Kinde application client ID used by the client SDK and auth handlers. |
| `KINDE_CLIENT_SECRET` | Yes | - | Kinde application client secret used during the auth code exchange and refresh flow. |
| `VITE_KINDE_ISSUER_URL` | Yes | - | Your Kinde domain, for example `https://your-subdomain.kinde.com`. |
| `VITE_KINDE_SITE_URL` | Yes | - | Base URL for your TanStack Start app. |
| `KINDE_DEBUG_MODE` | No | `false` | Enables detailed SDK logging and makes the health route return config details instead of plain `OK`. Useful for support. |
| `KINDE_POST_LOGIN_REDIRECT_URL` | No | `VITE_KINDE_SITE_URL` | Where to send users after a successful callback. |
| `KINDE_POST_LOGOUT_REDIRECT_URL` | No | `VITE_KINDE_SITE_URL` | Where to send users after logout. |
| `KINDE_AUTH_API_PATH` | No | `api/auth` | Base path for the catch-all auth route. |
| `KINDE_AUTH_LOGIN_ROUTE` | No | `login` | Login route segment. |
| `KINDE_AUTH_LOGOUT_ROUTE` | No | `logout` | Logout route segment. |
| `KINDE_AUTH_REGISTER_ROUTE` | No | `register` | Register route segment. |
| `KINDE_AUTH_CALLBACK_ROUTE` | No | `callback` | Callback route segment. |
| `KINDE_AUTH_HEALTH_ROUTE` | No | `health` | Health-check route segment. |
| `KINDE_AUTH_CREATE_ORG_ROUTE` | No | `create-org` | Create-organization route segment. |
| `KINDE_COOKIE_DOMAIN` | No | unset | Optional cookie domain for the server-side session cookies. |

## Client API

`@kinde/tsr` exports:

| Export | Description |
| --- | --- |
| `KindeTanstackProvider` | Wraps the Kinde React provider and syncs the server session into the client store. |
| `useKindeAuth` | Re-exported from `@kinde-oss/kinde-auth-react`. |
| `LoginLink` | TanStack Router `Link` pointed at the configured login route. |
| `LogoutLink` | TanStack Router `Link` pointed at the configured logout route. |
| `RegisterLink` | TanStack Router `Link` pointed at the configured register route. |
| `PortalLink` | Re-exported from `@kinde-oss/kinde-auth-react/components`. |

## Server API

`@kinde/tsr/server` exports:

| Export | Description |
| --- | --- |
| `kindeAuthHandler(request)` | Dispatches the catch-all auth request to the correct Kinde route handler. |
| `protect(options?)` | Guards TanStack routes from `beforeLoad`. |
| `@kinde/js-utils` re-exports | Token, user, org, permission, entitlement, and helper utilities from the core Kinde JS utilities package. |

### About the `@kinde-oss/kinde-auth-react` re-exports

This package intentionally re-exports the client utilities from `@kinde-oss/kinde-auth-react`, but the detailed API reference belongs there. Rather than duplicating that documentation here, use the `@kinde-oss/kinde-auth-react` docs for helper-by-helper guidance:

- [`@kinde-oss/kinde-auth-react` repository](https://github.com/kinde-oss/kinde-auth-react)
- [React SDK documentation](https://docs.kinde.com/developer-tools/sdks/frontend/react-sdk/)

### About the `@kinde/js-utils` re-exports

This package intentionally re-exports the server utilities from `@kinde/js-utils`, but the detailed API reference belongs there. Rather than duplicating that documentation here, use the `@kinde/js-utils` docs for helper-by-helper guidance:

- [`@kinde/js-utils` repository](https://github.com/kinde-oss/js-utils)

## Health route and debugging

The health route is available through your auth API path:

```text
/api/auth/health
```

Behavior:

- when `KINDE_DEBUG_MODE` is unset or false, it returns `OK`
- when `KINDE_DEBUG_MODE=true`, it returns JSON describing the resolved config and route URLs

This is useful for verifying your environment variables and generated auth URLs during setup.

## Kinde dashboard checklist

Make sure the following URLs are configured in Kinde for your environment:

- Allowed callback URLs: `http://localhost:3000/api/auth/callback`
- Allowed logout redirect URLs: `http://localhost:3000`

If you customize the auth path or route names, update these values to match.

## Resources

- [TanStack Start documentation](https://tanstack.com/start)
- [TanStack Router documentation](https://tanstack.com/router)
- [Kinde documentation](https://kinde.com/docs/)

## Support

- [GitHub issues](https://github.com/kinde-oss/kinde-tsr/issues)
- [Kinde support](https://kinde.com/support/)
