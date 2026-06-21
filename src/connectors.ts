import {
  toPrivyWallet,
  toPrivyWalletConnector,
} from "@privy-io/cross-app-connect/rainbow-kit";
import type { Wallet, WalletDetailsParams } from "@rainbow-me/rainbowkit";
import { bsc } from "viem/chains";
import { TOPAZ_ID_APP_ID, TOPAZ_ID_ICON_URL, TOPAZ_ID_NAME } from "./constants";

/** BNB Chain (id 56) — the chain Topaz ID wallets operate on. */
export const TOPAZ_ID_CHAIN = bsc;

export interface TopazIdConnectorOptions {
  /** Override Topaz ID's app id (e.g. to target a staging app). */
  appId?: string;
  /** Override the wallet icon shown in the picker. */
  iconUrl?: string;
  /**
   * Display name shown in wallet pickers (e.g. RainbowKit). Defaults to
   * `"Topaz ID"`. When you surface both modes as separate entries, label the Legacy
   * one — e.g. `` `${TOPAZ_ID_NAME} (${TOPAZ_ID_LEGACY_WALLET_LABEL})` ``.
   */
  name?: string;
  /**
   * Selects the **Smart** wallet mode (the user's smart contract wallet) when
   * `true` — the default, and the user's canonical on-chain identity; sends route
   * as gas-sponsored UserOperations through Topaz ID. Set `false` for **Legacy**
   * mode, which exposes the embedded Privy **signer EOA** (signer-only — not where
   * the user holds funds), kept for backward compatibility with existing dapps.
   *
   * @remarks Backed by Privy cross-app `smartWalletMode`, which Privy marks
   * `@experimental`; its behavior can change between `@privy-io/cross-app-connect`
   * releases — pin the version you test against.
   */
  smartWalletMode?: boolean;
}

/**
 * A RainbowKit wallet for Topaz ID. Drop into `connectorsForWallets`. By default
 * the connected account is the user's Topaz ID **smart contract wallet**; pass
 * `{ smartWalletMode: false }` for **Legacy** mode (the signer EOA).
 *
 * @example
 * import { connectorsForWallets } from "@rainbow-me/rainbowkit";
 * import { topazIdWallet } from "@topazdex/id-connect/connectors";
 *
 * const connectors = connectorsForWallets(
 *   [{ groupName: "Sign in", wallets: [topazIdWallet()] }],
 *   { appName: "Your App", projectId: WC_PROJECT_ID },
 * );
 */
export function topazIdWallet(
  options: TopazIdConnectorOptions = {},
): () => Wallet {
  const base = {
    id: options.appId ?? TOPAZ_ID_APP_ID,
    name: options.name ?? TOPAZ_ID_NAME,
    iconUrl: options.iconUrl ?? TOPAZ_ID_ICON_URL,
  };
  const smartWalletMode = options.smartWalletMode ?? true;

  if (!smartWalletMode) return toPrivyWallet(base);

  // `toPrivyWallet` has no smartWalletMode option (the flag lives only on the
  // connector), so keep its RainbowKit wallet object and swap in a connector
  // that targets the smart account.
  const makeWallet = toPrivyWallet(base);
  return () => ({
    ...makeWallet(),
    createConnector: (walletDetails: WalletDetailsParams) =>
      toPrivyWalletConnector({ ...base, smartWalletMode }, walletDetails),
  });
}

/**
 * A plain wagmi connector for Topaz ID — no RainbowKit required. By default the
 * connected account is the user's Topaz ID **smart contract wallet**; pass
 * `{ smartWalletMode: false }` for **Legacy** mode (the signer EOA).
 *
 * @example
 * import { createConfig, http } from "wagmi";
 * import { topazIdConnector, TOPAZ_ID_CHAIN } from "@topazdex/id-connect/connectors";
 *
 * export const wagmiConfig = createConfig({
 *   chains: [TOPAZ_ID_CHAIN],
 *   transports: { [TOPAZ_ID_CHAIN.id]: http() },
 *   connectors: [topazIdConnector()],
 *   ssr: true,
 * });
 */
export function topazIdConnector(options: TopazIdConnectorOptions = {}) {
  return toPrivyWalletConnector({
    id: options.appId ?? TOPAZ_ID_APP_ID,
    name: options.name ?? TOPAZ_ID_NAME,
    iconUrl: options.iconUrl ?? TOPAZ_ID_ICON_URL,
    smartWalletMode: options.smartWalletMode ?? true,
  });
}
