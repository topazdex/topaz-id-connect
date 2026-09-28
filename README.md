# @topazdex/id-connect

Add **Topaz ID** — a smart-wallet global account — to your dapp as a one-click
login on **BNB Chain, Robinhood Chain, Base, Ethereum, and Arc**. Users sign in
with their existing Topaz ID account ([id.topazdex.com](https://id.topazdex.com))
— email, Google, or an external wallet — and connect with their Topaz ID **smart
contract wallet** (Kernel/ZeroDev). No seed phrase, no extension, **no Privy app
of your own**, and the same wallet address on every chain.

Topaz ID is built on [Privy's global wallets](https://docs.privy.io/wallets/global-wallets/overview).
Your app is the *requester* and references Topaz ID's public app id — that's the
whole integration. You don't need a Privy account, and your domain does **not**
need to be allowlisted by Topaz ID.

## Chains

| Chain | Id | Gas | Import from `@topazdex/id-connect/chains` |
| --- | --- | --- | --- |
| BNB Chain | 56 | **Sponsored by Topaz ID** | `bsc` |
| Robinhood Chain | 4663 | Paid by the wallet in ETH | `robinhood` |
| Base | 8453 | Paid by the wallet in ETH | `base` |
| Ethereum | 1 | Paid by the wallet in ETH | `mainnet` |
| Arc | 5042 | Paid by the wallet in USDC (18-decimal native) | `arc` |

`TOPAZ_ID_CHAINS` is all five (BNB Chain first). Use any subset — one chain or
several. **The first chain you list is the one Topaz ID connects on**; the user
can switch to any other chain you listed. The wallet is the same address on
every chain, so profiles, allowlists, and balances key on one identity.

On BNB Chain the user needs funds only for the `value` they send. On the other
four chains the smart wallet pays its own gas, so it must hold that chain's
native currency before it can transact — see [Gas and funding](#gas-and-funding).

## Demo

See it live: **[topaz-id-demo.vercel.app](https://topaz-id-demo.vercel.app)** — a
Next.js + RainbowKit app demonstrating connect, profile display, smart-wallet
sends, and a batched approve + swap.
Source: [topazdex/topaz-id-connect-demo](https://github.com/topazdex/topaz-id-connect-demo).

## Install

```bash
yarn add @topazdex/id-connect @privy-io/cross-app-connect viem
```

Add `wagmi` + `@tanstack/react-query` for the React/wagmi entries,
`@rainbow-me/rainbowkit` for the RainbowKit picker, or `@privy-io/react-auth` if
your app is itself a Privy app. All peer dependencies are optional and only pulled
in by the entrypoints that need them — see [Peer dependencies](#peer-dependencies).

Works with wagmi 2 or 3 and `@privy-io/cross-app-connect` 0.5 through 0.7. Two
install-time notes:

- `@privy-io/cross-app-connect` pins an **exact** `viem` version (`2.56.0` for
  0.7.0). A newer patch of viem only produces a peer warning and works; pin
  `viem` to the requested version if you want a clean install.
- **Yarn 4.17+** refuses any version published in the last 24 hours
  (`npmMinimalAgeGate`), so right after a release `yarn add` reports the version
  as "quarantined" and keeps the previous one. Wait a day, or add
  `@topazdex/id-connect` to `npmPreapprovedPackages` in `.yarnrc.yml`.
- RainbowKit 2.x supports wagmi 2 only; the RainbowKit path needs `wagmi@2`.

## Pick an integration path

| Your app | Use | Section |
| --- | --- | --- |
| React, no wagmi config yet | `TopazIdProvider` + `useTopazIdLogin` | [Quick start](#quick-start-react) |
| React with RainbowKit | `topazIdWallet()` in your wallet list | [RainbowKit](#rainbowkit) |
| React with your own wagmi config | `topazIdConnector()` | [Plain wagmi](#plain-wagmi-no-rainbowkit) |
| Anything else (Vue, Svelte, vanilla, viem only) | `createTopazIdProvider()` + `createTopazIdClient()` | [Without wagmi](#without-wagmi-any-framework) |
| Already a Privy app | `/privy` cross-app login | [Already using Privy?](#already-using-privy) |

Every path ends with the same [action client](#sending-transactions) for sends.

## Quick start (React)

Wrap your app in `TopazIdProvider` (it sets up wagmi for your chains, the Topaz
ID connector, and React Query), then connect with `useTopazIdLogin`. No
`createConfig`, no RainbowKit.

```tsx
// app/providers.tsx
"use client";
import { TopazIdProvider } from "@topazdex/id-connect/react";
import { base, robinhood } from "@topazdex/id-connect/chains";

// Module scope, so the array's identity is stable across renders.
const chains = [base, robinhood] as const; // first entry = the chain Topaz ID connects on

export function Providers({
  children,
  cookie,
}: {
  children: React.ReactNode;
  cookie?: string | null;
}) {
  return (
    <TopazIdProvider chains={chains} cookie={cookie}>
      {children}
    </TopazIdProvider>
  );
}
```

Omit `chains` for BNB Chain only.

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

`TopazIdProvider` props: `chains` (any subset of `TOPAZ_ID_CHAINS`; default BNB
Chain), `transports` (per-chain RPC, default `http()` on each chain's public RPC),
`appId` (target a staging app), `smartWalletMode` (default `true`; `false` for the
legacy signer EOA), `queryClient` (bring your own), `ssr` (default `true`, enabling
wagmi cookie storage), and `cookie` (the request cookie header). Draw the
`"use client"` boundary in your app — the library stays framework-agnostic.

`useTopazIdLogin({ chainId })` connects on a specific configured chain; afterwards
use wagmi's `useSwitchChain` like any other wallet.

## RainbowKit

Prefer RainbowKit's wallet picker? Configure wagmi yourself and add the Topaz ID
wallet. Connector helpers live at `@topazdex/id-connect/connectors`; the chains
come from your wagmi config.

```ts
import { topazIdWallet } from "@topazdex/id-connect/connectors";
import { bsc, base } from "@topazdex/id-connect/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";

const connectors = connectorsForWallets(
  [{ groupName: "Sign in", wallets: [topazIdWallet()] }],
  { appName: "Your App", projectId: "<walletconnect-project-id>" },
);

export const wagmiConfig = createConfig({
  chains: [bsc, base], // Topaz ID connects on bsc; the user can switch to base
  transports: { [bsc.id]: http(), [base.id]: http() },
  connectors,
  ssr: true,
});
```

`"Topaz ID"` now appears in the RainbowKit picker. Selecting it opens a Topaz ID
consent window where the user signs in — no new wallet is created.

> RainbowKit's `connectorsForWallets` requires a WalletConnect (Reown) project id
> even though the Topaz ID connector never touches WalletConnect.
>
> The `@topazdex/id-connect/rainbow-kit` subpath still works as a deprecated alias
> of `/connectors`, so existing imports keep compiling. New code should use
> `/connectors`.

## Plain wagmi (no RainbowKit)

```ts
import { topazIdConnector } from "@topazdex/id-connect/connectors";
import { arc, base, bsc } from "@topazdex/id-connect/chains";
import { createConfig, http } from "wagmi";

export const wagmiConfig = createConfig({
  chains: [bsc, base, arc], // any subset of TOPAZ_ID_CHAINS; the first is the connect chain
  transports: { [bsc.id]: http(), [base.id]: http(), [arc.id]: http() },
  connectors: [topazIdConnector()],
  ssr: true,
});
```

wagmi types `transports` by the literal chain ids, so list them explicitly as
above rather than building the object with `Object.fromEntries`.

## Without wagmi (any framework)

`@topazdex/id-connect/provider` gives you a Topaz ID EIP-1193 provider with no
wagmi, React Query, or RainbowKit: reads go to the chain's RPC, wallet methods
open the Topaz ID consent popup, and chain switches are limited to the chains you
configure. Pair it with the [action client](#sending-transactions).

```ts
import {
  createTopazIdProvider,
  connectTopazId,
  disconnectTopazId,
} from "@topazdex/id-connect/provider";
import { createTopazIdClient } from "@topazdex/id-connect/actions";
import { robinhood, arc } from "@topazdex/id-connect/chains";

const provider = createTopazIdProvider({ chains: [robinhood, arc] });

// From a click handler (the consent popup needs a user gesture):
const { account, chainId } = await connectTopazId(provider);
const topazClient = await createTopazIdClient({ provider, account, chainId });

const hash = await topazClient.sendTransaction({ to, data, value });
const receipt = await topazClient.waitForReceipt(hash);

// Later:
await disconnectTopazId(provider);
```

`connectTopazId` returns without a popup when a session is already connected, so
call it on page load to restore one (check `eth_accounts` first if you only want to
restore, never prompt). It also accepts `{ chainId }` to switch right after
sign-in. The provider emits standard `accountsChanged`, `chainChanged`, and
`disconnect` events; `provider.request({ method: "wallet_switchEthereumChain" })`
switches among your configured chains and rejects any other with EIP-1193 code
`4902`. The provider also works as a viem transport: `custom(provider)`.

## Sending transactions

Use the high-level Topaz ID client for every send instead of hand-rolling
provider RPC calls. It exposes `sendTransaction`, `sendCalls`, `writeContract`,
and `waitForReceipt`, and hides the smart-wallet details:
`privy_sendSmartWalletTx`, native value formatting, approval+action batching, and
UserOperation receipt resolution.

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

`useTopazIdClient` also returns `isTopazId`, and `data` stays `undefined` when
the connected wallet isn't Topaz ID — so in a multi-wallet dapp the drop-in
pattern is a single branch, no connector sniffing:

```ts
const { data: topazClient } = useTopazIdClient();

const hash = topazClient
  ? await topazClient.sendTransaction({ to, value }) // Topaz ID smart wallet
  : await sendTransactionAsync({ to, value }); // any other wallet
```

Pass `useTopazIdClient({ appId })` when your connector was configured with a
custom app id.

Outside React, `createTopazIdClient` takes any Topaz ID provider — one from
`createTopazIdProvider`, or a wagmi connector client:

```ts
import { createTopazIdClient } from "@topazdex/id-connect/actions";

const topazClient = await createTopazIdClient({ provider, account, chainId });
await topazClient.sendCalls({ calls: [approvalCall, swapCall] });
```

`chainId` defaults to the provider's current chain. Plain object literals work
for every call; the optional `txCall(...)` / `contractCall(...)` builders do the
same thing but validate the target address eagerly, so a typo fails before a
consent popup ever opens.

The client is the required path for anything with a native `value`: wagmi
hex-encodes `value` and the Topaz ID popup rejects hex quantity strings — that
mismatch is why value-bearing transactions fail with a "can't estimate cost"
popup on raw connector integrations. Zero-value calls (approvals, most contract
writes) _can_ still go through plain wagmi, but routing everything through the
client keeps one code path. If a contract write reverts unexpectedly on plain
wagmi, switch it to the client before debugging further.

A few rules keep transactions routing through the smart wallet reliably:

- **Sign and send with this client (or plain wagmi for zero-value calls) — never
  `@privy-io/react-auth` signing hooks.** Those are embedded-wallet-only and
  execute from the underlying Privy EOA instead of the user's Topaz ID smart
  wallet.
- **Every action opens a Topaz ID consent window; the user approves each one.**
  Trigger sends from a direct user interaction (a button click) so browsers don't
  block the popup — a send fired after a long `await` chain can be popup-blocked.
  Prefer batching an approval + action into one `sendCalls` bundle: one popup, one
  approval, atomic execution.
- **Pass native `value` as a `bigint` and let the SDK format it.** See
  [Native value precision](#native-value-precision) for amounts above ~0.009 of
  the native currency.
- **`sendCalls` degrades gracefully.** It submits one atomic bundle; if the
  wallet rejects the bundle, the SDK retries the calls sequentially (one consent
  popup per call) and returns the last call's hash. Pass `atomicRequired: true`
  to get the batch error instead of the fallback.
- **Confirm with `waitForReceipt`, not a plain receipt lookup.** See
  [Confirming a transaction](#confirming-a-transaction).

### Switching chains

The client is bound to one chain (`client.chainId`). With wagmi, switch with
`useSwitchChain` as for any wallet; `useTopazIdClient` re-creates the client for
the new chain. Without wagmi, send `wallet_switchEthereumChain` to the provider
and create a new client with the new `chainId`. Only chains you configured are
switchable; a switch to any other chain rejects with code `4902`.

### Gas and funding

Gas sponsorship is per chain. `TOPAZ_ID_CHAIN_INFO` (root entry) and
`client.getCapabilities().sponsored` tell you which case you are in:

- **BNB Chain** — gas is paid by Topaz ID's paymaster. Users need funds only for
  the `value` they send.
- **Robinhood Chain, Base, Ethereum, Arc** — the smart wallet pays its own gas
  from its native balance (ETH, or USDC on Arc). A fresh wallet on these chains
  holds nothing: tell the user to fund the connected address, and check the
  balance covers `value` plus a gas margin before opening the popup. The popup
  reports a failed gas estimate, but a pre-check gives a clearer message.

```ts
import { TOPAZ_ID_CHAIN_INFO, isTopazIdGasSponsored } from "@topazdex/id-connect";

if (!isTopazIdGasSponsored(chainId)) {
  const balance = await publicClient.getBalance({ address: account });
  if (balance <= value) {
    const { name, nativeCurrency } = TOPAZ_ID_CHAIN_INFO[chainId];
    throw new Error(`Fund your Topaz ID wallet with ${nativeCurrency} on ${name} for the payment and gas.`);
  }
}
```

The smart wallet is a fresh address distinct from the user's MetaMask/EOA, so
their existing funds aren't there on any chain until they deposit.

### Native value precision

The Topaz ID popup carries `value` as a plain JSON number. Every amount up to
2^53−1 wei is exact; above that (≈0.009 BNB/ETH, or ≈0.009 USDC on Arc where the
native unit is 18-decimal) the conversion rounds to the nearest representable
amount — at most a few thousand wei of dust. Round amounts (0.1 / 1 / 10) are
always exact. That dust is economically irrelevant,
but it matters when a contract checks `msg.value` exactly, so two helpers on
`/actions` let you decide before the popup opens:

```ts
import { isExactTopazIdValue, roundUpTopazIdValue } from "@topazdex/id-connect/actions";

// A fixed price the contract compares exactly: refuse rather than round.
if (!isExactTopazIdValue(price)) throw new Error("Use fewer decimal places.");

// A quoted fee that must not be under-paid (e.g. a LayerZero messaging fee):
// pay the next exactly representable amount; the contract refunds the excess.
await topazClient.sendTransaction({ to: bridge, data, value: roundUpTopazIdValue(nativeFee) });
```

### Confirming a transaction

The popup returns either a transaction hash or a **UserOperation hash**, and a
plain `eth_getTransactionReceipt` never resolves the latter. Smart-wallet sends
also land inside a bundler transaction that can succeed while the user's
operation inside it reverted. `client.waitForReceipt(hash)` (or
`waitForTopazIdReceipt({ provider, hash, account })` outside React) handles
both:

- it polls the receipt and, while that stays empty, searches the ERC-4337
  EntryPoint's logs for the operation to find the bundler transaction;
- the returned receipt carries `userOperation: { hash, sender, success }`, and its
  `status` reflects **the operation's** outcome (`"0x0"` when the operation
  reverted, even if the outer transaction succeeded);
- it resolves to `null` on timeout (default 30s) instead of hanging.

```ts
const hash = await topazClient.sendTransaction(call);
const receipt = await topazClient.waitForReceipt(hash);

if (receipt?.status === "0x1") {
  // confirmed
} else if (receipt) {
  // reverted — receipt.userOperation?.success is false
} else {
  // unresolved within the timeout: re-read balances/allowances instead of blocking the UI
}
```

Public RPCs cap `eth_getLogs` ranges; the log search looks back `lookbackBlocks`
(default 250) from the first poll and is skipped if the RPC refuses it, so pass a
`transports` entry with your own RPC for busy chains.

## Signing messages

`personal_sign` / `eth_signTypedData_v4` (wagmi's `useSignMessage` /
`useSignTypedData`, or the same methods on the raw provider) return a
**ERC-1271 / ERC-6492 contract signature**, not ECDSA. Verify with viem's
`verifyMessage` / `verifyTypedData` / `verifySiweMessage` on a public client
**for the chain the user signed on** — never `ecrecover`. viem resolves EOAs by
`ecrecover`, deployed smart wallets by ERC-1271, and not-yet-deployed ones by
ERC-6492 automatically. A wallet is deployed per chain on its first transaction
there, so a user who has transacted on BNB Chain still signs ERC-6492 on Base
until their first Base send; viem handles both. Verify against the smart-wallet
address (`useAccount().address`), not the `signerAddress` from `/privy`. Sizes
are variable — don't split into `r`/`s`/`v` or assume 65 bytes.

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

TOPAZ_ID_WALLET_MODES.smart; // { mode: "smart", label: "Smart", description: "…" }
TOPAZ_ID_WALLET_MODES.legacy; // { mode: "legacy", label: "Legacy", description: "…" }
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

In Legacy mode the connector does not rewrite the sign methods, so signatures are
plain ECDSA from the signer EOA.

## Show the user's Topaz ID profile

Topaz ID owns each wallet's name, handle, and avatar. Render real identity instead
of a bare address. Framework-agnostic helpers live at the root entry; a React Query
hook lives at `/react`. Profiles are chain-independent.

```ts
import { displayNameForWallet, avatarForWallet } from "@topazdex/id-connect";
import { useTopazIdProfile } from "@topazdex/id-connect/react";

const { data: profile } = useTopazIdProfile(address);
const label = displayNameForWallet(profile ?? null, address);
const avatar = avatarForWallet(profile ?? null, "/default-avatar.png");
```

Reads are public and CORS-open (`GET https://id.topazdex.com/api/v1/profile/{wallet}`).
`found: false` → fall back to the address; never block your UI on the fetch.
`fetchTopazIdProfile` returns `null` on a network or HTTP failure (aborts re-throw
so React Query can tell a cancellation from an empty result).

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
guard on it with a loading state before rendering or transacting.

## Exports

| Entry | Contents |
| --- | --- |
| `@topazdex/id-connect` | `TOPAZ_ID_APP_ID`, `TOPAZ_ID_CONNECTOR_ID`, `TOPAZ_ID_CHAIN_ID`, `TOPAZ_ID_CHAIN_IDS`, `TOPAZ_ID_CHAIN_INFO`, `isTopazIdChainId`, `isTopazIdGasSponsored`, `topazIdChainInfo`, `TOPAZ_ID_NAME`, `TOPAZ_ID_ICON_URL`, `TOPAZ_ID_BASE_URL`, `TOPAZ_ID_SMART_WALLET_LABEL`, `TOPAZ_ID_LEGACY_WALLET_LABEL`, `TOPAZ_ID_WALLET_MODES`, `topazIdWalletMode`, `fetchTopazIdProfile`, `displayNameForWallet`, `avatarForWallet`, `shortenAddress`; types `TopazIdChainId`, `TopazIdChainInfo`, `TopazIdWalletMode`, `TopazIdWalletModeInfo`, `TopazIdProfile`, `FetchTopazIdProfileOptions` |
| `@topazdex/id-connect/chains` | `TOPAZ_ID_CHAINS`, `TOPAZ_ID_CHAIN`, `bsc`, `robinhood`, `base`, `mainnet`, `arc`, `topazIdChain` |
| `@topazdex/id-connect/connectors` | `topazIdWallet`, `topazIdConnector`, `TOPAZ_ID_CHAIN`, `TOPAZ_ID_CHAINS`, `TopazIdConnectorOptions` |
| `@topazdex/id-connect/provider` | `createTopazIdProvider`, `connectTopazId`, `disconnectTopazId`, `TopazIdChainNotConfiguredError`; types `TopazIdProvider`, `CreateTopazIdProviderOptions`, `ConnectTopazIdOptions`, `TopazIdConnection` |
| `@topazdex/id-connect/actions` | `createTopazIdClient`, `waitForTopazIdReceipt`, `isExactTopazIdValue`, `roundUpTopazIdValue`, `txCall`, `contractCall`, `isTopazIdConnectorId`, `ENTRY_POINT_ADDRESSES`, `USER_OPERATION_EVENT_TOPIC`; types `TopazIdClient`, `TopazIdClientOptions`, `TopazIdCall`, `TopazIdContractCall`, `TopazIdSendCallsParameters`, `TopazIdCapabilities`, `TopazIdProviderLike`, `TopazIdTransactionReceipt`, `TopazIdUserOperation`, `TopazIdLog`, `WaitForReceiptOptions`, `WaitForTopazIdReceiptParameters` |
| `@topazdex/id-connect/rainbow-kit` | *Deprecated alias of `/connectors`* |
| `@topazdex/id-connect/react` | `TopazIdProvider`, `useTopazIdLogin`, `useTopazIdClient`, `useTopazIdProfile` |
| `@topazdex/id-connect/privy` | `TopazIdPrivyProvider`, `useTopazIdCrossAppLogin`, `useTopazIdAccount`, `topazIdLoginMethod` |

## Peer dependencies

All peers are optional; install only what your entrypoints use.

| You use | Install |
| --- | --- |
| Constants + profile helpers only (`@topazdex/id-connect`) | nothing extra |
| Chain objects (`/chains`) or the action client (`/actions`) | `viem` |
| Framework-free provider (`/provider`) | `@privy-io/cross-app-connect`, `viem` |
| Connectors (`/connectors`) | `@privy-io/cross-app-connect`, `viem`, `wagmi` (+ `@rainbow-me/rainbowkit` for `topazIdWallet`) |
| `TopazIdProvider` / `useTopazIdLogin` / `useTopazIdClient` (`/react`) | `wagmi` (2 or 3), `viem`, `@tanstack/react-query`, `react`, `@privy-io/cross-app-connect` |
| `useTopazIdProfile` only (`/react`) | `@tanstack/react-query`, `react` |
| Privy cross-app (`/privy`) | `@privy-io/react-auth`, `react` |

## Upgrade notes

Pre-1.0: a minor bump is the feature bump, and `^0.x` consumers don't cross a
minor automatically (`^0.4.3` excludes `0.5.0`) — upgrade deliberately. Every
release is additive; existing imports keep working.

- **0.5.1** — wagmi 3 and `@privy-io/cross-app-connect` 0.6/0.7 accepted as
  peers (both verified); `useTopazIdLogin().logout` takes no arguments, so
  `onClick={logout}` type-checks.
- **0.5** — multichain. New `/chains` and `/provider` entries; `TopazIdProvider`
  takes `chains` + `transports` (`transport` is deprecated but still honoured for
  BNB Chain); `useTopazIdLogin` takes `chainId`; `createTopazIdClient` defaults
  `chainId` to the provider's chain and reports `sponsored` per chain;
  `waitForReceipt` resolves UserOperation hashes and reports the operation's
  outcome in `status` + `userOperation`; `isExactTopazIdValue` /
  `roundUpTopazIdValue`. Defaults are unchanged: with no `chains`, everything is
  still BNB Chain only.
- **0.4** — the smart-wallet action client (`useTopazIdClient`, `/actions`) and
  `waitForTopazIdReceipt`. If value-bearing sends failed on plain wagmi, route
  them through the client.
- **0.3** — smart-account-first: the connected account became the smart contract
  wallet instead of the signer EOA. Anything keyed on the old EOA (allowlists,
  balances) doesn't carry over; signatures became ERC-1271/6492; pass
  `{ smartWalletMode: false }` for the Legacy signer EOA.

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
