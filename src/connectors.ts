import {
  toPrivyWallet,
  toPrivyWalletConnector,
} from "@privy-io/cross-app-connect/rainbow-kit";
import { bsc } from "viem/chains";
import { TOPAZ_ID_APP_ID, TOPAZ_ID_ICON_URL, TOPAZ_ID_NAME } from "./constants";

/** BNB Chain (id 56) — the chain Topaz ID wallets operate on. */
export const TOPAZ_ID_CHAIN = bsc;

export interface TopazIdConnectorOptions {
  /** Override Topaz ID's app id (e.g. to target a staging app). */
  appId?: string;
  /** Override the wallet icon shown in the picker. */
  iconUrl?: string;
}

/**
 * A RainbowKit wallet for Topaz ID. Drop into `connectorsForWallets`.
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
export function topazIdWallet(options: TopazIdConnectorOptions = {}) {
  return toPrivyWallet({
    id: options.appId ?? TOPAZ_ID_APP_ID,
    name: TOPAZ_ID_NAME,
    iconUrl: options.iconUrl ?? TOPAZ_ID_ICON_URL,
  });
}

/**
 * A plain wagmi connector for Topaz ID — no RainbowKit required.
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
    name: TOPAZ_ID_NAME,
    iconUrl: options.iconUrl ?? TOPAZ_ID_ICON_URL,
  });
}
