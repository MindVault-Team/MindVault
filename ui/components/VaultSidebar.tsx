import { useEffect, useMemo, useRef, useState } from "react";
import type { Node, Vault } from "../ipc";
import { getAllNodes } from "../services/nodes";
import { createVault, deleteVault, listVaults, updateVault } from "../services/vaults";
import { isAuthSetup, setMasterPassword, verifyMasterPassword } from "../services/auth";
import { AppError } from "../services/ipcResult";
import { PrivacyBadge } from "./PrivacyBadge";
import { getEffectivePrivacy, getPrivacyRank } from "../utils/privacy";

type VaultSidebarProps = {
  selectedVaultId: string | null;
  refreshKey: number;
  onSelectVault: (vaultId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onVaultCreated: (vaultId: string) => void;
  onVaultDeleted: (vaultId: string) => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  isRedactedUnlocked: boolean;
  setIsRedactedUnlocked: (value: boolean) => void;
};

/**
 * Structured Tree Navigation sidebar.
 *
 * When the user types a search query:
 * - ALL vaults remain visible (never removed from DOM).
 * - Vaults / sub-vaults / nodes that do NOT match are rendered with an
 *   opacity-dimmed class (`tree-dimmed`) so they fade into the background.
 * - Vaults that contain a match are auto-expanded and highlighted with a
 *   subtle glow class (`tree-match`).
 * - Matching nodes appear inline under their parent vault, showing the
 *   breadcrumb path.
 */
function VaultSidebar({
  selectedVaultId,
  refreshKey,
  onSelectVault,
  onSelectNode,
  onVaultCreated,
  onVaultDeleted,
  onOpenDashboard,
  onOpenSettings,
  isRedactedUnlocked,
  setIsRedactedUnlocked,
}: VaultSidebarProps) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedVaults, setExpandedVaults] = useState<Record<string, boolean>>({});
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"verify" | "setup">("verify");
  const [authModalTitle, setAuthModalTitle] = useState("Redacted");
  const [authModalSubtitle, setAuthModalSubtitle] = useState("");
  const [authModalSubmitLabel, setAuthModalSubmitLabel] = useState("Unlock");
  const [authUnlockOnSuccess, setAuthUnlockOnSuccess] = useState(true);
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [authModalError, setAuthModalError] = useState("");
  const authModalResolverRef = useRef<((allowed: boolean) => void) | null>(null);

  async function loadVaults() {
    try {
      const data = await listVaults();
      setVaults(data);
      setError(null);
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        return;
      }
      setError("Failed to load vaults.");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadVaults();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const nodes = await getAllNodes();
          setAllNodes(nodes);
        } catch (err) {
          if (err instanceof AppError) {
            setError(err.message);
          } else {
            setError("Failed to load nodes for search.");
          }
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshKey]);

  async function onCreateVault() {
    const name = window.prompt("Vault name");
    if (!name || !name.trim()) {
      return;
    }

    try {
      const created = await createVault({
        name: name.trim(),
      });
      onVaultCreated(created.id);
      await loadVaults();
      setError(null);
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        return;
      }
      setError("Failed to create vault.");
    }
  }

  async function onCreateSubVault(parentVaultId: string, parentName: string) {
    const name = window.prompt(`Sub-vault name for ${parentName}`);
    if (!name || !name.trim()) {
      return;
    }

    try {
      const created = await createVault({
        name: name.trim(),
        parentVaultId,
      });
      setExpandedVaults((prev) => ({ ...prev, [parentVaultId]: true }));
      onVaultCreated(created.id);
      await loadVaults();
      setError(null);
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        return;
      }
      setError("Failed to create sub-vault.");
    }
  }

  async function onDeleteVault(vaultId: string) {
    if (!window.confirm("Are you sure?")) {
      return;
    }
    try {
      const deleted = await deleteVault(vaultId);
      if (!deleted) {
        setError("Vault could not be deleted.");
        return;
      }
      onVaultDeleted(vaultId);
      await loadVaults();
      setError(null);
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        return;
      }
      setError("Failed to delete vault.");
    }
  }

  function closeAuthModal(allowed: boolean) {
    setAuthModalOpen(false);
    setAuthPasswordInput("");
    setAuthModalError("");
    const resolver = authModalResolverRef.current;
    authModalResolverRef.current = null;
    if (resolver) {
      resolver(allowed);
    }
  }

  function openAuthModal({
    mode,
    title,
    subtitle,
    submitLabel,
    unlockOnSuccess,
  }: {
    mode: "verify" | "setup";
    title: string;
    subtitle: string;
    submitLabel: string;
    unlockOnSuccess: boolean;
  }): Promise<boolean> {
    setAuthMode(mode);
    setAuthModalTitle(title);
    setAuthModalSubtitle(subtitle);
    setAuthModalSubmitLabel(submitLabel);
    setAuthUnlockOnSuccess(unlockOnSuccess);
    setAuthPasswordInput("");
    setAuthModalError("");
    setAuthModalOpen(true);
    return new Promise((resolve) => {
      authModalResolverRef.current = resolve;
    });
  }

  async function submitAuthModal() {
    if (!authPasswordInput) {
      return;
    }
    setAuthModalError("");
    if (authMode === "verify") {
      const verifyResult = await verifyMasterPassword(authPasswordInput);
      if (verifyResult.error) {
        setAuthModalError(verifyResult.error.message);
        return;
      }
      if (!verifyResult.data) {
        setAuthModalError("Incorrect password");
        return;
      }
      if (authUnlockOnSuccess) {
        setIsRedactedUnlocked(true);
      }
      closeAuthModal(true);
      return;
    }

    const setResult = await setMasterPassword(authPasswordInput);
    if (setResult.error) {
      setAuthModalError(setResult.error.message);
      return;
    }
    if (!setResult.data) {
      setAuthModalError("Failed to set master password.");
      return;
    }
    if (authUnlockOnSuccess) {
      setIsRedactedUnlocked(true);
    }
    closeAuthModal(true);
  }

  async function unlockRedactedFromSidebar(): Promise<boolean> {
    const setupResult = await isAuthSetup();
    if (setupResult.error) {
      setError(setupResult.error.message);
      return false;
    }

    if (setupResult.data) {
      return openAuthModal({
        mode: "verify",
        title: "Redacted",
        subtitle: "Enter your master password to unlock this tier.",
        submitLabel: "Unlock",
        unlockOnSuccess: true,
      });
    }

    return openAuthModal({
      mode: "setup",
      title: "Redacted",
      subtitle: "Set a master password to unlock this tier.",
      submitLabel: "Set Master Password",
      unlockOnSuccess: true,
    });
  }

  async function onUpdateVaultPrivacy(vault: Vault, effectiveTier: string) {
    if (effectiveTier === "redacted" && !isRedactedUnlocked) {
      const unlocked = await unlockRedactedFromSidebar();
      if (!unlocked) {
        return;
      }
    }
    const input = window.prompt(
      "Enter new privacy tier (open, local_only, locked, redacted):",
      vault.privacyTier
    );
    if (input === null) {
      return;
    }
    const nextTier = input.trim().toLowerCase();
    if (!["open", "local_only", "locked", "redacted"].includes(nextTier)) {
      setError("Invalid privacy tier. Use open, local_only, locked, or redacted.");
      return;
    }

    const isDowngradeFromRedacted =
      effectiveTier === "redacted" && getPrivacyRank(nextTier) < getPrivacyRank("redacted");
    if (isDowngradeFromRedacted) {
      const verified = await openAuthModal({
        mode: "verify",
        title: "Confirm Privacy Downgrade",
        subtitle: "Enter your master password to downgrade from redacted.",
        submitLabel: "Confirm",
        unlockOnSuccess: false,
      });
      if (!verified) {
        return;
      }
    }

    try {
      await updateVault({ id: vault.id, privacyTier: nextTier });
      await loadVaults();
      setError(null);
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        return;
      }
      setError("Failed to update vault privacy tier.");
    }
  }

  function onSelectVaultEntry(vault: Vault) {
    onSelectVault(vault.id);
  }

  function onSelectNodeEntry(node: Node) {
    onSelectVault(node.subVaultId ?? node.vaultId);
    onSelectNode(node.id);
  }

  function onToggleExpand(vaultId: string) {
    setExpandedVaults((prev) => ({
      ...prev,
      [vaultId]: !prev[vaultId],
    }));
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  // ---------------------------------------------------------------------------
  // Build structured tree data with search-match metadata
  // ---------------------------------------------------------------------------
  const {
    topLevelVaults,
    childrenByParent,
    nodesByVaultId,
    matchingVaultIds,
    matchingSubVaultIds,
    matchingNodeIds,
    resultCount,
  } = useMemo(() => {
    const childMap = new Map<string, Vault[]>();
    for (const vault of vaults) {
      if (!vault.parentVaultId) {
        continue;
      }
      const existing = childMap.get(vault.parentVaultId) ?? [];
      existing.push(vault);
      childMap.set(vault.parentVaultId, existing);
    }

    for (const children of childMap.values()) {
      children.sort((a, b) => a.name.localeCompare(b.name));
    }

    const roots = vaults.filter((vault) => !vault.parentVaultId);
    roots.sort((a, b) => a.name.localeCompare(b.name));

    // Group nodes by their "tree parent" vault id
    // (sub-vault id if present, otherwise top-level vault id)
    const nodeMap = new Map<string, Node[]>();
    for (const node of allNodes) {
      const parentKey = node.subVaultId ?? node.vaultId;
      const existing = nodeMap.get(parentKey) ?? [];
      existing.push(node);
      nodeMap.set(parentKey, existing);
    }

    // Without a search query, show everything normally
    if (!normalizedQuery) {
      return {
        topLevelVaults: roots,
        childrenByParent: childMap,
        nodesByVaultId: nodeMap,
        matchingVaultIds: new Set<string>(),
        matchingSubVaultIds: new Set<string>(),
        matchingNodeIds: new Set<string>(),
        resultCount: 0,
      };
    }

    // With a search query, compute which items match
    const matchVaults = new Set<string>();
    const matchSubVaults = new Set<string>();
    const matchNodes = new Set<string>();
    let count = 0;

    // Find matching nodes
    for (const node of allNodes) {
      const titleMatch = node.title.toLowerCase().includes(normalizedQuery);
      const summaryMatch = node.summary.toLowerCase().includes(normalizedQuery);
      if (titleMatch || summaryMatch) {
        matchNodes.add(node.id);
        count++;
        // Mark parent vault/sub-vault as containing a match
        if (node.subVaultId) {
          matchSubVaults.add(node.subVaultId);
          // Also find the root vault for this sub-vault
          const subVault = vaults.find((v) => v.id === node.subVaultId);
          if (subVault?.parentVaultId) {
            matchVaults.add(subVault.parentVaultId);
          }
        }
        matchVaults.add(node.vaultId);
      }
    }

    // Find matching vaults by name
    for (const vault of vaults) {
      if (vault.name.toLowerCase().includes(normalizedQuery)) {
        if (vault.parentVaultId) {
          matchSubVaults.add(vault.id);
          matchVaults.add(vault.parentVaultId);
        } else {
          matchVaults.add(vault.id);
        }
        count++;
      }
    }

    return {
      topLevelVaults: roots,
      childrenByParent: childMap,
      nodesByVaultId: nodeMap,
      matchingVaultIds: matchVaults,
      matchingSubVaultIds: matchSubVaults,
      matchingNodeIds: matchNodes,
      resultCount: count,
    };
  }, [allNodes, normalizedQuery, vaults]);

  // ---------------------------------------------------------------------------
  // Helpers for determining match/dim state
  // ---------------------------------------------------------------------------
  function isVaultOnMatchPath(vaultId: string): boolean {
    return matchingVaultIds.has(vaultId);
  }

  function isSubVaultMatch(subVaultId: string): boolean {
    return matchingSubVaultIds.has(subVaultId);
  }

  function isNodeMatch(nodeId: string): boolean {
    return matchingNodeIds.has(nodeId);
  }

  /** Whether a vault should be expanded (user toggle OR search auto-expand). */
  function shouldExpand(vaultId: string, hasChildren: boolean): boolean {
    if (!hasChildren) return false;
    if (isSearching && isVaultOnMatchPath(vaultId)) return true;
    return expandedVaults[vaultId] ?? false;
  }

  return (
    <aside className="pane pane-left">
      <div className="pane-header">
        <h3>Vaults</h3>
        <button type="button" onClick={onCreateVault}>
          New Vault
        </button>
      </div>
      <button type="button" className="dashboard-trigger" onClick={onOpenDashboard}>
        🧠 Active Memory
      </button>
      <input
        type="search"
        className="search-input"
        placeholder="Search vaults & nodes..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {isSearching && (
        <p className="search-result-count">
          {resultCount === 0
            ? "No results"
            : `${resultCount} result${resultCount !== 1 ? "s" : ""}`}
        </p>
      )}
      {error && <p className="pane-error">{error}</p>}
      <ul className="vault-list">
        {topLevelVaults.map((vault) => {
          const effectiveTier = getEffectivePrivacy(vault.privacyTier);
          const children = childrenByParent.get(vault.id) ?? [];
          const vaultNodes = nodesByVaultId.get(vault.id) ?? [];
          const hasExpandableContent = children.length > 0 || vaultNodes.length > 0;
          const expanded =
            shouldExpand(vault.id, hasExpandableContent) || (expandedVaults[vault.id] ?? false);

          // Dimming logic: when searching, dim everything that is NOT on a match path
          const isDimmed = isSearching && !isVaultOnMatchPath(vault.id);
          const isHighlighted = isSearching && isVaultOnMatchPath(vault.id);

          return (
            <li key={vault.id} className={isDimmed ? "tree-dimmed" : ""}>
              <div
                className={`list-item ${selectedVaultId === vault.id ? "active" : ""} ${
                  isHighlighted ? "tree-match" : ""
                }`}
              >
                <button
                  type="button"
                  className={`tree-toggle ${!hasExpandableContent ? "empty" : ""}`}
                  onClick={() => onToggleExpand(vault.id)}
                  disabled={!hasExpandableContent}
                  aria-label={expanded ? `Collapse ${vault.name}` : `Expand ${vault.name}`}
                >
                  {!hasExpandableContent ? "" : expanded ? "▾" : "▸"}
                </button>
                <div className="vault-header">
                  <button
                    type="button"
                    className="list-main"
                    onClick={() => onSelectVaultEntry(vault)}
                  >
                    <span className="list-title-row">
                      <span className="list-title-text">{vault.name}</span>
                      <PrivacyBadge tier={effectiveTier} />
                    </span>
                    {vault.description && <small>{vault.description}</small>}
                  </button>
                  <div className="list-actions">
                    <button
                      type="button"
                      className="list-subvault"
                      onClick={() => onCreateSubVault(vault.id, vault.name)}
                      aria-label={`Create sub-vault under ${vault.name}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="list-settings"
                      onClick={() => onUpdateVaultPrivacy(vault, effectiveTier)}
                      aria-label={`Update settings for ${vault.name}`}
                    >
                      ⚙️
                    </button>
                    <button
                      type="button"
                      className="list-delete"
                      onClick={() => onDeleteVault(vault.id)}
                      aria-label={`Delete ${vault.name}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>

              {/* ----- Expanded children: Sub-Vaults ----- */}
              {expanded && children.length > 0 && (
                <ul className="sub-vault-list">
                  {children.map((child) => {
                    const childEffectiveTier = getEffectivePrivacy(
                      child.privacyTier,
                      vault.privacyTier
                    );
                    const childNodes = nodesByVaultId.get(child.id) ?? [];
                    const childIsDimmed =
                      isSearching && !isSubVaultMatch(child.id) && !isVaultOnMatchPath(child.id);
                    const childIsHighlighted = isSearching && isSubVaultMatch(child.id);
                    const childHasContent = childNodes.length > 0;
                    const childExpanded =
                      (isSearching && isSubVaultMatch(child.id)) ||
                      (expandedVaults[child.id] ?? false);

                    return (
                      <li key={child.id} className={childIsDimmed ? "tree-dimmed" : ""}>
                        <div
                          className={`list-item sub sub-vault-item ${
                            selectedVaultId === child.id ? "active" : ""
                          } ${childIsHighlighted ? "tree-match" : ""}`}
                        >
                          <button
                            type="button"
                            className={`tree-toggle ${!childHasContent ? "empty" : ""}`}
                            onClick={() => onToggleExpand(child.id)}
                            disabled={!childHasContent}
                            aria-label={
                              childExpanded ? `Collapse ${child.name}` : `Expand ${child.name}`
                            }
                          >
                            {!childHasContent ? "" : childExpanded ? "▾" : "▸"}
                          </button>
                          <button
                            type="button"
                            className="list-main"
                            onClick={() => onSelectVaultEntry(child)}
                          >
                            <span className="list-title-row">
                              <span className="list-title-text">{child.name}</span>
                              <PrivacyBadge tier={childEffectiveTier} />
                            </span>
                            {child.description && <small>{child.description}</small>}
                          </button>
                          <div className="list-actions">
                            <button
                              type="button"
                              className="list-settings"
                              onClick={() => onUpdateVaultPrivacy(child, childEffectiveTier)}
                              aria-label={`Update settings for ${child.name}`}
                            >
                              ⚙️
                            </button>
                            <button
                              type="button"
                              className="list-delete"
                              onClick={() => onDeleteVault(child.id)}
                              aria-label={`Delete ${child.name}`}
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* ----- Inline nodes under sub-vault ----- */}
                        {childExpanded && childNodes.length > 0 && (
                          <ul className="tree-node-list">
                            {childNodes.map((node) => {
                              const nodeDimmed = isSearching && !isNodeMatch(node.id);
                              const nodeHighlighted = isSearching && isNodeMatch(node.id);
                              return (
                                <li key={node.id} className={nodeDimmed ? "tree-dimmed" : ""}>
                                  <button
                                    type="button"
                                    className={`tree-node-item ${
                                      nodeHighlighted ? "tree-match" : ""
                                    }`}
                                    onClick={() => onSelectNodeEntry(node)}
                                  >
                                    <span className="tree-node-icon">📄</span>
                                    <span className="tree-node-text">
                                      <strong>{node.title}</strong>
                                      <small>{node.summary.slice(0, 60)}</small>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* ----- Inline nodes directly under the vault (no sub-vault) ----- */}
              {expanded && vaultNodes.length > 0 && (
                <ul className="tree-node-list">
                  {vaultNodes.map((node) => {
                    const nodeDimmed = isSearching && !isNodeMatch(node.id);
                    const nodeHighlighted = isSearching && isNodeMatch(node.id);
                    return (
                      <li key={node.id} className={nodeDimmed ? "tree-dimmed" : ""}>
                        <button
                          type="button"
                          className={`tree-node-item ${nodeHighlighted ? "tree-match" : ""}`}
                          onClick={() => onSelectNodeEntry(node)}
                        >
                          <span className="tree-node-icon">📄</span>
                          <span className="tree-node-text">
                            <strong>{node.title}</strong>
                            <small>{node.summary.slice(0, 60)}</small>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="settings-trigger" onClick={onOpenSettings}>
        ⚙️ Settings
      </button>
      {authModalOpen && (
        <div className="sidebar-auth-overlay" onClick={() => closeAuthModal(false)}>
          <div
            className="redacted-lock-screen sidebar-auth-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="redacted-lock-icon" aria-hidden="true">
              🔒
            </span>
            <h4 className="redacted-lock-title">{authModalTitle}</h4>
            <p className="redacted-lock-subtitle">{authModalSubtitle}</p>
            <form
              className="redacted-lock-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitAuthModal();
              }}
            >
              <input
                className="redacted-lock-input"
                type="password"
                value={authPasswordInput}
                onChange={(event) => setAuthPasswordInput(event.target.value)}
                placeholder={authMode === "setup" ? "Choose a master password" : "Master password"}
                autoFocus
              />
              <div className="sidebar-auth-actions">
                <button
                  type="button"
                  className="redacted-lock-button sidebar-auth-cancel"
                  onClick={() => closeAuthModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="redacted-lock-button">
                  {authModalSubmitLabel}
                </button>
              </div>
            </form>
            {authModalError && <p className="redacted-lock-error">{authModalError}</p>}
          </div>
        </div>
      )}
    </aside>
  );
}

export default VaultSidebar;
