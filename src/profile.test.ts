import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avatarForWallet,
  displayNameForWallet,
  fetchTopazIdProfile,
  shortenAddress,
  type TopazIdProfile,
} from "./profile";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";

function profile(overrides: Partial<TopazIdProfile> = {}): TopazIdProfile {
  return {
    wallet: WALLET,
    found: true,
    name: null,
    description: null,
    handle: null,
    image: null,
    banner: null,
    accent: null,
    theme: "dark",
    updatedAt: null,
    ...overrides,
  };
}

describe("shortenAddress", () => {
  it("keeps the first 6 and last 4 chars", () => {
    expect(shortenAddress(WALLET)).toBe("0x1234…5678");
  });
});

describe("displayNameForWallet", () => {
  it("prefers the handle", () => {
    expect(displayNameForWallet(profile({ handle: "alice", name: "Alice" }), WALLET)).toBe("@alice");
  });

  it("falls back to the name when there is no handle", () => {
    expect(displayNameForWallet(profile({ name: "Alice" }), WALLET)).toBe("Alice");
  });

  it("falls back to the shortened address for a null profile", () => {
    expect(displayNameForWallet(null, WALLET)).toBe("0x1234…5678");
  });
});

describe("avatarForWallet", () => {
  it("returns the image when present", () => {
    expect(avatarForWallet(profile({ image: "https://img/a.png" }))).toBe("https://img/a.png");
  });

  it("returns the fallback when there is no image", () => {
    expect(avatarForWallet(null, "/default.png")).toBe("/default.png");
  });
});

describe("fetchTopazIdProfile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the parsed profile on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => profile({ handle: "bob" }) }),
    );
    const result = await fetchTopazIdProfile(WALLET);
    expect(result?.handle).toBe("bob");
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchTopazIdProfile(WALLET)).toBeNull();
  });

  it("returns null on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    expect(await fetchTopazIdProfile(WALLET)).toBeNull();
  });

  it("re-throws an abort so callers can distinguish cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    await expect(fetchTopazIdProfile(WALLET)).rejects.toThrow("aborted");
  });
});
