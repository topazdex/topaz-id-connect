import {
  PrivyProvider,
  useCrossAppAccounts,
  usePrivy,
  type CrossAppAccountWithMetadata,
  type LoginMethodOrderOption,
  type PrivyProviderProps,
} from "@privy-io/react-auth";
import { useCallback } from "react";
import { TOPAZ_ID_APP_ID } from "./constants";

/**
 * The Topaz ID cross-app login method, ready to drop into a Privy app's
 * `config.loginMethodsAndOrder`. Use this when your app is itself a Privy app.
 *
 * @example
 * <PrivyProvider
 *   appId={MY_APP_ID}
 *   config={{ loginMethodsAndOrder: { primary: ["email", "wallet", topazIdLoginMethod] } }}
 * >
 */
export const topazIdLoginMethod: LoginMethodOrderOption = `privy:${TOPAZ_ID_APP_ID}`;

export interface UseTopazIdCrossAppLoginOptions {
  /** Override Topaz ID's app id (e.g. to target a staging app). */
  appId?: string;
}

/**
 * Login/link Topaz ID as a cross-app account inside your own Privy app.
 *
 * @returns `login` prompts a fresh sign-in with Topaz ID; `link` attaches a Topaz
 * ID account to the already-authenticated user. Both resolve to the updated `User`.
 *
 * @example
 * const { login } = useTopazIdCrossAppLogin();
 * return <button onClick={login}>Continue with Topaz ID</button>;
 */
export function useTopazIdCrossAppLogin(
  options: UseTopazIdCrossAppLoginOptions = {},
) {
  const { loginWithCrossAppAccount, linkCrossAppAccount } =
    useCrossAppAccounts();
  const appId = options.appId ?? TOPAZ_ID_APP_ID;

  const login = useCallback(
    () => loginWithCrossAppAccount({ appId }),
    [loginWithCrossAppAccount, appId],
  );
  const link = useCallback(
    () => linkCrossAppAccount({ appId }),
    [linkCrossAppAccount, appId],
  );

  return { login, link };
}

export interface TopazIdCrossAppAccount {
  /**
   * The user's Topaz ID **smart contract wallet** — their canonical on-chain
   * identity, and the address to display and to look profiles up by. `undefined`
   * until a Topaz ID account is linked (and the provider has smart wallets enabled).
   */
  address: string | undefined;
  /**
   * The embedded EOA that signs for the smart wallet. Signer-only — never treat it
   * as the user's on-chain identity (funds live on the smart wallet).
   */
  signerAddress: string | undefined;
}

/**
 * Read the linked Topaz ID account off the authenticated Privy user. Returns the
 * smart contract wallet as `address` and the embedded signer EOA as `signerAddress`.
 * Use this on the `/privy` cross-app path instead of reading `embeddedWallets[0]`,
 * which is only the signer.
 *
 * @example
 * const { address } = useTopazIdAccount();
 * // const { data: profile } = useTopazIdProfile(address); // from /react
 */
export function useTopazIdAccount(
  options: UseTopazIdCrossAppLoginOptions = {},
): TopazIdCrossAppAccount {
  const { user } = usePrivy();
  const appId = options.appId ?? TOPAZ_ID_APP_ID;

  const account = user?.linkedAccounts.find(
    (entry): entry is CrossAppAccountWithMetadata =>
      entry.type === "cross_app" && entry.providerApp.id === appId,
  );

  return {
    address: account?.smartWallets[0]?.address,
    signerAddress: account?.embeddedWallets[0]?.address,
  };
}

export interface TopazIdPrivyProviderProps extends PrivyProviderProps {}

/**
 * A thin `PrivyProvider` wrapper that adds Topaz ID to your login methods. Pass
 * your own `appId` and `config`; Topaz ID is prepended to
 * `config.loginMethodsAndOrder.primary` (deduped), leaving the rest untouched.
 *
 * @example
 * <TopazIdPrivyProvider appId={MY_APP_ID} config={{ loginMethodsAndOrder: { primary: ["email"] } }}>
 *   <App />
 * </TopazIdPrivyProvider>
 */
export function TopazIdPrivyProvider({
  config,
  children,
  ...rest
}: TopazIdPrivyProviderProps) {
  const existing = config?.loginMethodsAndOrder?.primary ?? [];
  const primary: [LoginMethodOrderOption, ...LoginMethodOrderOption[]] = [
    topazIdLoginMethod,
    ...existing.filter((method) => method !== topazIdLoginMethod),
  ];

  const mergedConfig: PrivyProviderProps["config"] = {
    ...config,
    loginMethodsAndOrder: {
      ...config?.loginMethodsAndOrder,
      primary,
    },
  };

  return (
    <PrivyProvider {...rest} config={mergedConfig}>
      {children}
    </PrivyProvider>
  );
}
