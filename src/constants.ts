/**
 * Topaz ID's PUBLIC Privy app id. This is the provider app id partners reference
 * to surface Topaz ID's global wallet — it is safe to ship in client code.
 */
export const TOPAZ_ID_APP_ID = "cmpt1zsgh00rs0cld1hgqc0v7";

/**
 * The wagmi connector id Topaz ID registers under. The Privy cross-app connector
 * uses the provider app id as its connector id, so this equals {@link TOPAZ_ID_APP_ID}
 * for the default app. Use it to locate the connector in `useConnect().connectors`.
 */
export const TOPAZ_ID_CONNECTOR_ID = TOPAZ_ID_APP_ID;

/**
 * Every chain id a Topaz ID smart wallet operates on: BNB Chain, Robinhood Chain,
 * Base, Ethereum, Arc. The wallet has the same address on each chain. viem
 * `Chain` objects for them live at `@topazdex/id-connect/chains`.
 */
export const TOPAZ_ID_CHAIN_IDS = [56, 4663, 8453, 1, 5042] as const;

export type TopazIdChainId = (typeof TOPAZ_ID_CHAIN_IDS)[number];

/** BNB Chain (56) — Topaz ID's hub chain, and the default when none is chosen. */
export const TOPAZ_ID_CHAIN_ID: TopazIdChainId = 56;

export interface TopazIdChainInfo {
  id: TopazIdChainId;
  name: string;
  /** Symbol of the currency that gas and native `value` are paid in. */
  nativeCurrency: string;
  /**
   * `true` when Topaz ID's paymaster pays gas on this chain, so the user needs
   * funds only for the `value` they send. `false` means the smart wallet pays gas
   * from its own native balance and must be funded before it can transact.
   */
  gasSponsored: boolean;
  explorerUrl: string;
}

/**
 * Framework-free facts about each Topaz ID chain — name, gas currency, whether
 * Topaz sponsors gas, and the block explorer. Use it for "fund your wallet with
 * ETH on Base" copy or a chain picker without importing viem.
 */
export const TOPAZ_ID_CHAIN_INFO: Record<TopazIdChainId, TopazIdChainInfo> = {
  56: {
    id: 56,
    name: "BNB Chain",
    nativeCurrency: "BNB",
    gasSponsored: true,
    explorerUrl: "https://bscscan.com",
  },
  4663: {
    id: 4663,
    name: "Robinhood Chain",
    nativeCurrency: "ETH",
    gasSponsored: false,
    explorerUrl: "https://robin.etherscan.io",
  },
  8453: {
    id: 8453,
    name: "Base",
    nativeCurrency: "ETH",
    gasSponsored: false,
    explorerUrl: "https://basescan.org",
  },
  1: {
    id: 1,
    name: "Ethereum",
    nativeCurrency: "ETH",
    gasSponsored: false,
    explorerUrl: "https://etherscan.io",
  },
  5042: {
    id: 5042,
    name: "Arc",
    nativeCurrency: "USDC",
    gasSponsored: false,
    explorerUrl: "https://explorer.arc.io",
  },
};

/** Whether `chainId` is one Topaz ID smart wallets operate on. */
export function isTopazIdChainId(
  chainId: number | undefined,
): chainId is TopazIdChainId {
  return TOPAZ_ID_CHAIN_IDS.some((id) => id === chainId);
}

/** Whether Topaz ID's paymaster pays gas on `chainId` (only BNB Chain today). */
export function isTopazIdGasSponsored(chainId: number | undefined): boolean {
  return isTopazIdChainId(chainId) && TOPAZ_ID_CHAIN_INFO[chainId].gasSponsored;
}

/** {@link TopazIdChainInfo} for a Topaz ID chain, or `undefined` for any other id. */
export function topazIdChainInfo(
  chainId: number | undefined,
): TopazIdChainInfo | undefined {
  return isTopazIdChainId(chainId) ? TOPAZ_ID_CHAIN_INFO[chainId] : undefined;
}

export const TOPAZ_ID_NAME = "Topaz ID";

export const TOPAZ_ID_ICON_URL =
  "https://id.topazdex.com/brand/topaz-logo.png";

export const TOPAZ_ID_BASE_URL = "https://id.topazdex.com";

/**
 * The two Topaz ID wallet modes. **Smart** is the user's smart contract wallet —
 * the default, and the right choice for every new integration. **Legacy** is the
 * underlying Privy **signer EOA**, exposed only for backward compatibility with
 * dapps whose users transacted with that EOA directly before the smart-wallet
 * cutover.
 *
 * Use the labels anywhere you show both modes or let the user switch between them
 * (e.g. a wallet-menu toggle). Single-mode integrations should just use Smart and
 * need not surface Legacy at all.
 */
export type TopazIdWalletMode = "smart" | "legacy";

export interface TopazIdWalletModeInfo {
  /** Stable mode key. */
  mode: TopazIdWalletMode;
  /** Short label for a toggle or menu — matches id.topazdex.com. */
  label: string;
  /** One-line description for a tooltip or subtitle. */
  description: string;
}

/** Canonical label for the Smart (smart contract wallet) mode. */
export const TOPAZ_ID_SMART_WALLET_LABEL = "Smart";

/** Canonical label for the Legacy (Privy signer EOA) mode. */
export const TOPAZ_ID_LEGACY_WALLET_LABEL = "Legacy";

/**
 * Canonical labels + descriptions for both wallet modes, keyed by mode. Drive any
 * Smart/Legacy toggle from this so the wording stays consistent with id.topazdex.com.
 */
export const TOPAZ_ID_WALLET_MODES: Record<
  TopazIdWalletMode,
  TopazIdWalletModeInfo
> = {
  smart: {
    mode: "smart",
    label: TOPAZ_ID_SMART_WALLET_LABEL,
    description: "Smart wallet (recommended; gas-free on BNB Chain)",
  },
  legacy: {
    mode: "legacy",
    label: TOPAZ_ID_LEGACY_WALLET_LABEL,
    description: "Your original Privy signing wallet",
  },
};

/**
 * Resolve the connector's `smartWalletMode` flag to its wallet-mode key:
 * `undefined` or `true` → `"smart"` (the default); `false` → `"legacy"`.
 */
export function topazIdWalletMode(smartWalletMode?: boolean): TopazIdWalletMode {
  return smartWalletMode === false ? "legacy" : "smart";
}
