import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo, type ReactNode } from "react";
import type { Transport } from "viem";
import {
  cookieStorage,
  cookieToInitialState,
  createConfig,
  createStorage,
  http,
  useConnect,
  useDisconnect,
  WagmiProvider,
} from "wagmi";
import { TOPAZ_ID_APP_ID } from "./constants";
import { topazIdConnector, TOPAZ_ID_CHAIN } from "./connectors";
import { fetchTopazIdProfile, type TopazIdProfile } from "./profile";

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
  /** Custom RPC transport for BNB Chain. Defaults to a public `http()` endpoint. */
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
 * One-line setup for Topaz ID. Wraps your app in a wagmi config (BNB Chain +
 * the Topaz ID connector) and a React Query provider — no `createConfig` or
 * `QueryClientProvider` of your own. Pair with {@link useTopazIdLogin} to connect.
 *
 * Draw the `"use client"` boundary in your app (e.g. a Next.js client component);
 * this library stays framework-agnostic.
 *
 * @example
 * "use client";
 * import { TopazIdProvider } from "@topazdex/id-connect/react";
 *
 * export function Providers({ children }: { children: React.ReactNode }) {
 *   return <TopazIdProvider>{children}</TopazIdProvider>;
 * }
 */
export function TopazIdProvider({
  children,
  appId,
  smartWalletMode,
  transport,
  queryClient,
  ssr = true,
  cookie,
}: TopazIdProviderProps) {
  const config = useMemo(
    () =>
      createConfig({
        chains: [TOPAZ_ID_CHAIN],
        transports: { [TOPAZ_ID_CHAIN.id]: transport ?? http() },
        connectors: [topazIdConnector({ appId, smartWalletMode })],
        ssr,
        storage: ssr
          ? createStorage({ storage: cookieStorage })
          : undefined,
        multiInjectedProviderDiscovery: false,
      }),
    [appId, smartWalletMode, transport, ssr],
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
}

/**
 * Connect/disconnect the Topaz ID wallet without touching RainbowKit's modal.
 * Locates the Topaz ID connector in your wagmi config and exposes `login`/`logout`.
 *
 * @returns `login` opens the Topaz ID consent popup; `logout` disconnects;
 * `isPending`/`error` mirror wagmi's connect state; `connector` is the resolved
 * connector (or `undefined` if Topaz ID isn't configured).
 *
 * @example
 * const { login, logout } = useTopazIdLogin();
 * return <button onClick={login}>Sign in with Topaz ID</button>;
 */
export function useTopazIdLogin(options: UseTopazIdLoginOptions = {}) {
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const appId = options.appId ?? TOPAZ_ID_APP_ID;

  const connector = useMemo(
    () =>
      connectors.find((c) => c.id === appId) ??
      connectors.find((c) => c.type === "privy"),
    [connectors, appId],
  );

  const login = useCallback(() => {
    if (connector) connect({ connector });
  }, [connect, connector]);

  return { login, logout: disconnect, connector, isPending, error };
}

export interface UseTopazIdProfileOptions {
  baseUrl?: string;
  staleTime?: number;
}

/**
 * React Query hook for a wallet's Topaz ID profile. Disabled until `wallet` is
 * defined; cached per lowercased address.
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
