import { describe, expect, it, vi } from "vitest";
import { erc20Abi, parseEther, type Address } from "viem";
import {
  contractCall,
  createTopazIdClient,
  formatSmartWalletValue,
  txCall,
  type TopazIdProviderLike,
} from "./actions";

const account = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;

function provider(result = "0xabc"): TopazIdProviderLike & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async ({ method }) => {
      if (method === "eth_accounts") return [account];
      return result;
    }),
  };
}

describe("Topaz ID action client", () => {
  it("normalizes native value for the smart-wallet RPC", () => {
    expect(formatSmartWalletValue(parseEther("0.01"))).toBe(Number(parseEther("0.01")));
  });

  it("sends a single transaction through privy_sendSmartWalletTx", async () => {
    const p = provider("0xaaa");
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    const hash = await client.sendTransaction(
      txCall({ to: spender, data: "0x1234", value: 1n }),
    );

    expect(hash).toBe("0xaaa");
    expect(p.request).toHaveBeenCalledWith({
      method: "privy_sendSmartWalletTx",
      params: [
        {
          from: account,
          chainId: 56,
          to: spender,
          data: "0x1234",
          value: 1,
        },
      ],
    });
  });

  it("batches contract calls as one smart-wallet operation", async () => {
    const p = provider("0xbbb");
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    const hash = await client.sendCalls({
      calls: [
        contractCall({
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, 5n],
        }),
        txCall({ to: spender, data: "0x99" }),
      ],
    });

    expect(hash).toBe("0xbbb");
    expect(p.request).toHaveBeenLastCalledWith({
      method: "privy_sendSmartWalletTx",
      params: [
        {
          from: account,
          chainId: 56,
          calls: [
            {
              to: token,
              data: expect.stringMatching(/^0x095ea7b3/),
            },
            {
              to: spender,
              data: "0x99",
            },
          ],
        },
      ],
    });
  });

  it("resolves the account from eth_accounts when omitted", async () => {
    const p = provider("0xccc");
    const client = await createTopazIdClient({ provider: p });

    expect(client.account).toBe(account);
    expect(p.request).toHaveBeenCalledWith({ method: "eth_accounts" });
  });
});
