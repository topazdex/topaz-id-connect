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
  @rainbow-me/rainbowkit @tanstack/react-query
```

> `@privy-io/cross-app-connect` pins `viem@2.52.0`. Match it to avoid peer
> warnings.

## RainbowKit

```ts
import { topazIdWallet } from "@topazdex/id-connect/rainbow-kit";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { TOPAZ_ID_CHAIN } from "@topazdex/id-connect/rainbow-kit";

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

## Plain wagmi (no RainbowKit)

```ts
import { topazIdConnector, TOPAZ_ID_CHAIN } from "@topazdex/id-connect/rainbow-kit";
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
block your UI on the fetch.

## Already using Privy?

If your app is itself a Privy app, skip the connector and add Topaz ID as a
cross-app login method instead:

```ts
// PrivyProvider config:
//   loginMethods: ["email", "wallet", "privy:<topaz-id-app-id>"]
import { useCrossAppAccounts, usePrivy } from "@privy-io/react-auth";
import { TOPAZ_ID_APP_ID } from "@topazdex/id-connect";

const { user } = usePrivy();
const { loginWithCrossAppAccount } = useCrossAppAccounts();

await loginWithCrossAppAccount({ appId: TOPAZ_ID_APP_ID });

const topaz = user?.linkedAccounts.find(
  (a) => a.type === "cross_app" && a.providerApp.id === TOPAZ_ID_APP_ID,
);
const address = topaz?.embeddedWallets[0]?.address;
```

## Exports

| Entry | Contents |
| --- | --- |
| `@topazdex/id-connect` | `TOPAZ_ID_APP_ID`, profile helpers, `TopazIdProfile` |
| `@topazdex/id-connect/rainbow-kit` | `topazIdWallet`, `topazIdConnector`, `TOPAZ_ID_CHAIN` |
| `@topazdex/id-connect/react` | `useTopazIdProfile` |

## License

MIT
