import {
  encodeFunctionData,
  getAddress,
  isAddress,
  numberToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  TOPAZ_ID_CHAIN_ID,
  TOPAZ_ID_CONNECTOR_ID,
  isTopazIdGasSponsored,
} from "./constants";

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
  /**
   * Gas is paid by Topaz ID's paymaster on this chain (BNB Chain today). When
   * `false` the smart wallet pays gas from its own native balance, so it must
   * hold enough of the chain's currency for `value` **plus** gas.
   */
  sponsored: boolean;
  /** Native value (BNB, ETH, or USDC on Arc) is supported on single and batched calls. */
  nativeValue: boolean;
  chainId: number;
}

export interface TopazIdCall {
  to: Address;
  /** Calldata. Defaults to `0x` for plain native transfers. */
  data?: Hex;
  /** Native value in wei (the chain's smallest native unit). */
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
  /**
   * Chain the client submits on. Defaults to the provider's current chain
   * (`eth_chainId`), falling back to BNB Chain (56) if the provider can't say.
   * It must be a chain the provider was configured with — create one client per
   * chain, or re-create it after a chain switch.
   */
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

/** A raw `eth_getTransactionReceipt` log entry, as the RPC returns it. */
export interface TopazIdLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
  transactionHash: Hex;
}

/** The ERC-4337 `UserOperationEvent` that a Topaz ID send produced. */
export interface TopazIdUserOperation {
  /** The UserOperation hash — what some Topaz ID sends return instead of a tx hash. */
  hash: Hex;
  /** The smart wallet that executed the operation. */
  sender: Address;
  /** Whether the operation's calls executed without reverting. */
  success: boolean;
}

/**
 * Subset of a raw `eth_getTransactionReceipt` result. Fields are hex-encoded, as
 * the RPC returns them — check `status` (`"0x1"` success / `"0x0"` reverted).
 *
 * Smart-wallet sends land inside a bundler transaction, so the transaction can
 * succeed while the user's operation inside it reverted. When the receipt's logs
 * carry the operation's `UserOperationEvent`, `userOperation` is filled in and
 * `status` reflects **the operation's** outcome, which is what your app cares
 * about.
 */
export interface TopazIdTransactionReceipt {
  transactionHash: Hex;
  status: Hex;
  blockHash: Hex;
  blockNumber: Hex;
  from: Address;
  /** `null` for contract-creation transactions. */
  to: Address | null;
  gasUsed: Hex;
  logs: readonly TopazIdLog[];
  userOperation?: TopazIdUserOperation;
}

export interface WaitForReceiptOptions {
  /** Total time to poll before giving up and resolving `null`. Default `30_000`ms. */
  timeout?: number;
  /** Delay between polls. Default `1_500`ms. */
  pollingInterval?: number;
  /**
   * How far back (in blocks from the first poll) to search the EntryPoint's logs
   * when the hash turns out to be a UserOperation hash. Default `250`.
   */
  lookbackBlocks?: number;
  /** Abort the wait early (e.g. on component unmount). */
  signal?: AbortSignal;
}

export interface WaitForTopazIdReceiptParameters extends WaitForReceiptOptions {
  provider: TopazIdProviderLike;
  /** Transaction (or UserOperation) hash returned by a Topaz ID send. */
  hash: Hex;
  /**
   * The sending smart wallet. Lets the wait pick the right `UserOperationEvent`
   * when a bundler transaction carries operations from several wallets.
   */
  account?: Address;
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
  /**
   * Wait for the receipt of a hash this client returned, resolving the
   * UserOperation inside it (see {@link waitForTopazIdReceipt}). Resolves to
   * `null` on timeout — treat the receipt as best-effort and fall back to
   * re-reading app state rather than blocking the UI on it.
   */
  waitForReceipt(
    hash: Hex,
    options?: WaitForReceiptOptions,
  ): Promise<TopazIdTransactionReceipt | null>;
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

async function resolveChainId(provider: TopazIdProviderLike): Promise<number> {
  const raw = await provider
    .request({ method: "eth_chainId" })
    .catch(() => undefined);
  const chainId =
    typeof raw === "string" || typeof raw === "number" ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : TOPAZ_ID_CHAIN_ID;
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
 * (~0.009 of an 18-decimal currency) the conversion rounds to the nearest
 * representable amount (at most a few thousand wei of dust); round amounts
 * (0.1 / 1 / 10) are exactly representable. See
 * {@link isExactTopazIdValue} and {@link roundUpTopazIdValue}.
 */
function formatSmartWalletValue(value: bigint): number {
  return Number(value);
}

/**
 * Whether `value` survives the number conversion the Topaz ID popup requires —
 * every amount up to 2^53−1 wei does; above that only amounts with at most 53
 * significant bits do. Check it before opening a popup when the contract needs
 * an exact `msg.value` (a fixed mint price, an exact bridge fee) and you would
 * rather refuse than send a dust-rounded amount.
 */
export function isExactTopazIdValue(value: bigint): boolean {
  const asNumber = Number(value);
  return value >= 0n && Number.isFinite(asNumber) && BigInt(asNumber) === value;
}

/**
 * The smallest amount ≥ `value` that the Topaz ID popup can carry exactly. Use
 * it for quoted fees that must not be under-paid (LayerZero messaging fees,
 * "at least X" deposits): the contract receives a hair more, never less.
 */
export function roundUpTopazIdValue(value: bigint): bigint {
  if (value < 0n) throw new RangeError("value must not be negative.");
  const significantBits = value.toString(2).length;
  const step = 1n << BigInt(Math.max(0, significantBits - 53));
  return ((value + step - 1n) / step) * step;
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

const DEFAULT_RECEIPT_TIMEOUT_MS = 30_000;
const DEFAULT_RECEIPT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_LOOKBACK_BLOCKS = 250;

/** Canonical ERC-4337 EntryPoint deployments (v0.7, then v0.6) — the same address on every chain. */
export const ENTRY_POINT_ADDRESSES = [
  "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
] as const;

/** `keccak256("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)")`. */
export const USER_OPERATION_EVENT_TOPIC: Hex =
  "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

function abortError(): DOMException {
  return new DOMException("The Topaz ID receipt wait was aborted.", "AbortError");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isEntryPoint(address: string | undefined): boolean {
  const lower = address?.toLowerCase();
  return ENTRY_POINT_ADDRESSES.some((entryPoint) => entryPoint.toLowerCase() === lower);
}

function topicAddress(topic: Hex | undefined): Address | undefined {
  if (!topic || topic.length !== 66) return undefined;
  const candidate = `0x${topic.slice(-40)}`;
  return isAddress(candidate) ? getAddress(candidate) : undefined;
}

/** `success` is the second non-indexed word of `UserOperationEvent` data. */
function userOperationSucceeded(data: Hex): boolean | undefined {
  const word = data.slice(2 + 64, 2 + 128);
  return word.length === 64 ? BigInt(`0x${word}`) === 1n : undefined;
}

function attachUserOperation(
  receipt: TopazIdTransactionReceipt,
  filter: { account?: Address; userOpHash?: Hex },
): TopazIdTransactionReceipt {
  const wanted = filter.account ? getAddress(filter.account) : undefined;
  const events = (receipt.logs ?? []).filter((log) => {
    if (!isEntryPoint(log.address) || log.topics[0] !== USER_OPERATION_EVENT_TOPIC) return false;
    if (filter.userOpHash && log.topics[1]?.toLowerCase() !== filter.userOpHash.toLowerCase()) return false;
    return !wanted || topicAddress(log.topics[2]) === wanted;
  });
  if (events.length !== 1) return receipt;

  const [event] = events;
  const hash = event!.topics[1];
  const sender = topicAddress(event!.topics[2]);
  const success = userOperationSucceeded(event!.data);
  if (!hash || !sender || success === undefined) return receipt;

  return {
    ...receipt,
    status: success ? receipt.status : "0x0",
    userOperation: { hash, sender, success },
  };
}

async function getTransactionReceipt(
  provider: TopazIdProviderLike,
  hash: Hex,
): Promise<TopazIdTransactionReceipt | null> {
  const receipt = await provider.request({
    method: "eth_getTransactionReceipt",
    params: [hash],
  });
  return receipt == null ? null : (receipt as TopazIdTransactionReceipt);
}

async function lookbackFromBlock(
  provider: TopazIdProviderLike,
  lookbackBlocks: number,
): Promise<Hex | undefined> {
  const latest = await provider.request({ method: "eth_blockNumber" }).catch(() => undefined);
  if (typeof latest !== "string") return undefined;
  const from = BigInt(latest) - BigInt(Math.max(0, Math.floor(lookbackBlocks)));
  return numberToHex(from < 0n ? 0n : from);
}

async function findUserOperationTransaction(
  provider: TopazIdProviderLike,
  userOpHash: Hex,
  fromBlock: Hex,
): Promise<Hex | undefined> {
  const logs = await provider
    .request({
      method: "eth_getLogs",
      params: [
        {
          address: [...ENTRY_POINT_ADDRESSES],
          topics: [USER_OPERATION_EVENT_TOPIC, userOpHash],
          fromBlock,
          toBlock: "latest",
        },
      ],
    })
    .catch(() => undefined);
  const first = Array.isArray(logs) ? (logs[0] as Partial<TopazIdLog> | undefined) : undefined;
  return typeof first?.transactionHash === "string" ? first.transactionHash : undefined;
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
 * `writeContract`, and `waitForReceipt` without hand-rolling payloads: native
 * `value` is converted to the wire format the Topaz popup accepts, and multiple
 * calls batch into one atomic operation (with a sequential per-call fallback when
 * the wallet rejects the bundle — see {@link TopazIdSendCallsParameters.atomicRequired}).
 *
 * Works with any Topaz ID provider: a wagmi connector client, or one from
 * `createTopazIdProvider` (`@topazdex/id-connect/provider`) outside wagmi.
 */
export async function createTopazIdClient(options: TopazIdClientOptions): Promise<TopazIdClient> {
  const account = await resolveAccount(options.provider, options.account);
  const chainId = options.chainId ?? (await resolveChainId(options.provider));

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
        sponsored: isTopazIdGasSponsored(chainId),
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
    waitForReceipt(hash, receiptOptions) {
      return waitForTopazIdReceipt({ provider: options.provider, hash, account, ...receiptOptions });
    },
  };
}

/**
 * Wait for the receipt of a Topaz ID send. The popup returns either a
 * transaction hash or a **UserOperation hash**, and a plain
 * `eth_getTransactionReceipt` never resolves the latter. This polls the receipt
 * and, while it stays empty, searches the ERC-4337 EntryPoint's logs for a
 * `UserOperationEvent` with that hash to find the bundler transaction that
 * included it. Either way the returned receipt carries `userOperation` and its
 * `status` reflects the operation's outcome, not just the bundle's.
 *
 * Resolves to `null` on `timeout` — on `null`, re-read your app state (balances,
 * allowances) rather than blocking the UI. Pass a `signal` to cancel the wait
 * (e.g. on component unmount); an abort re-throws an `AbortError`.
 *
 * @example
 * const hash = await topazClient.sendTransaction(call);
 * const receipt = await waitForTopazIdReceipt({ provider, hash, account, timeout: 20_000 });
 * if (receipt?.status === "0x1") // the user's operation succeeded
 */
export async function waitForTopazIdReceipt(
  parameters: WaitForTopazIdReceiptParameters,
): Promise<TopazIdTransactionReceipt | null> {
  const { provider, hash, signal, account } = parameters;
  const timeout = parameters.timeout ?? DEFAULT_RECEIPT_TIMEOUT_MS;
  const pollingInterval = parameters.pollingInterval ?? DEFAULT_RECEIPT_POLL_INTERVAL_MS;
  const lookbackBlocks = parameters.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
  const deadline = Date.now() + timeout;
  let fromBlock: Hex | undefined;

  for (;;) {
    if (signal?.aborted) throw abortError();
    const receipt = await getTransactionReceipt(provider, hash);
    if (receipt) return attachUserOperation(receipt, { account });

    fromBlock ??= await lookbackFromBlock(provider, lookbackBlocks);
    const bundleHash = fromBlock && (await findUserOperationTransaction(provider, hash, fromBlock));
    if (bundleHash) {
      const bundle = await getTransactionReceipt(provider, bundleHash);
      if (bundle) return attachUserOperation(bundle, { userOpHash: hash });
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await delay(Math.min(pollingInterval, remaining), signal);
  }
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
