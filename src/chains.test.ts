import { describe, expect, it } from "vitest";
import { arc, base, bsc, mainnet, robinhood, TOPAZ_ID_CHAIN, TOPAZ_ID_CHAINS, topazIdChain } from "./chains";
import {
  TOPAZ_ID_CHAIN_ID,
  TOPAZ_ID_CHAIN_IDS,
  TOPAZ_ID_CHAIN_INFO,
  isTopazIdChainId,
  isTopazIdGasSponsored,
  topazIdChainInfo,
} from "./constants";

describe("Topaz ID chains", () => {
  it("lists the five chains in the same order as the root chain ids", () => {
    expect(TOPAZ_ID_CHAINS.map((chain) => chain.id)).toEqual([...TOPAZ_ID_CHAIN_IDS]);
    expect(TOPAZ_ID_CHAIN_IDS).toEqual([56, 4663, 8453, 1, 5042]);
  });

  it("defaults to BNB Chain, the hub", () => {
    expect(TOPAZ_ID_CHAIN).toBe(bsc);
    expect(TOPAZ_ID_CHAIN_ID).toBe(56);
    expect(TOPAZ_ID_CHAINS[0]).toBe(bsc);
  });

  it("ships complete definitions for the chains viem lacks or leaves empty", () => {
    expect(robinhood.id).toBe(4663);
    expect(robinhood.rpcUrls.default.http[0]).toMatch(/^https:\/\//);
    expect(robinhood.blockExplorers?.default.url).toMatch(/^https:\/\//);
    expect(robinhood.nativeCurrency.symbol).toBe("ETH");

    expect(arc.id).toBe(5042);
    expect(arc.rpcUrls.default.http[0]).toMatch(/^https:\/\//);
    expect(arc.blockExplorers?.default.url).toMatch(/^https:\/\//);
    expect(arc.nativeCurrency).toEqual({ name: "USDC", symbol: "USDC", decimals: 18 });
  });

  it("keeps viem's definitions for the chains it already has", () => {
    expect(base.id).toBe(8453);
    expect(mainnet.id).toBe(1);
  });

  it("agrees with the framework-free chain info on every chain", () => {
    for (const chain of TOPAZ_ID_CHAINS) {
      const info = topazIdChainInfo(chain.id);
      expect(info?.nativeCurrency).toBe(chain.nativeCurrency.symbol);
      expect(info?.explorerUrl).toBe(chain.blockExplorers?.default.url);
      expect(chain.contracts?.multicall3?.address).toBeDefined();
    }
  });

  it("looks chains up by id", () => {
    expect(topazIdChain(4663)).toBe(robinhood);
    expect(topazIdChain(137)).toBeUndefined();
    expect(topazIdChain(undefined)).toBeUndefined();
  });

  it("sponsors gas on BNB Chain only", () => {
    expect(isTopazIdGasSponsored(56)).toBe(true);
    for (const id of [4663, 8453, 1, 5042]) expect(isTopazIdGasSponsored(id)).toBe(false);
    expect(isTopazIdGasSponsored(137)).toBe(false);
    expect(isTopazIdGasSponsored(undefined)).toBe(false);
    expect(Object.values(TOPAZ_ID_CHAIN_INFO).filter((info) => info.gasSponsored)).toHaveLength(1);
  });

  it("narrows chain ids", () => {
    expect(isTopazIdChainId(8453)).toBe(true);
    expect(isTopazIdChainId(10)).toBe(false);
    expect(isTopazIdChainId(undefined)).toBe(false);
  });
});
