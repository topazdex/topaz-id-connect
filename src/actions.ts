import {
  encodeFunctionData,
  isAddress,
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
  /**
   * Require atomic execution. When the wallet rejects the batched bundle,
   * `sendCalls` normally falls back to sequential sends (one consent popup per
   * call); pass `true` to get the batch error instead of that fallback.
   */
  atomicRequired?: boolean;
}

export interface TopazIdClient {
  account: Address;
  chainId: number;
  getCapabilities(): Promise<TopazIdCapabilities>;
  sendTransaction(call: TopazIdCall | TopazIdContractCall): Promise<Hex>;
  /**
   * Submit multiple calls as one atomic smart-wallet operation (a single consent
   * popup). If the wallet rejects the bundle, the calls are retried sequentially —
   * one popup per call — and the hash of the LAST call is returned; set
   * `atomicRequired: true` to disable that fallback.
   */
  sendCalls(parameters: TopazIdSendCallsParameters | readonly (TopazIdCall | TopazIdContractCall)[]): Promise<Hex>;
  writeContract(call: TopazIdContractCall): Promise<Hex>;
}

interface PrivySmartWalletCall {
  to: Address;
  data: Hex;
  value?: number;
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

/**
 * Topaz ID's transact popup accepts native `value` only as a plain JSON number —
 * it rejects hex quantity strings, the format wagmi/viem emit (which is why
 * value-bearing transactions fail through the raw connector). Above 2^53-1 wei
 * (~0.009 BNB) the conversion can round by sub-1000-wei dust; round amounts
 * (0.1 / 1 / 10 BNB) are exactly representable.
 */
function formatSmartWalletValue(value: bigint): number {
  return Number(value);
}

function normalizeCall(call: TopazIdCall | TopazIdContractCall): PrivySmartWalletCall {
  if ("address" in call) {
    return {
      to: assertAddress(call.address, "call.address"),
      data: encodeContractCall(call),
      ...(call.value == null ? {} : { value: formatSmartWalletValue(call.value) }),
    };
  }

  return {
    to: assertAddress(call.to, "call.to"),
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUserRejection(error: unknown): boolean {
  return /user rejected|user denied|rejected the request/i.test(errorMessage(error));
}

function isBatchUnsupported(error: unknown): boolean {
  return /unsupported|not supported|method not found|invalid|malformed|unknown|calls|batch|atomic|4200|UserOperation reverted during simulation with reason:\s*0x/i.test(
    errorMessage(error),
  );
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
 * and `writeContract` without hand-rolling payloads: native `value` is converted
 * to the wire format the Topaz popup accepts, and multiple calls batch into one
 * atomic operation (with a sequential per-call fallback when the wallet rejects
 * the bundle — see {@link TopazIdSendCallsParameters.atomicRequired}).
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

  async function sendCallsWithFallback(
    calls: readonly (TopazIdCall | TopazIdContractCall)[],
    atomicRequired: boolean,
  ): Promise<Hex> {
    if (calls.length <= 1) return sendPrivySmartWalletTx(calls);
    try {
      return await sendPrivySmartWalletTx(calls);
    } catch (error) {
      if (atomicRequired || isUserRejection(error) || !isBatchUnsupported(error)) throw error;
      let lastHash = await sendPrivySmartWalletTx([calls[0]!]);
      for (const call of calls.slice(1)) {
        lastHash = await sendPrivySmartWalletTx([call]);
      }
      return lastHash;
    }
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
      const atomicRequired =
        isSendCallsParameters(parameters) && (parameters.atomicRequired ?? false);
      return sendCallsWithFallback(normalizeCalls(parameters), atomicRequired);
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
