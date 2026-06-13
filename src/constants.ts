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
