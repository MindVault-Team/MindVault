import { describe, it, expect } from "vitest";
import { getVaultEffectivePrivacy } from "./privacy";

type VaultHierarchyLike = {
  name?: string;
  parentVaultId?: string | null;
  privacyTier?: string | null;
};

describe("getVaultEffectivePrivacy", () => {
  it("returns 'open' when the vault doesn't exist", () => {
    const vaultsById: Record<string, VaultHierarchyLike | undefined> = {};
    expect(getVaultEffectivePrivacy("non-existent", vaultsById)).toBe("open");
  });

  it("correctly returns the tier when the vault has no parent", () => {
    const vaultsById: Record<string, VaultHierarchyLike | undefined> = {
      vault1: { privacyTier: "locked" },
      vault2: { privacyTier: "redacted" },
      vault3: { privacyTier: "local_only" },
      vault4: { privacyTier: "open" },
    };

    expect(getVaultEffectivePrivacy("vault1", vaultsById)).toBe("locked");
    expect(getVaultEffectivePrivacy("vault2", vaultsById)).toBe("redacted");
    expect(getVaultEffectivePrivacy("vault3", vaultsById)).toBe("local_only");
    expect(getVaultEffectivePrivacy("vault4", vaultsById)).toBe("open");
  });

  it("inherits the strictest privacy tier from its parent hierarchy", () => {
    const vaultsById: Record<string, VaultHierarchyLike | undefined> = {
      parent: { privacyTier: "redacted" },
      child: { parentVaultId: "parent", privacyTier: "open" },
      grandchild: { parentVaultId: "child", privacyTier: "local_only" },
    };

    expect(getVaultEffectivePrivacy("grandchild", vaultsById)).toBe("redacted");
    expect(getVaultEffectivePrivacy("child", vaultsById)).toBe("redacted");
    expect(getVaultEffectivePrivacy("parent", vaultsById)).toBe("redacted");
  });

  it("avoids infinite loop when there is a circular dependency", () => {
    const vaultsById: Record<string, VaultHierarchyLike | undefined> = {
      vaultA: { parentVaultId: "vaultB", privacyTier: "locked" },
      vaultB: { parentVaultId: "vaultC", privacyTier: "open" },
      vaultC: { parentVaultId: "vaultA", privacyTier: "local_only" },
    };

    // Depending on which vault we start traversing, the effective privacy will be the strictest
    // tier among the cycle (which is 'locked').
    expect(getVaultEffectivePrivacy("vaultA", vaultsById)).toBe("locked");
    expect(getVaultEffectivePrivacy("vaultB", vaultsById)).toBe("locked");
    expect(getVaultEffectivePrivacy("vaultC", vaultsById)).toBe("locked");
  });

  it("uses and updates the memoization object", () => {
    const vaultsById: Record<string, VaultHierarchyLike | undefined> = {
      parent: { privacyTier: "redacted" },
      child: { parentVaultId: "parent", privacyTier: "open" },
    };
    const memo: Record<string, string> = {};

    const result = getVaultEffectivePrivacy("child", vaultsById, memo);

    expect(result).toBe("redacted");
    // Verify memo was populated
    expect(memo).toHaveProperty("child", "redacted");
    expect(memo).toHaveProperty("parent", "redacted");

    // Verify it uses the memo directly on subsequent calls
    const mockVaultsById: Record<string, VaultHierarchyLike | undefined> = {}; // Empty, to prove it uses memo
    expect(getVaultEffectivePrivacy("child", mockVaultsById, memo)).toBe("redacted");
  });
});
