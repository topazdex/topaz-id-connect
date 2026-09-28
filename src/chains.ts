import { defineChain, type Chain } from "viem";
import { base, bsc, mainnet } from "viem/chains";

export { base, bsc, mainnet };

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11" as const;

/** Robinhood Chain (4663). The smart wallet pays gas in ETH. */
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://robin.etherscan.io" },
    blockscout: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: { multicall3: { address: MULTICALL3 } },
});

/**
 * Arc (5042). The native currency is USDC with 18 decimals; the same balance is
 * also exposed as a 6-decimal ERC-20 at `0x3600000000000000000000000000000000000000`.
 * viem's own `arc` definition ships without RPC or explorer URLs, so use this one.
 */
export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
  contracts: { multicall3: { address: MULTICALL3 } },
});

/**
 * Every chain a Topaz ID smart wallet operates on, as viem `Chain` objects:
 * BNB Chain, Robinhood Chain, Base, Ethereum, Arc (the same order as
 * `TOPAZ_ID_CHAIN_IDS` on the root entry). Pass a subset to your wagmi config or
 * to `createTopazIdProvider`; the first entry is the chain Topaz ID connects on.
 */
export const TOPAZ_ID_CHAINS = [bsc, robinhood, base, mainnet, arc] as const satisfies readonly [
  Chain,
  ...Chain[],
];

/** BNB Chain (56) — Topaz ID's hub chain, and the default when none is chosen. */
export const TOPAZ_ID_CHAIN = bsc;

/** The viem `Chain` for a Topaz ID chain id, or `undefined` for any other id. */
export function topazIdChain(chainId: number | undefined): Chain | undefined {
  return TOPAZ_ID_CHAINS.find((chain) => chain.id === chainId);
}
