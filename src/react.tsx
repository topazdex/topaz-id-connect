import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo, type ReactNode } from "react";
import type { Chain, Transport } from "viem";
import {
  cookieStorage,
  cookieToInitialState,
  createConfig,
  createStorage,
  http,
  useAccount,
  useConnect,
  useConnectorClient,
  useConnectors,
  useDisconnect,
  WagmiProvider,
} from "wagmi";
import { TOPAZ_ID_APP_ID } from "./constants";
import { TOPAZ_ID_CHAIN } from "./chains";
import { topazIdConnector } from "./connectors";
import {
  createTopazIdClient,
  isTopazIdConnectorId,
  type TopazIdClient,
  type TopazIdProviderLike,
} from "./actions";
import { fetchTopazIdProfile, type TopazIdProfile } from "./profile";

const DEFAULT_CHAINS: readonly [Chain, ...Chain[]] = [TOPAZ_ID_CHAIN];

export interface TopazIdProviderProps {
  children: ReactNode;
  /** Override Topaz ID's app id (e.g. to target a staging app). */
  appId?: string;
  /**
   * Expose the user's Topaz ID smart contract wallet as the connected account
   * (default `true`). Set `false` for the legacy signer-EOA behavior. Forwarded to
   * {@link topazIdConnector}.
   */
  smartWalletMode?: boolean;
  /**
   * Chains to configure wagmi with — any subset of `TOPAZ_ID_CHAINS` from
   * `@topazdex/id-connect/chains`. The first entry is the chain Topaz ID connects
   * on. Defaults to BNB Chain only. Define the array at module scope so its
   * identity is stable across renders.
   */
  chains?: readonly [Chain, ...Chain[]];
  /**
   * Per-chain RPC transports. Any chain without one uses `http()`, i.e. the
   * chain's default public RPC. Define it at module scope.
   */
  transports?: Record<number, Transport>;
  /** @deprecated Use `transports`. Applies to BNB Chain (56) only. */
  transport?: Transport;
  /** Supply your own React Query client. One is created if omitted. */
  queryClient?: QueryClient;
  /** Enable wagmi SSR + cookie storage (default `true`). */
  ssr?: boolean;
  /**
   * The request's `cookie` header, used to hydrate wagmi's initial state on the
   * server so a connected wallet survives SSR without a flash. In a Next.js App
   * Router layout: `cookie={(await headers()).get("cookie")}`.
   */
  cookie?: string | null;
}

/**
 * One-line setup for Topaz ID. Wraps your app in a wagmi config (your chosen
 * Topaz ID chains + the Topaz ID connector) and a React Query provider — no
 * `createConfig` or `QueryClientProvider` of your own. Pair with
 * {@link useTopazIdLogin} to connect.
 *
 * Draw the `"use client"` boundary in your app (e.g. a Next.js client component);
 * this library stays framework-agnostic.
 *
 * @example
 * "use client";
 * import { TopazIdProvider } from "@topazdex/id-connect/react";
 * import { base, robinhood } from "@topazdex/id-connect/chains";
 *
 * const chains = [base, robinhood] as const;
 *
 * export function Providers({ children }: { children: React.ReactNode }) {
 *   return <TopazIdProvider chains={chains}>{children}</TopazIdProvider>;
 * }
 */
export function TopazIdProvider({
  children,
  appId,
  smartWalletMode,
  chains = DEFAULT_CHAINS,
  transports,
  transport,
  queryClient,
  ssr = true,
  cookie,
}: TopazIdProviderProps) {
  const chainKey = chains.map((chain) => chain.id).join(",");

  const config = useMemo(
    () =>
      createConfig({
        chains,
        transports: Object.fromEntries(
          chains.map((chain) => [
            chain.id,
            transports?.[chain.id] ??
              (chain.id === TOPAZ_ID_CHAIN.id ? transport : undefined) ??
              http(),
          ]),
        ),
        connectors: [topazIdConnector({ appId, smartWalletMode })],
        ssr,
        storage: ssr
          ? createStorage({ storage: cookieStorage })
          : undefined,
        multiInjectedProviderDiscovery: false,
      }),
    [appId, smartWalletMode, chainKey, transports, transport, ssr],
  );

  const initialState = useMemo(
    () => (ssr ? cookieToInitialState(config, cookie) : undefined),
    [config, cookie, ssr],
  );

  const client = useMemo(
    () => queryClient ?? new QueryClient(),
    [queryClient],
  );

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export interface UseTopazIdLoginOptions {
  /** Override Topaz ID's app id (must match the connector you configured). */
  appId?: string;
  /**
   * Connect on this chain (one of your wagmi config's chains). Defaults to the
   * first configured chain.
   */
  chainId?: number;
}

/**
 * Connect/disconnect the Topaz ID wallet without touching RainbowKit's modal.
 * Locates the Topaz ID connector in your wagmi config and exposes `login`/`logout`.
 *
 * @returns `login` opens the Topaz ID consent popup; `logout` disconnects (both
 * take no arguments, so they can be passed straight to `onClick`);
 * `isPending`/`error` mirror wagmi's connect state; `connector` is the resolved
 * connector (or `undefined` if Topaz ID isn't configured). Works with wagmi 2 and 3.
 *
 * @example
 * const { login, logout } = useTopazIdLogin();
 * return <button onClick={login}>Sign in with Topaz ID</button>;
 */
export function useTopazIdLogin(options: UseTopazIdLoginOptions = {}) {
  const { connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const connectors = useConnectors();
  const appId = options.appId ?? TOPAZ_ID_APP_ID;
  const chainId = options.chainId;

  const connector = useMemo(
    () =>
      connectors.find((c) => c.id === appId) ??
      connectors.find((c) => c.type === "privy"),
    [connectors, appId],
  );

  const login = useCallback(() => {
    if (connector) connect({ connector, ...(chainId == null ? {} : { chainId }) });
  }, [connect, connector, chainId]);
  const logout = useCallback(() => disconnect(), [disconnect]);

  return { login, logout, connector, isPending, error };
}

export interface UseTopazIdClientOptions {
  /** Override Topaz ID's app id (must match the connector you configured). */
  appId?: string;
}

/**
 * High-level action client for the connected Topaz ID smart wallet. `data` is a
 * {@link TopazIdClient} — call `client.sendTransaction`, `client.sendCalls`, or
 * `client.writeContract` instead of hand-rolling Privy's smart-wallet RPC or
 * worrying about native-value/batch formatting. `data` is `undefined` while the
 * client is loading or when the connected wallet isn't Topaz ID (`isTopazId`).
 * The client follows the connected chain: after `switchChain` it is re-created
 * for the new chain.
 *
 * @example
 * const { data: topazClient } = useTopazIdClient();
 * await topazClient?.sendCalls({ calls: [approvalCall, swapCall] });
 */
export function useTopazIdClient(options: UseTopazIdClientOptions = {}) {
  const { address, connector, chainId } = useAccount();
  const appId = options.appId ?? TOPAZ_ID_APP_ID;
  const isTopazId = Boolean(address && isTopazIdConnectorId(connector?.id, appId));
  const connectorClient = useConnectorClient({ connector, query: { enabled: isTopazId } });
  const provider = connectorClient.data;

  const query = useQuery<TopazIdClient>({
    queryKey: ["topaz-id-client", address, chainId, provider?.uid],
    enabled: Boolean(isTopazId && address && provider?.request),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    queryFn: () => {
      if (!address || !provider) throw new Error("Topaz ID connector client is not ready.");
      return createTopazIdClient({
        provider: provider as TopazIdProviderLike,
        account: address,
        chainId: provider.chain.id,
      });
    },
  });

  return { ...query, isTopazId };
}

export interface UseTopazIdProfileOptions {
  baseUrl?: string;
  staleTime?: number;
}

/**
 * React Query hook for a wallet's Topaz ID profile. Disabled until `wallet` is
 * defined; cached per lowercased address. Profiles are chain-independent — the
 * smart wallet has the same address on every Topaz ID chain.
 *
 * @example
 * const { address } = useAccount();
 * const { data: profile } = useTopazIdProfile(address);
 */
export function useTopazIdProfile(
  wallet: string | undefined,
  options: UseTopazIdProfileOptions = {},
) {
  return useQuery<TopazIdProfile | null>({
    queryKey: ["topaz-id-profile", wallet?.toLowerCase()],
    queryFn: ({ signal }) =>
      fetchTopazIdProfile(wallet as string, {
        baseUrl: options.baseUrl,
        signal,
      }),
    enabled: Boolean(wallet),
    staleTime: options.staleTime ?? 60_000,
  });
}
