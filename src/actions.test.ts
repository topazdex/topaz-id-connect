import { describe, expect, it, vi } from "vitest";
import { erc20Abi, parseEther, type Address } from "viem";
import {
  contractCall,
  createTopazIdClient,
  isTopazIdConnectorId,
  txCall,
  type TopazIdProviderLike,
} from "./actions";
import { TOPAZ_ID_CONNECTOR_ID } from "./constants";

const account = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;

type MockProvider = TopazIdProviderLike & { request: ReturnType<typeof vi.fn> };

function provider(result = "0xabc"): MockProvider {
  return {
    request: vi.fn(async ({ method }) => {
      if (method === "eth_accounts") return [account];
      return result;
    }),
  };
}

function batchRejectingProvider(batchError: Error): MockProvider {
  let singles = 0;
  return {
    request: vi.fn(async ({ method, params }) => {
      if (method === "eth_accounts") return [account];
      const [payload] = params as [{ calls?: unknown }];
      if (payload.calls) throw batchError;
      singles += 1;
      return `0x${singles.toString(16)}11`;
    }),
  };
}

describe("Topaz ID action client", () => {
  it("sends native value as a JS number — the only format the Topaz popup accepts", async () => {
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

  it("rounds sub-wei dust above 2^53 wei rather than sending hex", async () => {
    const p = provider("0xfff");
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    const wei = parseEther("1.000000000000000001");
    await client.sendTransaction({ to: spender, value: wei });

    expect(wei > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(p.request).toHaveBeenCalledWith({
      method: "privy_sendSmartWalletTx",
      params: [
        {
          from: account,
          chainId: 56,
          to: spender,
          data: "0x",
          value: 1_000_000_000_000_000_000,
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
        txCall({ to: spender, data: "0x99", value: parseEther("0.01") }),
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
              value: 10_000_000_000_000_000,
            },
          ],
        },
      ],
    });
  });

  it("falls back to sequential sends when the wallet rejects the bundle", async () => {
    const p = batchRejectingProvider(new Error("Unsupported method"));
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    const hash = await client.sendCalls([
      txCall({ to: token, data: "0x01" }),
      txCall({ to: spender, data: "0x02" }),
    ]);

    expect(hash).toBe("0x211");
    expect(p.request).toHaveBeenCalledTimes(3);
    expect(p.request).toHaveBeenLastCalledWith({
      method: "privy_sendSmartWalletTx",
      params: [{ from: account, chainId: 56, to: spender, data: "0x02" }],
    });
  });

  it("surfaces the batch error when atomicRequired is set", async () => {
    const p = batchRejectingProvider(new Error("Unsupported method"));
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    await expect(
      client.sendCalls({
        calls: [txCall({ to: token, data: "0x01" }), txCall({ to: spender, data: "0x02" })],
        atomicRequired: true,
      }),
    ).rejects.toThrow("Unsupported method");
    expect(p.request).toHaveBeenCalledTimes(1);
  });

  it("does not retry sequentially after a user rejection", async () => {
    const p = batchRejectingProvider(new Error("User rejected request"));
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    await expect(
      client.sendCalls([txCall({ to: token, data: "0x01" }), txCall({ to: spender, data: "0x02" })]),
    ).rejects.toThrow("User rejected request");
    expect(p.request).toHaveBeenCalledTimes(1);
  });

  it("resolves the account from eth_accounts when omitted", async () => {
    const p = provider("0xccc");
    const client = await createTopazIdClient({ provider: p });

    expect(client.account).toBe(account);
    expect(p.request).toHaveBeenCalledWith({ method: "eth_accounts" });
  });

  it("rejects an invalid target address before opening a popup", async () => {
    const p = provider();
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    await expect(
      client.sendTransaction({ to: "0xnot-an-address" as Address }),
    ).rejects.toThrow("call.to must be a valid 0x-prefixed EVM address.");
    expect(p.request).not.toHaveBeenCalled();
  });

  it("recognizes Topaz ID connector ids, including custom app ids", () => {
    expect(isTopazIdConnectorId(TOPAZ_ID_CONNECTOR_ID)).toBe(true);
    expect(isTopazIdConnectorId("some-other-wallet")).toBe(false);
    expect(isTopazIdConnectorId(undefined)).toBe(false);
    expect(isTopazIdConnectorId("staging-app-id", "staging-app-id")).toBe(true);
  });
});
