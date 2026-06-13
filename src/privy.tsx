import {
  PrivyProvider,
  useCrossAppAccounts,
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
