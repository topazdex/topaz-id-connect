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
    description: "Gas-free smart wallet (recommended)",
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
