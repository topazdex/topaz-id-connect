import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { TOPAZ_ID_CONNECTOR_ID } from "./constants";

/** Minimal EIP-1193 provider shape used by the Topaz ID action client. */
export interface TopazIdProviderLike {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export type TopazIdSponsorshipMode = "sponsored" | "user-paid" | "auto";

export interface TopazIdCapabilities {
  /** True when the provider is recognized as Topaz ID's smart-wallet connector. */
  topazId: boolean;
  /** Topaz ID smart mode executes from the user's smart contract wallet. */
  smartWallet: boolean;
  /** Multiple calls can be submitted as one smart-wallet operation. */
  batching: boolean;
  /** Topaz batches execute atomically: if one call reverts, the bundle reverts. */
  atomicBatching: boolean;
  /** Whether a paymaster/sponsorship path is available for this client mode. */
  sponsored: boolean;
  /** Native BNB value is supported on both single calls and batched calls. */
  nativeValue: boolean;
  chainId: number;
}

export interface TopazIdCall {
  to: Address;
  /** Calldata. Defaults to `0x` for plain native transfers. */
  data?: Hex;
  /** Native value in wei. */
  value?: bigint;
}

export interface TopazIdContractCall {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface TopazIdClientOptions {
  provider: TopazIdProviderLike;
  /** Connected account. Defaults to `eth_accounts[0]` when omitted. */
  account?: Address;
  /** Chain id. Defaults to BNB Chain (56). */
  chainId?: number;
  /** Defaults to `auto`. Reserved for future user-paid/paymaster selection. */
  sponsorship?: TopazIdSponsorshipMode;
  /** Connector id, used only for metadata/capability reporting. */
  connectorId?: string;
}

export interface TopazIdSendCallsParameters {
  calls: readonly (TopazIdCall | TopazIdContractCall)[];
  /** Topaz smart-wallet bundles are atomic by default. */
  atomicRequired?: boolean;
}

export interface TopazIdClient {
  account: Address;
  chainId: number;
  sponsorship: TopazIdSponsorshipMode;
  getCapabilities(): Promise<TopazIdCapabilities>;
  sendTransaction(call: TopazIdCall | TopazIdContractCall): Promise<Hex>;
  sendCalls(parameters: TopazIdSendCallsParameters | readonly (TopazIdCall | TopazIdContractCall)[]): Promise<Hex>;
  writeContract(call: TopazIdContractCall): Promise<Hex>;
}

interface PrivySmartWalletCall {
  to: Address;
  data: Hex;
  value?: number;
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function assertAddress(value: unknown, label: string): Address {
  if (isAddress(value)) return value;
  throw new Error(`${label} must be a 0x-prefixed EVM address.`);
}

async function resolveAccount(provider: TopazIdProviderLike, account?: Address): Promise<Address> {
  if (account) return account;
  const accounts = await provider.request({ method: "eth_accounts" });
  if (Array.isArray(accounts) && isAddress(accounts[0])) return accounts[0];
  throw new Error("Topaz ID account is not connected.");
}

function encodeContractCall(call: TopazIdContractCall): Hex {
  return encodeFunctionData({
    abi: call.abi,
    functionName: call.functionName,
    args: call.args,
  } as never);
}

function normalizeCall(call: TopazIdCall | TopazIdContractCall): PrivySmartWalletCall {
  if ("address" in call) {
    return {
      to: call.address,
      data: encodeContractCall(call),
      ...(call.value == null ? {} : { value: formatSmartWalletValue(call.value) }),
    };
  }

  return {
    to: call.to,
    data: call.data ?? "0x",
    ...(call.value == null ? {} : { value: formatSmartWalletValue(call.value) }),
  };
}

function isSendCallsParameters(
  parameters: TopazIdSendCallsParameters | readonly (TopazIdCall | TopazIdContractCall)[],
): parameters is TopazIdSendCallsParameters {
  return !Array.isArray(parameters);
}

function normalizeCalls(
  parameters: TopazIdSendCallsParameters | readonly (TopazIdCall | TopazIdContractCall)[],
): readonly (TopazIdCall | TopazIdContractCall)[] {
  return isSendCallsParameters(parameters) ? parameters.calls : parameters;
}

function assertHash(value: unknown, action: string): Hex {
  if (typeof value === "string" && value.startsWith("0x")) return value as Hex;
  throw new Error(`Topaz ID ${action} was accepted, but no transaction hash was returned.`);
}

/**
 * Privy's Topaz smart-wallet RPC accepts native `value` as a JS number. Keeping
 * this normalization inside the SDK prevents partner apps from discovering the
 * bigint/hex incompatibility themselves.
 */
export function formatSmartWalletValue(value: bigint): number {
  return Number(value);
}

export function isTopazIdConnectorId(connectorId: string | undefined): boolean {
  return connectorId === TOPAZ_ID_CONNECTOR_ID;
}

export async function createTopazIdClient(options: TopazIdClientOptions): Promise<TopazIdClient> {
  const account = await resolveAccount(options.provider, options.account);
  const chainId = options.chainId ?? 56;
  const sponsorship = options.sponsorship ?? "auto";

  async function sendPrivySmartWalletTx(calls: readonly (TopazIdCall | TopazIdContractCall)[]): Promise<Hex> {
    if (!calls.length) throw new Error("At least one call is required.");

    const encoded = calls.map(normalizeCall);
    const payload =
      encoded.length === 1
        ? {
            from: account,
            chainId,
            to: encoded[0]!.to,
            data: encoded[0]!.data,
            ...(encoded[0]!.value == null ? {} : { value: encoded[0]!.value }),
          }
        : {
            from: account,
            chainId,
            calls: encoded,
          };

    const result = await options.provider.request({
      method: "privy_sendSmartWalletTx",
      params: [payload],
    });
    return assertHash(result, encoded.length === 1 ? "transaction" : "call bundle");
  }

  return {
    account,
    chainId,
    sponsorship,
    async getCapabilities() {
      return {
        topazId: isTopazIdConnectorId(options.connectorId),
        smartWallet: true,
        batching: true,
        atomicBatching: true,
        sponsored: sponsorship !== "user-paid",
        nativeValue: true,
        chainId,
      };
    },
    sendTransaction(call) {
      return sendPrivySmartWalletTx([call]);
    },
    sendCalls(parameters) {
      return sendPrivySmartWalletTx(normalizeCalls(parameters));
    },
    writeContract(call) {
      return sendPrivySmartWalletTx([call]);
    },
  };
}

/** Convenience helper for raw EIP-1193 providers. */
export async function getTopazIdClient(options: TopazIdClientOptions): Promise<TopazIdClient> {
  return createTopazIdClient(options);
}

/**
 * Build a plain transaction call. Useful when mirroring Abstract AGW examples:
 * `client.sendCalls([txCall(...), contractCall(...)])`.
 */
export function txCall(call: TopazIdCall): TopazIdCall {
  return { ...call, to: assertAddress(call.to, "call.to") };
}

/** Build a contract call that the client ABI-encodes at submit time. */
export function contractCall(call: TopazIdContractCall): TopazIdContractCall {
  return { ...call, address: assertAddress(call.address, "call.address") };
}
