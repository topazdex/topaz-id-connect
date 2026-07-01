# @topazdex/id-connect

Add **Topaz ID** — a BNB Chain **smart-wallet** global account — to your dapp as a
one-click login. Users sign in with their existing Topaz ID account
([id.topazdex.com](https://id.topazdex.com)) — email, Google, or an external wallet —
and connect with their Topaz ID **smart contract wallet** (Kernel/ZeroDev). No seed
phrase, no extension, and **no Privy app of your own**.

Topaz ID is built on [Privy's global wallets](https://docs.privy.io/wallets/global-wallets/overview).
Your app is the *requester* and references Topaz ID's public app id — that's the
whole integration. You don't need a Privy account, and your domain does **not**
need to be allowlisted by Topaz ID.

## Demo

See it live: **[topaz-id-demo.vercel.app](https://topaz-id-demo.vercel.app)** — a
Next.js + RainbowKit app demonstrating connect, profile display, and signing.
Source: [topazdex/topaz-id-connect-demo](https://github.com/topazdex/topaz-id-connect-demo).

## Upgrading to 0.3.0

`0.3.0` makes Topaz ID **smart-account-first**: the connected account is now the
user's **smart contract wallet** (Kernel/ZeroDev) — their identity on
id.topazdex.com — instead of the embedded signer EOA. Most apps need no code change
(you already read `useAccount().address`), but note:

- **The address changes.** `useAccount().address` is now the smart wallet, so
  anything keyed on the old EOA (allowlists, prior balances) won't carry over.
- **Sends are gas-sponsored UserOperations**, and **signatures are ERC-1271/6492,
  not ECDSA** — see [Using the wallet](#using-the-wallet). Update SIWE/`ecrecover`
  backends to an ERC-1271-aware check.
- **Opt out:** pass `{ smartWalletMode: false }` to `topazIdConnector()`,
  `topazIdWallet()`, or `TopazIdProvider` to keep the **Legacy** signer-EOA mode —
  see [Smart vs Legacy wallets](#smart-vs-legacy-wallets).

`^0.2` consumers don't automatically cross the minor — you upgrade deliberately.

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

`TopazIdProvider` accepts `appId` (target a staging app), `smartWalletMode`
(defaults to `true`; pass `false` for the legacy signer-EOA), `transport` (custom
RPC), `queryClient` (bring your own), `ssr` (defaults to `true`, enabling wagmi
cookie storage), and `cookie` (the request cookie header, so a connected wallet
survives SSR without a flash). Draw the `"use client"` boundary in your app — the
library stays framework-agnostic.

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

For the smoothest smart-wallet UX, use the AGW-style Topaz ID client instead of
hand-rolling provider RPC calls. It exposes `sendTransaction`, `sendCalls`, and
`writeContract`, and hides Topaz smart-wallet details such as
`privy_sendSmartWalletTx`, native BNB value formatting, and approval+action
batching.

```tsx
import { useTopazIdClient } from "@topazdex/id-connect/react";
import { erc20Abi, parseEther, parseUnits } from "viem";

const { data: topazClient } = useTopazIdClient();

await topazClient?.sendTransaction({
  to,
  value: parseEther("0.01"),
});

await topazClient?.sendCalls({
  calls: [
    {
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [ROUTER_ADDRESS, parseUnits("100", 18)],
    },
    {
      to: ROUTER_ADDRESS,
      data: swapCalldata,
    },
  ],
});
```

Framework-agnostic apps can use the action client directly with any EIP-1193-ish
provider:

```ts
import { createTopazIdClient } from "@topazdex/id-connect/actions";

const topazClient = await createTopazIdClient({
  provider,
  account,
  chainId: 56,
});

await topazClient.sendCalls({ calls: [approvalCall, swapCall] });
```

Topaz ID still works with standard wagmi calls for simple sends, but the client
above is the recommended path for production dapps that need smart-wallet-safe
batching, native-value transactions, or aggregator calldata execution.

The connected account is a **smart contract wallet** (Kernel/ZeroDev on BNB Chain),
which differs from a plain EOA in two ways worth knowing:

- **Sends are UserOperations relayed through Topaz ID.** `sendTransaction` /
  `writeContract` are submitted via Topaz ID's bundler + paymaster — gas is
  sponsored by Topaz ID's paymaster policy (so the user typically needs no BNB for
  gas), and multiple calls (e.g. `approve` + swap) can batch into a single atomic
  action.
- **Signatures are ERC-1271 / ERC-6492, not ECDSA.** `personal_sign` and
  `eth_signTypedData_v4` (wagmi's `useSignMessage` / `useSignTypedData`) return a
  contract signature. If your backend verifies signatures (e.g. SIWE), use an
  ERC-1271/6492-aware check — `viem`'s `verifyMessage` / `verifyTypedData` with a
  BNB Chain public client — **not** `ecrecover`.

> Need the **Legacy** signer EOA instead of the **Smart** wallet? Pass
> `{ smartWalletMode: false }` to `topazIdConnector()`, `topazIdWallet()`, or
> `TopazIdProvider`. That address is signer-only — not where the user holds funds.
> See [Smart vs Legacy wallets](#smart-vs-legacy-wallets).

## Smart vs Legacy wallets

Topaz ID has two wallet modes, labelled here the same way as on id.topazdex.com:

- **Smart** — the user's smart contract wallet (Kernel/ZeroDev). The default, and
  the right choice for every new integration.
- **Legacy** — the underlying Privy **signer EOA**. Exposed only for backward
  compatibility with existing dapps whose users transacted with that EOA directly
  before the smart-wallet cutover.

**New integrations need to do nothing** — the connector defaults to Smart, and you
shouldn't surface Legacy at all. Only an existing dapp with users who hold funds on
the signer EOA should offer both. **When you show both modes or let the user switch,
label them "Smart" and "Legacy"** — the canonical strings, descriptions, and a
`TopazIdWalletMode` type are exported so your toggle matches ours:

```ts
import {
  TOPAZ_ID_WALLET_MODES,
  topazIdWalletMode,
  type TopazIdWalletMode,
} from "@topazdex/id-connect";

TOPAZ_ID_WALLET_MODES.smart;
// → { mode: "smart",  label: "Smart",  description: "Gas-free smart wallet (recommended)" }
TOPAZ_ID_WALLET_MODES.legacy;
// → { mode: "legacy", label: "Legacy", description: "Your original Privy signing wallet" }

// Map the connector flag to a mode (undefined/true → "smart", false → "legacy"):
topazIdWalletMode(false); // "legacy"
```

To offer both in a RainbowKit picker, add a second, **Legacy**-labelled connector
alongside the default:

```ts
import { topazIdWallet } from "@topazdex/id-connect/connectors";
import { TOPAZ_ID_NAME, TOPAZ_ID_LEGACY_WALLET_LABEL } from "@topazdex/id-connect";

const wallets = [
  topazIdWallet(), // Smart (default)
  topazIdWallet({
    smartWalletMode: false,
    name: `${TOPAZ_ID_NAME} (${TOPAZ_ID_LEGACY_WALLET_LABEL})`, // "Topaz ID (Legacy)"
  }),
];
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

To read the linked Topaz ID **smart wallet** address from the Privy user, use
`useTopazIdAccount` — it returns the smart wallet as `address` (the identity to
display and look up) and the embedded signer EOA separately:

```ts
import { useTopazIdAccount } from "@topazdex/id-connect/privy";

const { address, signerAddress } = useTopazIdAccount();
// address       → the user's Topaz ID smart contract wallet (their identity)
// signerAddress → the embedded EOA that signs for it (signer-only)
```

`address` is `undefined` until the user's smart wallet is provisioned and linked, so
guard on it with a loading state before rendering or transacting. If you display
both, label them **Smart** (`address`) and **Legacy** (`signerAddress`) — see
[Smart vs Legacy wallets](#smart-vs-legacy-wallets).

## Exports

| Entry | Contents |
| --- | --- |
| `@topazdex/id-connect` | `TOPAZ_ID_APP_ID`, `TOPAZ_ID_CONNECTOR_ID`, `TOPAZ_ID_NAME`, `TOPAZ_ID_ICON_URL`, `TOPAZ_ID_BASE_URL`, `TOPAZ_ID_SMART_WALLET_LABEL`, `TOPAZ_ID_LEGACY_WALLET_LABEL`, `TOPAZ_ID_WALLET_MODES`, `topazIdWalletMode`, `TopazIdWalletMode`, `TopazIdWalletModeInfo`, `fetchTopazIdProfile`, `displayNameForWallet`, `avatarForWallet`, `shortenAddress`, `TopazIdProfile` |
| `@topazdex/id-connect/connectors` | `topazIdWallet`, `topazIdConnector`, `TOPAZ_ID_CHAIN`, `TopazIdConnectorOptions` |
| `@topazdex/id-connect/rainbow-kit` | *Deprecated alias of `/connectors`* |
| `@topazdex/id-connect/react` | `TopazIdProvider`, `useTopazIdLogin`, `useTopazIdProfile` |
| `@topazdex/id-connect/privy` | `TopazIdPrivyProvider`, `useTopazIdCrossAppLogin`, `useTopazIdAccount`, `topazIdLoginMethod` |

## Peer dependencies

All peers are optional; install only what your entrypoints use.

| You use | Install |
| --- | --- |
| Profile helpers only (`@topazdex/id-connect`) | nothing extra |
| `TopazIdProvider` / `useTopazIdLogin` (`/react`) | `wagmi`, `viem`, `@tanstack/react-query`, `react`, `@privy-io/cross-app-connect` |
| Connectors (`/connectors`) | `@privy-io/cross-app-connect`, `viem`, `wagmi` (+ `@rainbow-me/rainbowkit` for `topazIdWallet`) |
| `useTopazIdProfile` only (`/react`) | `@tanstack/react-query`, `react` |
| Privy cross-app (`/privy`) | `@privy-io/react-auth`, `react` |

## Releasing

Publishing is automated: `.github/workflows/publish.yml` runs on a **published
GitHub Release** and `npm publish`es via OIDC trusted publishing (no token,
provenance included). It does **not** publish on a push to `main` or a bare tag
push — creating the Release is the trigger.

1. Land changes on `main` (green CI).
2. Bump `version` in `package.json` (semver).
3. Commit `Release vX.Y.Z` and push.
4. Create the Release — its tag (minus `v`) must equal `package.json#version`:
   ```bash
   gh release create vX.Y.Z --title vX.Y.Z --generate-notes
   ```
5. Watch the **Actions** tab, then confirm: `npm view @topazdex/id-connect version`.

See [`CLAUDE.md`](CLAUDE.md) for the full process and gotchas.

## License

MIT
