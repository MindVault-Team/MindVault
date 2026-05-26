const PRIVACY_RANKS: Record<string, number> = {
  open: 0,
  local_only: 1,
  locked: 2,
  redacted: 3,
};

type VaultHierarchyLike = {
  name?: string;
  parentVaultId?: string | null;
  privacyTier?: string | null;
};

function normalizeTier(tier?: string | null): string {
  if (!tier) {
    return "open";
  }
  return tier in PRIVACY_RANKS ? tier : "open";
}

export const getPrivacyRank = (tier?: string | null): number => PRIVACY_RANKS[normalizeTier(tier)];

export function isRedactedLocked(tier?: string | null, isUnlocked = false): boolean {
  return normalizeTier(tier) === "redacted" && !isUnlocked;
}

export function getPrivacyDisplayLabel(
  label: string,
  tier?: string | null,
  isUnlocked = false,
  redactedLabel = "[REDACTED]"
): string {
  return isRedactedLocked(tier, isUnlocked) ? redactedLabel : label;
}

export function getPrivacyDisplaySummary(
  summary: string | null | undefined,
  tier?: string | null,
  isUnlocked = false,
  redactedSummary = "[Metadata Locked]"
): string {
  if (isRedactedLocked(tier, isUnlocked)) {
    return redactedSummary;
  }
  return (summary || "").trim();
}

export function getVaultDisplayLabel(
  vaultId: string,
  vaultsById: Record<string, VaultHierarchyLike | undefined>,
  isUnlocked = false,
  redactedLabel = "[REDACTED]"
): string {
  const vault = vaultsById[vaultId];
  if (!vault) {
    return "Unknown Vault";
  }
  const effectiveTier = getVaultEffectivePrivacy(vaultId, vaultsById);
  const name = vault.name ?? "Vault";
  return getPrivacyDisplayLabel(name, effectiveTier, isUnlocked, redactedLabel);
}

export function getVaultDisplayPath(
  vaultId: string,
  vaultsById: Record<string, VaultHierarchyLike | undefined>,
  isUnlocked = false
): string {
  const segments: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null | undefined = vaultId;

  while (currentId) {
    if (seen.has(currentId)) {
      break;
    }
    seen.add(currentId);
    const vault: VaultHierarchyLike | undefined = vaultsById[currentId];
    if (!vault) {
      break;
    }

    const effectiveTier = getVaultEffectivePrivacy(currentId, vaultsById);
    const name = vault.name ?? "Vault";
    segments.push(getPrivacyDisplayLabel(name, effectiveTier, isUnlocked));
    currentId = vault.parentVaultId ?? null;
  }

  if (segments.length === 0) {
    return "Unknown Vault";
  }

  return segments.reverse().join(" / ");
}

export function getEffectivePrivacy(
  nodeTier?: string | null,
  subVaultTier?: string | null,
  vaultTier?: string | null
): string {
  const tiers = [normalizeTier(nodeTier), normalizeTier(subVaultTier), normalizeTier(vaultTier)];

  return tiers.reduce((strictest, current) =>
    getPrivacyRank(current) > getPrivacyRank(strictest) ? current : strictest
  );
}

export function getVaultEffectivePrivacy(
  vaultId: string,
  vaultsById: Record<string, VaultHierarchyLike | undefined>,
  memo: Record<string, string> = {},
  seen: Set<string> = new Set()
): string {
  if (memo[vaultId]) {
    return memo[vaultId];
  }

  if (seen.has(vaultId)) {
    return "open";
  }

  const vault = vaultsById[vaultId];
  if (!vault) {
    return "open";
  }

  seen.add(vaultId);
  const parentTier = vault.parentVaultId
    ? getVaultEffectivePrivacy(vault.parentVaultId, vaultsById, memo, seen)
    : null;
  seen.delete(vaultId);

  const effectiveTier = getEffectivePrivacy(vault.privacyTier, parentTier);
  memo[vaultId] = effectiveTier;
  return effectiveTier;
}

/**
 * Self-test suite to verify privacy hierarchy calculations and cycle prevention.
 */
export function runPrivacyTests() {
  const mockVaults: Record<string, VaultHierarchyLike> = {
    vault_open: { name: "Open Vault", privacyTier: "open" },
    vault_local: { name: "Local Vault", privacyTier: "local_only" },
    vault_locked: { name: "Locked Vault", privacyTier: "locked", parentVaultId: "vault_local" },
    vault_redacted: { name: "Redacted Vault", privacyTier: "redacted" },
  };

  // Test 1: Simple hierarchy
  const tier = getVaultEffectivePrivacy("vault_locked", mockVaults);
  if (tier !== "locked") {
    throw new Error(`Privacy Test 1 Failed: Expected locked, got ${tier}`);
  }

  // Test 2: Cycle detection (Self-referencing cycle A -> B -> A)
  const cyclicVaults: Record<string, VaultHierarchyLike> = {
    vault_a: { name: "Vault A", privacyTier: "open", parentVaultId: "vault_b" },
    vault_b: { name: "Vault B", privacyTier: "locked", parentVaultId: "vault_a" },
  };

  // This should not infinite loop and should resolve vault_a to locked (from vault_b)
  const tierA = getVaultEffectivePrivacy("vault_a", cyclicVaults);
  const tierB = getVaultEffectivePrivacy("vault_b", cyclicVaults);
  if (tierA !== "locked") {
    throw new Error(`Privacy Test 2 Failed: Expected locked for A, got ${tierA}`);
  }
  if (tierB !== "locked") {
    throw new Error(`Privacy Test 2 Failed: Expected locked for B, got ${tierB}`);
  }

  // Test 3: Self-referencing (A -> A)
  const selfRefVaults: Record<string, VaultHierarchyLike> = {
    vault_self: { name: "Self Vault", privacyTier: "local_only", parentVaultId: "vault_self" },
  };
  const tierSelf = getVaultEffectivePrivacy("vault_self", selfRefVaults);
  if (tierSelf !== "local_only") {
    throw new Error(`Privacy Test 3 Failed: Expected local_only, got ${tierSelf}`);
  }
}
