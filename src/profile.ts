import { TOPAZ_ID_BASE_URL } from "./constants";

/** Public profile shape returned by `GET /api/v1/profile/{wallet}`. */
export interface TopazIdProfile {
  wallet: string;
  found: boolean;
  name: string | null;
  description: string | null;
  handle: string | null;
  /** Absolute avatar URL, or null when the wallet has no avatar. */
  image: string | null;
  /** Absolute banner URL, or null. */
  banner: string | null;
  /** "#rrggbb" accent, or null. */
  accent: string | null;
  theme: string;
  links?: Record<string, unknown>;
  showcase?: Record<string, unknown>;
  followers?: number;
  following?: number;
  updatedAt: string | null;
}

export interface FetchTopazIdProfileOptions {
  /** Override the Topaz ID base URL (defaults to https://id.topazdex.com). */
  baseUrl?: string;
  signal?: AbortSignal;
}

/**
 * Fetch a wallet's public Topaz ID profile. Reads are public and CORS-open — no
 * auth, no signature. Returns `null` on a network/HTTP failure; a wallet with no
 * profile resolves to an object with `found: false`.
 */
export async function fetchTopazIdProfile(
  wallet: string,
  options: FetchTopazIdProfileOptions = {},
): Promise<TopazIdProfile | null> {
  const base = options.baseUrl ?? TOPAZ_ID_BASE_URL;
  const res = await fetch(`${base}/api/v1/profile/${wallet}`, {
    signal: options.signal,
  });
  if (!res.ok) return null;
  return (await res.json()) as TopazIdProfile;
}

export function shortenAddress(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/** Best display label: `@handle` → name → shortened address. */
export function displayNameForWallet(
  profile: TopazIdProfile | null,
  wallet: string,
): string {
  if (profile?.handle) return `@${profile.handle}`;
  if (profile?.name) return profile.name;
  return shortenAddress(wallet);
}

/** Avatar URL from the profile, or your `fallback` when there is none. */
export function avatarForWallet(
  profile: TopazIdProfile | null,
  fallback = "",
): string {
  return profile?.image ?? fallback;
}
