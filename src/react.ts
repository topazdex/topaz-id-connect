import { useQuery } from "@tanstack/react-query";
import { fetchTopazIdProfile, type TopazIdProfile } from "./profile";

export interface UseTopazIdProfileOptions {
  baseUrl?: string;
  staleTime?: number;
}

/**
 * React Query hook for a wallet's Topaz ID profile. Disabled until `wallet` is
 * defined; cached per lowercased address.
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
