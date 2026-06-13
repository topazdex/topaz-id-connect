# @topazdex/id-connect

Add **Topaz ID** — a self-custodial BNB Chain global wallet — to your dapp as a
one-click login. Users sign in with their existing Topaz ID account
([id.topazdex.com](https://id.topazdex.com)); no seed phrase, no extension, and
**no Privy app of your own**.

Topaz ID is built on [Privy's global wallets](https://docs.privy.io/wallets/global-wallets/overview).
Your app is the *requester* and references Topaz ID's public app id — that's the
whole integration. You don't need a Privy account, and your domain does **not**
need to be allowlisted by Topaz ID.

## Demo

See it live: **[topaz-id-demo.vercel.app](https://topaz-id-demo.vercel.app)** — a
Next.js + RainbowKit app demonstrating connect, profile display, and signing.
Source: [topazdex/topaz-id-connect-demo](https://github.com/topazdex/topaz-id-connect-demo).

## Install

```bash
yarn add @topazdex/id-connect @privy-io/cross-app-connect wagmi viem \
  @tanstack/react-query
```

Add `@rainbow-me/rainbowkit` if you use the RainbowKit picker, or
`@privy-io/react-auth` if your app is itself a Privy app. All peer dependencies
are optional and only pulled in by the entrypoints that need them — see
[Peer dependencies](#peer-dependencies).

> `@privy-io/cross-app-connect` pins `viem@2.52.0`. Match it to avoid peer
> warnings.

## Quick start

The fastest path: wrap your app in `TopazIdProvider` (it sets up wagmi for BNB
Chain, the Topaz ID connector, and React Query for you), then connect with
`useTopazIdLogin`. No `createConfig`, no RainbowKit.

```tsx
// app/providers.tsx
"use client";
import { TopazIdProvider } from "@topazdex/id-connect/react";

export function Providers({
  children,
  cookie,
}: {
  children: React.ReactNode;
  cookie?: string | null;
}) {
  return <TopazIdProvider cookie={cookie}>{children}</TopazIdProvider>;
}
```

```tsx
// app/layout.tsx (Next.js App Router) — pass the cookie for clean SSR hydration
import { headers } from "next/headers";
import { Providers } from "./providers";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookie = (await headers()).get("cookie");
  return (
    <html lang="en">
      <body>
        <Providers cookie={cookie}>{children}</Providers>
      </body>
    </html>
  );
}
```

```tsx
// any client component
import { useTopazIdLogin } from "@topazdex/id-connect/react";
import { useAccount } from "wagmi";

export function SignIn() {
  const { login, logout } = useTopazIdLogin();
  const { address, isConnected } = useAccount();

  return isConnected ? (
    <button onClick={logout}>{address}</button>
  ) : (
    <button onClick={login}>Sign in with Topaz ID</button>
  );
}
```

`TopazIdProvider` accepts `appId` (target a staging app), `transport` (custom RPC),
`queryClient` (bring your own), `ssr` (defaults to `true`, enabling wagmi cookie
storage), and `cookie` (the request cookie header, so a connected wallet survives
SSR without a flash). Draw the `"use client"` boundary in your app — the library
stays framework-agnostic.

## RainbowKit

Prefer RainbowKit's wallet picker? Configure wagmi yourself and add the Topaz ID
wallet. Connector helpers live at `@topazdex/id-connect/connectors`.

```ts
import { topazIdWallet, TOPAZ_ID_CHAIN } from "@topazdex/id-connect/connectors";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";

const connectors = connectorsForWallets(
  [{ groupName: "Sign in", wallets: [topazIdWallet()] }],
  { appName: "Your App", projectId: "<walletconnect-project-id>" },
);

export const wagmiConfig = createConfig({
  chains: [TOPAZ_ID_CHAIN], // BNB Chain (56)
  transports: { [TOPAZ_ID_CHAIN.id]: http() },
  connectors,
  ssr: true,
});
```

`"Topaz ID"` now appears in the RainbowKit picker. Selecting it opens a Topaz ID
consent window where the user signs in — no new wallet is created.

> The `@topazdex/id-connect/rainbow-kit` subpath still works as a deprecated alias
> of `/connectors`, so existing imports keep compiling. New code should use
> `/connectors`.

## Plain wagmi (no RainbowKit)

```ts
import { topazIdConnector, TOPAZ_ID_CHAIN } from "@topazdex/id-connect/connectors";
import { createConfig, http } from "wagmi";

export const wagmiConfig = createConfig({
  chains: [TOPAZ_ID_CHAIN],
  transports: { [TOPAZ_ID_CHAIN.id]: http() },
  connectors: [topazIdConnector()],
  ssr: true,
});
```

## Using the wallet

Once connected, Topaz ID is a standard EIP-1193 wallet. Use plain wagmi — **never**
`@privy-io/react-auth` signing hooks (those are embedded-wallet-only and won't
route through Topaz ID).

```ts
import { useAccount, useSendTransaction } from "wagmi";
import { parseEther } from "viem";

const { address } = useAccount(); // the user's Topaz ID address

const { sendTransactionAsync } = useSendTransaction();
await sendTransactionAsync({ to, value: parseEther("0.01"), chainId: 56 });
// Topaz ID pops a consent window; the user approves every action.
```

## Show the user's Topaz ID profile

Topaz ID owns each wallet's name, handle, and avatar. Render real identity instead
of a bare address. Framework-agnostic helpers live at the root entry; a React Query
hook lives at `/react`.

```ts
import { displayNameForWallet, avatarForWallet } from "@topazdex/id-connect";
import { useTopazIdProfile } from "@topazdex/id-connect/react";

const { data: profile } = useTopazIdProfile(address);
const label = displayNameForWallet(profile ?? null, address);
const avatar = avatarForWallet(profile ?? null, "/default-avatar.png");
```

Reads are public and CORS-open. `found: false` → fall back to the address; never
block your UI on the fetch. `fetchTopazIdProfile` returns `null` on a network or
HTTP failure (aborts re-throw so React Query can tell a cancellation from an empty
result).

## Already using Privy?

If your app is itself a Privy app, skip the connector and add Topaz ID as a
cross-app login method. The `/privy` entry gives you the login-method constant, a
login/link hook, and a thin provider — all using your **own** Privy app id.

```tsx
import {
  TopazIdPrivyProvider,
  topazIdLoginMethod,
  useTopazIdCrossAppLogin,
} from "@topazdex/id-connect/privy";

// 1. Wrap your app. Topaz ID is prepended to your login methods.
<TopazIdPrivyProvider
  appId={MY_PRIVY_APP_ID}
  config={{ loginMethodsAndOrder: { primary: ["email", "wallet"] } }}
>
  <App />
</TopazIdPrivyProvider>;

// 2. Or wire it into a plain <PrivyProvider> yourself:
//    config={{ loginMethodsAndOrder: { primary: ["email", topazIdLoginMethod] } }}

// 3. Trigger the cross-app login from a button.
const { login } = useTopazIdCrossAppLogin();
<button onClick={login}>Continue with Topaz ID</button>;
```

To read the linked Topaz ID address from the Privy user:

```ts
import { TOPAZ_ID_APP_ID } from "@topazdex/id-connect";
import { usePrivy } from "@privy-io/react-auth";

const { user } = usePrivy();
const topaz = user?.linkedAccounts.find(
  (a) => a.type === "cross_app" && a.providerApp.id === TOPAZ_ID_APP_ID,
);
const address = topaz?.embeddedWallets[0]?.address;
```

## Exports

| Entry | Contents |
| --- | --- |
| `@topazdex/id-connect` | `TOPAZ_ID_APP_ID`, `TOPAZ_ID_CONNECTOR_ID`, `TOPAZ_ID_NAME`, `TOPAZ_ID_ICON_URL`, `TOPAZ_ID_BASE_URL`, `fetchTopazIdProfile`, `displayNameForWallet`, `avatarForWallet`, `shortenAddress`, `TopazIdProfile` |
| `@topazdex/id-connect/connectors` | `topazIdWallet`, `topazIdConnector`, `TOPAZ_ID_CHAIN`, `TopazIdConnectorOptions` |
| `@topazdex/id-connect/rainbow-kit` | *Deprecated alias of `/connectors`* |
| `@topazdex/id-connect/react` | `TopazIdProvider`, `useTopazIdLogin`, `useTopazIdProfile` |
| `@topazdex/id-connect/privy` | `TopazIdPrivyProvider`, `useTopazIdCrossAppLogin`, `topazIdLoginMethod` |

## Peer dependencies

All peers are optional; install only what your entrypoints use.

| You use | Install |
| --- | --- |
| Profile helpers only (`@topazdex/id-connect`) | nothing extra |
| `TopazIdProvider` / `useTopazIdLogin` (`/react`) | `wagmi`, `viem`, `@tanstack/react-query`, `react`, `@privy-io/cross-app-connect` |
| Connectors (`/connectors`) | `@privy-io/cross-app-connect`, `viem`, `wagmi` (+ `@rainbow-me/rainbowkit` for `topazIdWallet`) |
| `useTopazIdProfile` only (`/react`) | `@tanstack/react-query`, `react` |
| Privy cross-app (`/privy`) | `@privy-io/react-auth`, `react` |

## License

MIT
