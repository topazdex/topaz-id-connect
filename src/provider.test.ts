import { beforeEach, describe, expect, it, vi } from "vitest";
import { toPrivyWalletProvider } from "@privy-io/cross-app-connect";
import { arc, base, robinhood, TOPAZ_ID_CHAINS } from "./chains";
import { TOPAZ_ID_APP_ID } from "./constants";
import {
  connectTopazId,
  createTopazIdProvider,
  disconnectTopazId,
  TopazIdChainNotConfiguredError,
} from "./provider";

vi.mock("@privy-io/cross-app-connect", () => ({
  toPrivyWalletProvider: vi.fn(() => ({
    on: vi.fn(),
    removeListener: vi.fn(),
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
      if (method === "eth_chainId") return 8453;
      return null;
    }),
  })),
}));

const mocked = vi.mocked(toPrivyWalletProvider);

function lastRawProvider() {
  const raw = mocked.mock.results[mocked.mock.results.length - 1]?.value as
    | { request: ReturnType<typeof vi.fn> }
    | undefined;
  if (!raw) throw new Error("toPrivyWalletProvider was not called");
  return raw;
}

beforeEach(() => {
  mocked.mockClear();
});

describe("createTopazIdProvider", () => {
  it("configures Privy with Topaz ID's app id, smart-wallet mode, and every Topaz ID chain by default", () => {
    createTopazIdProvider();

    expect(mocked).toHaveBeenCalledWith({
      providerAppId: TOPAZ_ID_APP_ID,
      chains: TOPAZ_ID_CHAINS,
      chainId: 56,
      smartWalletMode: true,
    });
  });

  it("connects on the first listed chain when chainId is omitted", () => {
    createTopazIdProvider({ chains: [robinhood, arc] });

    expect(mocked).toHaveBeenLastCalledWith(
      expect.objectContaining({ chains: [robinhood, arc], chainId: 4663 }),
    );
  });

  it("forwards transports, a custom app id, legacy mode, and the popup timeout", () => {
    const transports = { [base.id]: (() => ({})) as never };
    createTopazIdProvider({
      chains: [base],
      transports,
      appId: "staging-app",
      smartWalletMode: false,
      defaultPopupTimeout: 5_000,
    });

    expect(mocked).toHaveBeenLastCalledWith({
      providerAppId: "staging-app",
      chains: [base],
      chainId: 8453,
      transports,
      smartWalletMode: false,
      defaultPopupTimeout: 5_000,
    });
  });

  it("rejects a chainId outside the configured chains up front", () => {
    expect(() => createTopazIdProvider({ chains: [base], chainId: 56 })).toThrow(
      TopazIdChainNotConfiguredError,
    );
    expect(mocked).not.toHaveBeenCalled();
  });

  it("refuses chain switches outside the configured chains with EIP-1193 code 4902", async () => {
    const provider = createTopazIdProvider({ chains: [base, robinhood] });

    const failure = provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x38" }],
    });
    await expect(failure).rejects.toMatchObject({ code: 4902 });
    await expect(failure).rejects.toThrow(/Base \(8453\), Robinhood Chain \(4663\)/);
    expect(lastRawProvider().request).not.toHaveBeenCalled();
  });

  it("passes configured chain switches and every other method through", async () => {
    const provider = createTopazIdProvider({ chains: [base, robinhood] });

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1237" }],
    });
    await provider.request({ method: "eth_blockNumber" });

    expect(lastRawProvider().request).toHaveBeenNthCalledWith(1, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1237" }],
    });
    expect(lastRawProvider().request).toHaveBeenNthCalledWith(2, { method: "eth_blockNumber" });
  });
});

describe("connectTopazId", () => {
  it("opens the popup, then reads the account and chain separately", async () => {
    const provider = createTopazIdProvider({ chains: [base] });

    const connection = await connectTopazId(provider);

    expect(connection).toEqual({
      account: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
    });
    const methods = lastRawProvider().request.mock.calls.map(([args]) => (args as { method: string }).method);
    expect(methods).toEqual(["eth_requestAccounts", "eth_accounts", "eth_chainId"]);
  });

  it("switches to the requested chain after sign-in", async () => {
    const provider = createTopazIdProvider({ chains: [base, robinhood] });

    await connectTopazId(provider, { chainId: 4663 });

    expect(lastRawProvider().request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1237" }],
    });
  });

  it("fails clearly when no account comes back", async () => {
    const provider = { request: vi.fn(async () => []) };

    await expect(connectTopazId(provider)).rejects.toThrow(/did not return an account/);
  });
});

describe("disconnectTopazId", () => {
  it("revokes the eth_accounts permission", async () => {
    const provider = createTopazIdProvider({ chains: [base] });

    await disconnectTopazId(provider);

    expect(lastRawProvider().request).toHaveBeenCalledWith({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  });
});
