import { toPrivyWalletProvider } from "@privy-io/cross-app-connect";
import {
  getAddress,
  isAddress,
  numberToHex,
  type Address,
  type Chain,
  type EIP1193Events,
  type Transport,
} from "viem";
import type { TopazIdProviderLike } from "./actions";
import { TOPAZ_ID_CHAINS } from "./chains";
import { TOPAZ_ID_APP_ID } from "./constants";

export interface CreateTopazIdProviderOptions {
  /**
   * Chains the provider may operate on. Defaults to every Topaz ID chain
   * (`TOPAZ_ID_CHAINS`, BNB Chain first). Pass just the ones your app supports —
   * the first entry is the chain Topaz ID connects on unless `chainId` says
   * otherwise, and `wallet_switchEthereumChain` is refused for anything else.
   */
  chains?: readonly [Chain, ...Chain[]];
  /** Chain to connect on. Defaults to the first entry of `chains`. */
  chainId?: number;
  /**
   * Per-chain viem transports for reads (`eth_call`, receipts, logs…). Any chain
   * without one uses `http()` against the chain's default public RPC.
   */
  transports?: Record<number, Transport>;
  /** Override Topaz ID's app id (e.g. to target a staging app). */
  appId?: string;
  /**
   * `true` (default) exposes the user's Topaz ID smart contract wallet; `false`
   * exposes the legacy signer EOA. See `TopazIdConnectorOptions.smartWalletMode`.
   */
  smartWalletMode?: boolean;
  /** Milliseconds before an unanswered consent popup rejects with a timeout. */
  defaultPopupTimeout?: number;
}

/**
 * The EIP-1193 provider `createTopazIdProvider` returns. `request` accepts any
 * JSON-RPC method: reads go to the chain's RPC, wallet methods open the Topaz ID
 * consent popup. It plugs straight into viem's `custom(provider)` transport and
 * into `createTopazIdClient({ provider })`.
 */
export type TopazIdProvider = TopazIdProviderLike & EIP1193Events;

/** Thrown (with EIP-1193 code `4902`) for a chain the provider was not configured with. */
export class TopazIdChainNotConfiguredError extends Error {
  readonly code = 4902;

  constructor(chainId: number, configured: readonly Chain[]) {
    super(
      `Chain ${chainId} is not configured for Topaz ID. Configured chains: ${configured
        .map((chain) => `${chain.name} (${chain.id})`)
        .join(", ")}.`,
    );
    this.name = "TopazIdChainNotConfiguredError";
  }
}

function assertConfiguredChain(
  chains: readonly Chain[],
  chainId: number,
): void {
  if (!chains.some((chain) => chain.id === chainId)) {
    throw new TopazIdChainNotConfiguredError(chainId, chains);
  }
}

function requestedChainId(params: unknown): number {
  const first = Array.isArray(params) ? (params[0] as unknown) : undefined;
  const raw =
    first && typeof first === "object" && "chainId" in first
      ? (first as { chainId?: unknown }).chainId
      : undefined;
  return typeof raw === "string" || typeof raw === "number"
    ? Number(raw)
    : Number.NaN;
}

/**
 * A Topaz ID provider for apps that don't use wagmi. Wraps Privy's cross-app
 * provider with Topaz ID's app id, smart-wallet mode, and the chains you pass,
 * and refuses chain switches outside that list (Privy's raw provider does not).
 * Pair it with {@link connectTopazId} to sign the user in and
 * `createTopazIdClient` (from `/actions`) to send.
 *
 * @example
 * import { createTopazIdProvider, connectTopazId } from "@topazdex/id-connect/provider";
 * import { createTopazIdClient } from "@topazdex/id-connect/actions";
 * import { base, robinhood } from "@topazdex/id-connect/chains";
 *
 * const provider = createTopazIdProvider({ chains: [base, robinhood] });
 * const { account, chainId } = await connectTopazId(provider); // opens the popup
 * const client = await createTopazIdClient({ provider, account, chainId });
 */
export function createTopazIdProvider(
  options: CreateTopazIdProviderOptions = {},
): TopazIdProvider {
  const chains = options.chains ?? TOPAZ_ID_CHAINS;
  const chainId = options.chainId ?? chains[0].id;
  assertConfiguredChain(chains, chainId);

  const raw = toPrivyWalletProvider({
    providerAppId: options.appId ?? TOPAZ_ID_APP_ID,
    chains,
    chainId,
    ...(options.transports ? { transports: options.transports } : {}),
    smartWalletMode: options.smartWalletMode ?? true,
    ...(options.defaultPopupTimeout == null
      ? {}
      : { defaultPopupTimeout: options.defaultPopupTimeout }),
  });
  // Privy types `request` per RPC method; the SDK talks to it with plain
  // `{ method, params }` objects.
  const rawRequest = raw.request as unknown as TopazIdProviderLike["request"];

  return {
    on: raw.on,
    removeListener: raw.removeListener,
    async request(args) {
      if (args.method === "wallet_switchEthereumChain") {
        assertConfiguredChain(chains, requestedChainId(args.params));
      }
      return rawRequest(args);
    },
  };
}

export interface ConnectTopazIdOptions {
  /** Switch to this chain right after sign-in. Must be one of the provider's chains. */
  chainId?: number;
}

export interface TopazIdConnection {
  /** The user's Topaz ID smart wallet (or the signer EOA in Legacy mode). */
  account: Address;
  chainId: number;
}

/**
 * Open the Topaz ID consent popup and resolve the connected account and chain.
 * Call it from a click handler so the browser allows the popup. Privy's
 * `eth_requestAccounts` resolves without a value on first connect, so this reads
 * `eth_accounts` afterwards — use it instead of calling `eth_requestAccounts`
 * yourself. A second call while already connected returns without a popup.
 */
export async function connectTopazId(
  provider: TopazIdProviderLike,
  options: ConnectTopazIdOptions = {},
): Promise<TopazIdConnection> {
  await provider.request({ method: "eth_requestAccounts" });
  const accounts = await provider.request({ method: "eth_accounts" });
  const account = Array.isArray(accounts)
    ? accounts.find(
        (entry): entry is string => typeof entry === "string" && isAddress(entry),
      )
    : undefined;
  if (!account) {
    throw new Error(
      "Topaz ID sign-in did not return an account. Ask the user to try again.",
    );
  }
  if (options.chainId != null) {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: numberToHex(options.chainId) }],
    });
  }
  const chainId = Number(await provider.request({ method: "eth_chainId" }));
  return { account: getAddress(account), chainId };
}

/** Revoke the app's connection so the next {@link connectTopazId} asks again. */
export async function disconnectTopazId(
  provider: TopazIdProviderLike,
): Promise<void> {
  await provider.request({
    method: "wallet_revokePermissions",
    params: [{ eth_accounts: {} }],
  });
}
