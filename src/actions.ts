import {
  encodeFunctionData,
  isAddress,
  numberToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { TOPAZ_ID_CHAIN_ID, TOPAZ_ID_CONNECTOR_ID } from "./constants";

/** Minimal EIP-1193 provider shape used by the Topaz ID action client. */
export interface TopazIdProviderLike {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface TopazIdCapabilities {
  /** Topaz ID smart mode executes from the user's smart contract wallet. */
  smartWallet: boolean;
  /** Multiple calls can be submitted as one smart-wallet operation. */
  batching: boolean;
  /** Topaz batches execute atomically: if one call reverts, the bundle reverts. */
  atomicBatching: boolean;
  /** Gas is sponsored by Topaz ID's paymaster policy. */
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
}

export interface TopazIdSendCallsParameters {
  calls: readonly (TopazIdCall | TopazIdContractCall)[];
}

export interface TopazIdClient {
  account: Address;
  chainId: number;
  getCapabilities(): Promise<TopazIdCapabilities>;
  sendTransaction(call: TopazIdCall | TopazIdContractCall): Promise<Hex>;
  sendCalls(parameters: TopazIdSendCallsParameters | readonly (TopazIdCall | TopazIdContractCall)[]): Promise<Hex>;
  writeContract(call: TopazIdContractCall): Promise<Hex>;
}

interface PrivySmartWalletCall {
  to: Address;
  data: Hex;
  value?: Hex;
}

function assertAddress(value: unknown, label: string): Address {
  if (typeof value === "string" && isAddress(value)) return value;
  throw new Error(`${label} must be a valid 0x-prefixed EVM address.`);
}

async function resolveAccount(provider: TopazIdProviderLike, account?: Address): Promise<Address> {
  if (account) return account;
  const accounts = await provider.request({ method: "eth_accounts" });
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first === "string" && isAddress(first)) return first;
  throw new Error("Topaz ID account is not connected.");
}

function encodeContractCall(call: TopazIdContractCall): Hex {
  return encodeFunctionData({
    abi: call.abi as Abi,
    functionName: call.functionName,
    args: call.args,
  });
}

function normalizeCall(call: TopazIdCall | TopazIdContractCall): PrivySmartWalletCall {
  if ("address" in call) {
    return {
      to: assertAddress(call.address, "call.address"),
      data: encodeContractCall(call),
      ...(call.value == null ? {} : { value: numberToHex(call.value) }),
    };
  }

  return {
    to: assertAddress(call.to, "call.to"),
    data: call.data ?? "0x",
    ...(call.value == null ? {} : { value: numberToHex(call.value) }),
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
 * Whether a wagmi connector id belongs to Topaz ID. Pass `appId` when your app
 * configures the connector with a custom app id (e.g. a staging app).
 */
export function isTopazIdConnectorId(
  connectorId: string | undefined,
  appId: string = TOPAZ_ID_CONNECTOR_ID,
): boolean {
  return connectorId != null && connectorId === appId;
}

/**
 * Create a high-level client for the Topaz ID smart wallet. Wraps Privy's
 * `privy_sendSmartWalletTx` RPC so partners get `sendTransaction`, `sendCalls`,
 * and `writeContract` without hand-rolling payloads: native `value` is encoded
 * as a lossless hex quantity and multiple calls batch into one atomic operation.
 */
export async function createTopazIdClient(options: TopazIdClientOptions): Promise<TopazIdClient> {
  const account = await resolveAccount(options.provider, options.account);
  const chainId = options.chainId ?? TOPAZ_ID_CHAIN_ID;

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
    async getCapabilities() {
      return {
        smartWallet: true,
        batching: true,
        atomicBatching: true,
        sponsored: true,
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

/**
 * Build a plain transaction call for `sendTransaction`/`sendCalls`, validating
 * the target address eagerly so mistakes fail before a consent popup opens.
 */
export function txCall(call: TopazIdCall): TopazIdCall {
  return { ...call, to: assertAddress(call.to, "call.to") };
}

/** Build a contract call that the client ABI-encodes at submit time. */
export function contractCall(call: TopazIdContractCall): TopazIdContractCall {
  return { ...call, address: assertAddress(call.address, "call.address") };
}
