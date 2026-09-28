import { describe, expect, it, vi } from "vitest";
import { erc20Abi, parseEther, toEventSelector, type Address, type Hex } from "viem";
import {
  contractCall,
  createTopazIdClient,
  ENTRY_POINT_ADDRESSES,
  isExactTopazIdValue,
  isTopazIdConnectorId,
  roundUpTopazIdValue,
  txCall,
  USER_OPERATION_EVENT_TOPIC,
  waitForTopazIdReceipt,
  type TopazIdLog,
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

const receiptHash = "0xdeadbeef" as Hex;
const receipt = { transactionHash: receiptHash, status: "0x1" };

function receiptPolls(p: MockProvider): number {
  return p.request.mock.calls.filter(
    ([args]) => (args as { method: string }).method === "eth_getTransactionReceipt",
  ).length;
}

function receiptProvider(nullsBeforeReceipt: number): MockProvider {
  let polls = 0;
  return {
    request: vi.fn(async ({ method }) => {
      if (method === "eth_accounts") return [account];
      if (method === "eth_getTransactionReceipt") {
        polls += 1;
        return polls > nullsBeforeReceipt ? receipt : null;
      }
      return "0xabc";
    }),
  };
}

describe("waitForTopazIdReceipt", () => {
  it("polls until the receipt appears", async () => {
    // #given a provider that returns null twice, then the receipt
    const p = receiptProvider(2);

    // #when
    const result = await waitForTopazIdReceipt({
      provider: p,
      hash: receiptHash,
      pollingInterval: 1,
    });

    // #then it returns the receipt after polling
    expect(result).toEqual(receipt);
    expect(p.request).toHaveBeenCalledWith({
      method: "eth_getTransactionReceipt",
      params: [receiptHash],
    });
    expect(receiptPolls(p)).toBe(3);
  });

  it("resolves null when the receipt never resolves within the timeout", async () => {
    // #given a provider whose receipt never resolves
    const p = receiptProvider(Number.POSITIVE_INFINITY);

    // #when the timeout elapses
    const result = await waitForTopazIdReceipt({
      provider: p,
      hash: receiptHash,
      timeout: 10,
      pollingInterval: 2,
    });

    // #then it gives up rather than hanging
    expect(result).toBeNull();
  });

  it("polls at least once even with a zero timeout", async () => {
    // #given a provider whose receipt is not yet available
    const p = receiptProvider(Number.POSITIVE_INFINITY);

    // #when timeout is zero
    const result = await waitForTopazIdReceipt({ provider: p, hash: receiptHash, timeout: 0 });

    // #then one attempt is made, then it returns null
    expect(result).toBeNull();
    expect(receiptPolls(p)).toBe(1);
  });

  it("throws AbortError when the signal is already aborted", async () => {
    // #given an aborted signal
    const p = receiptProvider(0);
    const controller = new AbortController();
    controller.abort();

    // #when / #then it rejects before polling
    await expect(
      waitForTopazIdReceipt({ provider: p, hash: receiptHash, signal: controller.signal }),
    ).rejects.toThrow(/aborted/i);
    expect(p.request).not.toHaveBeenCalled();
  });

  it("is exposed as a client method bound to the client's provider", async () => {
    // #given a client whose provider resolves the receipt on the first poll
    const p = receiptProvider(0);
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    // #when
    const result = await client.waitForReceipt(receiptHash);

    // #then
    expect(result).toEqual(receipt);
  });
});

describe("chain resolution and capabilities", () => {
  function chainProvider(chainId: unknown): MockProvider {
    return {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_accounts") return [account];
        if (method === "eth_chainId") return chainId;
        return "0xabc";
      }),
    };
  }

  it("reads the chain from the provider when chainId is omitted", async () => {
    const client = await createTopazIdClient({ provider: chainProvider("0x1237"), account });
    expect(client.chainId).toBe(4663);
  });

  it("falls back to BNB Chain when the provider cannot report a chain", async () => {
    const failing: MockProvider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_chainId") throw new Error("nope");
        return [account];
      }),
    };
    expect((await createTopazIdClient({ provider: failing, account })).chainId).toBe(56);
    expect((await createTopazIdClient({ provider: chainProvider(undefined), account })).chainId).toBe(56);
  });

  it("stamps every payload with the client's chain", async () => {
    const p = chainProvider("0x2105");
    const client = await createTopazIdClient({ provider: p, account });

    await client.sendTransaction({ to: spender });

    expect(p.request).toHaveBeenLastCalledWith({
      method: "privy_sendSmartWalletTx",
      params: [{ from: account, chainId: 8453, to: spender, data: "0x" }],
    });
  });

  it("reports sponsorship only on BNB Chain", async () => {
    const bnb = await createTopazIdClient({ provider: provider(), account, chainId: 56 });
    const robinhood = await createTopazIdClient({ provider: provider(), account, chainId: 4663 });
    const arc = await createTopazIdClient({ provider: provider(), account, chainId: 5042 });

    expect((await bnb.getCapabilities()).sponsored).toBe(true);
    expect((await robinhood.getCapabilities()).sponsored).toBe(false);
    expect((await arc.getCapabilities())).toMatchObject({ sponsored: false, chainId: 5042, nativeValue: true });
  });
});

describe("native value precision", () => {
  it("treats every amount up to 2^53-1 wei as exact", () => {
    expect(isExactTopazIdValue(0n)).toBe(true);
    expect(isExactTopazIdValue(1n)).toBe(true);
    expect(isExactTopazIdValue(BigInt(Number.MAX_SAFE_INTEGER))).toBe(true);
    expect(isExactTopazIdValue(parseEther("1"))).toBe(true);
    expect(isExactTopazIdValue(parseEther("0.15"))).toBe(true);
  });

  it("flags amounts that would be rounded on the wire", () => {
    expect(isExactTopazIdValue(BigInt(Number.MAX_SAFE_INTEGER) + 2n)).toBe(false);
    expect(isExactTopazIdValue(parseEther("1.000000000000000001"))).toBe(false);
    expect(isExactTopazIdValue(-1n)).toBe(false);
  });

  it("rounds up to the next exactly representable amount", () => {
    const fee = parseEther("0.123456789012345678");
    const payable = roundUpTopazIdValue(fee);

    expect(payable).toBeGreaterThanOrEqual(fee);
    expect(payable - fee).toBeLessThan(1_000n);
    expect(isExactTopazIdValue(payable)).toBe(true);
    expect(BigInt(Number(payable))).toBe(payable);
  });

  it("leaves exact amounts untouched", () => {
    expect(roundUpTopazIdValue(parseEther("1"))).toBe(parseEther("1"));
    expect(roundUpTopazIdValue(BigInt(Number.MAX_SAFE_INTEGER))).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    expect(roundUpTopazIdValue(0n)).toBe(0n);
    expect(() => roundUpTopazIdValue(-1n)).toThrow(RangeError);
  });
});

describe("UserOperation-aware receipts", () => {
  it("pins the UserOperationEvent topic to its keccak selector", () => {
    expect(USER_OPERATION_EVENT_TOPIC).toBe(
      toEventSelector("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)"),
    );
  });

  const entryPoint = ENTRY_POINT_ADDRESSES[0];
  const userOpHash = "0x1234567890123456789012345678901234567890123456789012345678901234" as Hex;
  const bundleHash = "0xbbbb" as Hex;
  const sponsor = "0x4444444444444444444444444444444444444444" as Address;
  const other = "0x5555555555555555555555555555555555555555" as Address;

  function topicFor(address: Address): Hex {
    return `0x${address.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
  }

  function userOperationEvent(sender: Address, success: boolean, hash = userOpHash): TopazIdLog {
    const word = (value: bigint) => value.toString(16).padStart(64, "0");
    return {
      address: entryPoint,
      topics: [USER_OPERATION_EVENT_TOPIC, hash, topicFor(sender), topicFor(sponsor)],
      data: `0x${word(7n)}${word(success ? 1n : 0n)}${word(1_000n)}${word(50_000n)}` as Hex,
      transactionHash: bundleHash,
    };
  }

  function bundleReceipt(logs: TopazIdLog[]) {
    return { transactionHash: bundleHash, status: "0x1", logs };
  }

  function providerWith(handlers: Record<string, (params: unknown[] | undefined) => unknown>): MockProvider {
    return {
      request: vi.fn(async ({ method, params }) => {
        if (method === "eth_accounts") return [account];
        const handler = handlers[method];
        return handler ? handler(params) : null;
      }),
    };
  }

  it("marks the receipt failed when the user's operation reverted inside a successful bundle", async () => {
    const p = providerWith({
      eth_getTransactionReceipt: () => bundleReceipt([userOperationEvent(account, false)]),
    });

    const result = await waitForTopazIdReceipt({ provider: p, hash: bundleHash, account });

    expect(result).toMatchObject({
      status: "0x0",
      userOperation: { hash: userOpHash, sender: account, success: false },
    });
  });

  it("picks the sender's operation out of a shared bundle", async () => {
    const p = providerWith({
      eth_getTransactionReceipt: () =>
        bundleReceipt([
          userOperationEvent(other, false, "0x9999999999999999999999999999999999999999999999999999999999999999"),
          userOperationEvent(account, true),
        ]),
    });

    const result = await waitForTopazIdReceipt({ provider: p, hash: bundleHash, account });

    expect(result).toMatchObject({ status: "0x1", userOperation: { sender: account, success: true } });
  });

  it("leaves a receipt untouched when the operation cannot be told apart", async () => {
    const receiptWithTwo = bundleReceipt([
      userOperationEvent(other, false, "0x9999999999999999999999999999999999999999999999999999999999999999"),
      userOperationEvent(account, true),
    ]);
    const p = providerWith({ eth_getTransactionReceipt: () => receiptWithTwo });

    const result = await waitForTopazIdReceipt({ provider: p, hash: bundleHash });

    expect(result).toEqual(receiptWithTwo);
    expect(result?.userOperation).toBeUndefined();
  });

  it("resolves a UserOperation hash through the EntryPoint's logs", async () => {
    const p = providerWith({
      eth_blockNumber: () => "0x3e8",
      eth_getTransactionReceipt: (params) =>
        params?.[0] === bundleHash ? bundleReceipt([userOperationEvent(account, true)]) : null,
      eth_getLogs: (params) => {
        const [filter] = params as [{ topics: Hex[]; fromBlock: Hex; toBlock: string; address: string[] }];
        expect(filter.topics).toEqual([USER_OPERATION_EVENT_TOPIC, userOpHash]);
        expect(filter.fromBlock).toBe("0x2ee");
        expect(filter.toBlock).toBe("latest");
        expect(filter.address).toEqual([...ENTRY_POINT_ADDRESSES]);
        return [{ transactionHash: bundleHash }];
      },
    });

    const result = await waitForTopazIdReceipt({ provider: p, hash: userOpHash, pollingInterval: 1 });

    expect(result).toMatchObject({
      transactionHash: bundleHash,
      status: "0x1",
      userOperation: { hash: userOpHash, sender: account, success: true },
    });
  });

  it("keeps polling when the RPC refuses the log query", async () => {
    let polls = 0;
    const p = providerWith({
      eth_blockNumber: () => "0x10",
      eth_getLogs: () => {
        throw new Error("query returned more than 10000 results");
      },
      eth_getTransactionReceipt: () => (++polls > 2 ? receipt : null),
    });

    const result = await waitForTopazIdReceipt({ provider: p, hash: receiptHash, pollingInterval: 1 });

    expect(result).toEqual(receipt);
  });

  it("clamps the lookback at the genesis block", async () => {
    const p = providerWith({
      eth_blockNumber: () => "0x10",
      eth_getLogs: (params) => {
        expect((params as [{ fromBlock: Hex }])[0].fromBlock).toBe("0x0");
        return [];
      },
    });

    await waitForTopazIdReceipt({ provider: p, hash: userOpHash, timeout: 0 });
  });

  it("scopes the client's waitForReceipt to the client's account", async () => {
    const p = providerWith({
      eth_getTransactionReceipt: () =>
        bundleReceipt([
          userOperationEvent(other, true, "0x9999999999999999999999999999999999999999999999999999999999999999"),
          userOperationEvent(account, false),
        ]),
    });
    const client = await createTopazIdClient({ provider: p, account, chainId: 56 });

    const result = await client.waitForReceipt(bundleHash);

    expect(result).toMatchObject({ status: "0x0", userOperation: { sender: account, success: false } });
  });
});
