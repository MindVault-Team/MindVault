import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteNode,
  getAllNodes,
  getNode,
  refreshAllPriorityScores,
  touchNode,
  updateNode,
} from "../services/nodes";
import type { Backlink, Door, Node, Tag, Vault } from "../ipc";
import { AppError } from "../services/ipcResult";
import { listVaults, resolveVaultPath } from "../services/vaults";
import { addNodeTag, createTag, getNodeTags, listTags, removeNodeTag } from "../services/tags";
import {
  createDoor,
  deleteDoor,
  listIncomingDoors,
  listOutgoingDoors,
  repointDoor,
} from "../services/doors";
import { isAuthSetup, setMasterPassword, verifyMasterPassword } from "../services/auth";
import { getEffectivePrivacy, getPrivacyRank } from "../utils/privacy";
import { PrivacyBadge } from "./PrivacyBadge";
import PriorityBar from "./PriorityBar";

type NodeEditorProps = {
  selectedNodeId: string | null;
  refreshKey: number;
  onNodeDeleted: (nodeId: string) => void;
  onSaveSuccess: () => void;
  isRedactedUnlocked: boolean;
  setIsRedactedUnlocked: (value: boolean) => void;
};

function NodeEditor({
  selectedNodeId,
  refreshKey,
  onNodeDeleted,
  onSaveSuccess,
  isRedactedUnlocked,
  setIsRedactedUnlocked,
}: NodeEditorProps) {
  const [node, setNode] = useState<Node | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [editPrivacy, setEditPrivacy] = useState("open");
  const [nodeTags, setNodeTags] = useState<Tag[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tagRefreshKey, setTagRefreshKey] = useState(0);
  const [outgoingDoors, setOutgoingDoors] = useState<Door[]>([]);
  const [incomingDoors, setIncomingDoors] = useState<Backlink[]>([]);
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [allNodesMap, setAllNodesMap] = useState<Record<string, Node>>({});
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [isDoorPickerOpen, setIsDoorPickerOpen] = useState(false);
  const [doorSearchQuery, setDoorSearchQuery] = useState("");
  const [doorTargetId, setDoorTargetId] = useState<string | null>(null);
  const [doorLabelInput, setDoorLabelInput] = useState("");
  const [repointDoorId, setRepointDoorId] = useState<string | null>(null);
  const [breadcrumbPath, setBreadcrumbPath] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [editPriorityProfile, setEditPriorityProfile] = useState("standard");
  const [editFrozen, setEditFrozen] = useState(false);
  const [status, setStatus] = useState<string>("");
  const saveRunIdRef = useRef(0);
  const saveStatusTimeoutRef = useRef<number | null>(null);

  async function refreshAvailableTags() {
    const result = await listTags();
    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    setAvailableTags(result.data ?? []);
  }

  async function refreshNodeTags(nodeId: string) {
    const result = await getNodeTags(nodeId);
    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    setNodeTags(result.data ?? []);
  }

  async function refreshDoors(nodeId: string) {
    const [outgoing, incoming] = await Promise.all([
      listOutgoingDoors(nodeId),
      listIncomingDoors(nodeId),
    ]);
    if (outgoing.error) {
      setStatus(outgoing.error.message);
    } else {
      setOutgoingDoors(outgoing.data ?? []);
    }
    if (incoming.error) {
      setStatus(incoming.error.message);
    } else {
      setIncomingDoors(incoming.data ?? []);
    }
  }

  useEffect(() => {
    if (!selectedNodeId) {
      const clearTimer = window.setTimeout(() => {
        setNode(null);
        setEditTitle("");
        setEditSummary("");
        setEditDetail("");
        setEditPrivacy("open");
        setNodeTags([]);
        setOutgoingDoors([]);
        setIncomingDoors([]);
        setTagInput("");
        setIsDropdownOpen(false);
        setIsDoorPickerOpen(false);
        setDoorSearchQuery("");
        setDoorTargetId(null);
        setDoorLabelInput("");
        setRepointDoorId(null);
        setBreadcrumbPath("");
        setSaveStatus("idle");
      }, 0);
      return () => clearTimeout(clearTimer);
    }

    const nodeId = selectedNodeId;

    async function loadNode() {
      try {
        const [node, tagsResult, outgoingResult, incomingResult] = await Promise.all([
          getNode(nodeId),
          getNodeTags(nodeId),
          listOutgoingDoors(nodeId),
          listIncomingDoors(nodeId),
        ]);
        if (!node) {
          setNode(null);
          setNodeTags([]);
          setOutgoingDoors([]);
          setIncomingDoors([]);
          setStatus("Node not found.");
          return;
        }
        setNode(node);
        if (tagsResult.error) {
          setStatus(tagsResult.error.message);
        } else {
          setNodeTags(tagsResult.data ?? []);
        }
        if (outgoingResult.error) {
          setStatus(outgoingResult.error.message);
        } else {
          setOutgoingDoors(outgoingResult.data ?? []);
        }
        if (incomingResult.error) {
          setStatus(incomingResult.error.message);
        } else {
          setIncomingDoors(incomingResult.data ?? []);
        }
        setIsDoorPickerOpen(false);
        setDoorSearchQuery("");
        setDoorTargetId(null);
        setDoorLabelInput("");
        setRepointDoorId(null);
        setStatus("");
      } catch (err) {
        if (err instanceof AppError) {
          setStatus(err.message);
          return;
        }
        setStatus("Failed to load node.");
      }
    }

    const timer = setTimeout(() => {
      void loadNode();
      void touchNode(nodeId).catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshKey, selectedNodeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAvailableTags();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tagRefreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const nodes = await getAllNodes();
          const map: Record<string, Node> = {};
          for (const item of nodes) {
            map[item.id] = item;
          }
          setAllNodes(nodes);
          setAllNodesMap(map);
        } catch (err) {
          if (err instanceof AppError) {
            setStatus(err.message);
          } else {
            setStatus("Failed to load nodes map.");
          }
          setAllNodes([]);
          setAllNodesMap({});
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey]);

  useEffect(() => {
    if (!node) {
      const timer = window.setTimeout(() => {
        setBreadcrumbPath("");
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await listVaults();
          setVaults(list);
          setBreadcrumbPath(resolveVaultPath(node, list));
        } catch (err) {
          if (err instanceof AppError) {
            setStatus(err.message);
          } else {
            setStatus("Failed to resolve node path.");
          }
          setBreadcrumbPath("");
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [node]);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      setEditTitle(node?.title ?? "");
      setEditSummary(node?.summary ?? "");
      setEditDetail(node?.detail ?? "");
      setEditPrivacy(node?.privacyTier ?? "open");
      try {
        const parsed = node?.priority
          ? typeof node.priority === "string"
            ? JSON.parse(node.priority)
            : node.priority
          : null;
        setEditPriorityProfile(
          parsed && typeof parsed === "object" && "profile" in parsed
            ? String(parsed.profile)
            : "standard"
        );
        setEditFrozen(
          parsed && typeof parsed === "object" && "frozen" in parsed
            ? parsed.frozen === true
            : false
        );
      } catch {
        setEditPriorityProfile("standard");
      }
    }, 0);
    return () => clearTimeout(syncTimer);
  }, [node]);

  useEffect(
    () => () => {
      if (saveStatusTimeoutRef.current !== null) {
        window.clearTimeout(saveStatusTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedNodeId || !node) {
      return;
    }

    const currentPrivacy = node.privacyTier ?? "open";
    let currentPriorityProfile = "standard";
    let currentFrozen = false;
    try {
      const parsed = typeof node.priority === "string" ? JSON.parse(node.priority) : node.priority;
      if (parsed && typeof parsed === "object" && "profile" in parsed) {
        currentPriorityProfile = String(parsed.profile);
      }
      if (parsed && typeof parsed === "object" && "frozen" in parsed) {
        currentFrozen = parsed.frozen === true;
      }
    } catch {
      // keep default
    }
    const hasChanges =
      editTitle !== (node.title ?? "") ||
      editSummary !== (node.summary ?? "") ||
      editDetail !== (node.detail ?? "") ||
      editPrivacy !== currentPrivacy ||
      editPriorityProfile !== currentPriorityProfile ||
      editFrozen !== currentFrozen;

    if (!hasChanges) {
      return;
    }

    const runId = saveRunIdRef.current + 1;
    saveRunIdRef.current = runId;

    const statusTimer = window.setTimeout(() => {
      setSaveStatus("saving");
      setStatus("");
    }, 0);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const freshNodeForSave = await getNode(selectedNodeId);
          if (!freshNodeForSave) {
            throw new Error("Node was deleted before save could complete.");
          }
          const updated = await updateNode({
            id: selectedNodeId,
            title: editTitle,
            summary: editSummary,
            detail: editDetail,
            privacyTier: editPrivacy,
            priority: JSON.stringify({
              ...(() => {
                try {
                  const p =
                    typeof freshNodeForSave.priority === "string"
                      ? JSON.parse(freshNodeForSave.priority)
                      : freshNodeForSave.priority;
                  return typeof p === "object" && p !== null ? p : {};
                } catch {
                  return {};
                }
              })(),
              profile: editPriorityProfile,
              pinned: editPriorityProfile === "pinned",
              frozen: editFrozen,
            }),
          });
          if (runId !== saveRunIdRef.current) {
            return;
          }
          setNode(updated);
          if (editPriorityProfile !== currentPriorityProfile) {
            await refreshAllPriorityScores();
            const freshNode = await getNode(selectedNodeId);
            if (freshNode && runId === saveRunIdRef.current) {
              setNode(freshNode);
            }
          }
          setSaveStatus("saved");
          onSaveSuccess();
          if (saveStatusTimeoutRef.current !== null) {
            window.clearTimeout(saveStatusTimeoutRef.current);
          }
          saveStatusTimeoutRef.current = window.setTimeout(() => {
            if (runId === saveRunIdRef.current) {
              setSaveStatus("idle");
            }
          }, 2000);
        } catch (err) {
          if (runId !== saveRunIdRef.current) {
            return;
          }
          setSaveStatus("idle");
          if (err instanceof AppError) {
            setStatus(err.message);
            return;
          }
          setStatus("Failed to save node.");
        }
      })();
    }, 1000);

    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(timer);
    };
  }, [
    editPriorityProfile,
    editDetail,
    editFrozen,
    editPrivacy,
    editSummary,
    editTitle,
    node,
    onSaveSuccess,
    selectedNodeId,
  ]);

  const priorityScore = useMemo(() => {
    if (!node?.priority) {
      return null;
    }
    try {
      const parsed = typeof node.priority === "string" ? JSON.parse(node.priority) : node.priority;
      if (typeof parsed === "number" && Number.isFinite(parsed)) {
        return parsed;
      }
      if (parsed && typeof parsed === "object" && "score" in parsed) {
        const value = Number((parsed as { score: unknown }).score);
        if (Number.isFinite(value)) {
          return value;
        }
      }
    } catch {
      const fallback = Number(node.priority);
      if (Number.isFinite(fallback)) {
        return fallback;
      }
    }
    return null;
  }, [node]);

  const normalizedTagInput = tagInput.trim().toLowerCase();

  const filteredTagOptions = useMemo(() => {
    const selectedTagIds = new Set(nodeTags.map((tag) => tag.id));
    return availableTags.filter((tag) => {
      if (selectedTagIds.has(tag.id)) {
        return false;
      }
      if (!normalizedTagInput) {
        return true;
      }
      return tag.name.toLowerCase().includes(normalizedTagInput);
    });
  }, [availableTags, nodeTags, normalizedTagInput]);

  const hasExactTagMatch = useMemo(() => {
    if (!normalizedTagInput) {
      return false;
    }
    return availableTags.some((tag) => tag.name.toLowerCase() === normalizedTagInput);
  }, [availableTags, normalizedTagInput]);

  const connectedTargetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const door of outgoingDoors) {
      if (door.targetNodeId) {
        ids.add(door.targetNodeId);
      }
    }
    return ids;
  }, [outgoingDoors]);

  const filteredDoorTargets = useMemo(() => {
    const query = doorSearchQuery.trim().toLowerCase();
    if (!node) {
      return [];
    }
    return allNodes.filter((candidate) => {
      if (candidate.id === node.id) {
        return false;
      }
      if (connectedTargetIds.has(candidate.id)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        candidate.title.toLowerCase().includes(query) ||
        candidate.summary.toLowerCase().includes(query)
      );
    });
  }, [allNodes, connectedTargetIds, doorSearchQuery, node]);

  const { parentTier, effectivePrivacyTier } = useMemo(() => {
    if (!node) {
      return { parentTier: "open", effectivePrivacyTier: "open" };
    }
    const subVault = node.subVaultId
      ? vaults.find((vault) => vault.id === node.subVaultId)
      : undefined;
    const parentVaultId = subVault?.parentVaultId ?? node.vaultId;
    const parentVault = vaults.find((vault) => vault.id === parentVaultId);
    const forcedParentTier = getEffectivePrivacy(
      undefined,
      subVault?.privacyTier,
      parentVault?.privacyTier
    );
    return {
      parentTier: forcedParentTier,
      effectivePrivacyTier: getEffectivePrivacy(
        editPrivacy,
        subVault?.privacyTier,
        parentVault?.privacyTier
      ),
    };
  }, [editPrivacy, node, vaults]);

  const isLocked = effectivePrivacyTier === "redacted" && !isRedactedUnlocked;
  const [authIsSetupState, setAuthIsSetupState] = useState<boolean | null>(null);
  const [lockPasswordInput, setLockPasswordInput] = useState("");
  const [lockError, setLockError] = useState("");

  useEffect(() => {
    if (!isLocked) {
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await isAuthSetup();
        if (result.error) {
          setAuthIsSetupState(false);
          setLockError(result.error.message);
          return;
        }
        setAuthIsSetupState(result.data ?? false);
        setLockError("");
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isLocked]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLockPasswordInput("");
      setLockError("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedNodeId, isLocked]);

  async function onLockSubmit() {
    const password = lockPasswordInput;
    if (!password) {
      return;
    }
    setLockError("");
    if (authIsSetupState) {
      const result = await verifyMasterPassword(password);
      if (result.error) {
        setLockError(result.error.message);
        return;
      }
      if (!result.data) {
        setLockError("Incorrect password");
        return;
      }
      setIsRedactedUnlocked(true);
      setLockPasswordInput("");
      return;
    }
    const result = await setMasterPassword(password);
    if (result.error) {
      setLockError(result.error.message);
      return;
    }
    if (!result.data) {
      setLockError("Failed to set master password.");
      return;
    }
    setAuthIsSetupState(true);
    setIsRedactedUnlocked(true);
    setLockPasswordInput("");
  }

  async function onAddExistingTag(tag: Tag) {
    if (!node) {
      return;
    }
    const result = await addNodeTag(node.id, tag.id);
    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    setTagInput("");
    setIsDropdownOpen(false);
    await refreshNodeTags(node.id);
  }

  async function onCreateAndAddTag() {
    if (!node) {
      return;
    }
    const name = tagInput.trim();
    if (!name) {
      return;
    }
    const created = await createTag({ name });
    if (created.error || !created.data) {
      setStatus(created.error?.message ?? "Failed to create tag.");
      return;
    }
    const added = await addNodeTag(node.id, created.data.id);
    if (added.error) {
      setStatus(added.error.message);
      return;
    }
    setTagInput("");
    setIsDropdownOpen(false);
    setTagRefreshKey((value) => value + 1);
    await refreshNodeTags(node.id);
  }

  async function onRemoveTag(tagId: string) {
    if (!node) {
      return;
    }
    const result = await removeNodeTag(node.id, tagId);
    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    setNodeTags((prev) => prev.filter((tag) => tag.id !== tagId));
  }

  async function onDoorDelete(doorId: string) {
    if (!node) {
      return;
    }
    const result = await deleteDoor(doorId);
    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    await refreshDoors(node.id);
  }

  async function onConfirmConnection() {
    if (!node || !doorTargetId) {
      return;
    }
    const result = repointDoorId
      ? await repointDoor(repointDoorId, doorTargetId)
      : await createDoor({
          sourceNodeId: node.id,
          targetNodeId: doorTargetId,
          label: doorLabelInput.trim() ? doorLabelInput.trim() : undefined,
        });
    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    await refreshDoors(node.id);
    setIsDoorPickerOpen(false);
    setDoorSearchQuery("");
    setDoorTargetId(null);
    setDoorLabelInput("");
    setRepointDoorId(null);
  }

  function onStartRepoint(doorId: string) {
    setRepointDoorId(doorId);
    setIsDoorPickerOpen(true);
    setDoorSearchQuery("");
    setDoorTargetId(null);
    setDoorLabelInput("");
  }

  function onToggleDoorPicker() {
    setIsDoorPickerOpen((value) => {
      const next = !value;
      if (!next) {
        setRepointDoorId(null);
        setDoorSearchQuery("");
        setDoorTargetId(null);
        setDoorLabelInput("");
      }
      return next;
    });
  }

  async function onDelete() {
    if (!selectedNodeId || !window.confirm("Are you sure?")) {
      return;
    }
    try {
      const deleted = await deleteNode(selectedNodeId);
      if (!deleted) {
        setStatus("Node could not be deleted.");
        return;
      }
      onNodeDeleted(selectedNodeId);
      setStatus("Deleted.");
    } catch (err) {
      if (err instanceof AppError) {
        setStatus(err.message);
        return;
      }
      setStatus("Failed to delete node.");
    }
  }

  return (
    <aside className="pane pane-right">
      <div className="pane-header">
        <h3>Editor</h3>
        <div className="editor-actions">
          <span className={`save-status ${saveStatus}`}>
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : ""}
          </span>
          <button type="button" onClick={onDelete} disabled={!selectedNodeId}>
            Delete
          </button>
        </div>
      </div>
      {!selectedNodeId ? (
        <p className="pane-empty">Select a node to edit.</p>
      ) : (
        <div className="editor-form">
          {breadcrumbPath && <p className="editor-breadcrumb">{breadcrumbPath}</p>}
          <div className="editor-meta">
            <label className="editor-privacy">
              <span>Privacy</span>
              {!isLocked && (
                <select
                  value={effectivePrivacyTier}
                  onChange={(e) => setEditPrivacy(e.target.value)}
                >
                  <option
                    value="open"
                    disabled={getPrivacyRank("open") < getPrivacyRank(parentTier)}
                  >
                    Open
                  </option>
                  <option
                    value="local_only"
                    disabled={getPrivacyRank("local_only") < getPrivacyRank(parentTier)}
                  >
                    Local-Only
                  </option>
                  <option
                    value="locked"
                    disabled={getPrivacyRank("locked") < getPrivacyRank(parentTier)}
                  >
                    Locked
                  </option>
                  <option
                    value="redacted"
                    disabled={getPrivacyRank("redacted") < getPrivacyRank(parentTier)}
                  >
                    Redacted
                  </option>
                </select>
              )}
              <span className="effective-privacy">
                (Effective: <PrivacyBadge tier={effectivePrivacyTier} />)
              </span>
            </label>
            {!isLocked && (
              <label className="editor-priority">
                <PriorityBar score={priorityScore} />
                <select
                  value={editPriorityProfile}
                  onChange={(e) => setEditPriorityProfile(e.target.value)}
                >
                  <option value="standard">Standard</option>
                  <option value="slow">Slow</option>
                  <option value="fast">Fast</option>
                  <option value="pinned">Pinned</option>
                </select>
                <button
                  type="button"
                  className={`freeze-toggle ${editFrozen ? "frozen" : ""}`}
                  onClick={() => setEditFrozen((prev) => !prev)}
                  title={
                    editFrozen
                      ? "Unfreeze — allow auto-optimize"
                      : "Freeze — protect from auto-optimize"
                  }
                >
                  ❄️
                </button>
              </label>
            )}
          </div>
          {isLocked ? (
            <div className="redacted-lock-screen">
              <span className="redacted-lock-icon" aria-hidden="true">
                🔒
              </span>
              <h4 className="redacted-lock-title">Redacted</h4>
              <p className="redacted-lock-subtitle">
                {authIsSetupState === false
                  ? "Set a master password to lock and unlock redacted nodes."
                  : "Enter your master password to view this node."}
              </p>
              {authIsSetupState !== null && (
                <form
                  className="redacted-lock-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onLockSubmit();
                  }}
                >
                  <input
                    className="redacted-lock-input"
                    type="password"
                    value={lockPasswordInput}
                    onChange={(event) => setLockPasswordInput(event.target.value)}
                    placeholder={authIsSetupState ? "Master password" : "Choose a master password"}
                    autoFocus
                  />
                  <button type="submit" className="redacted-lock-button">
                    {authIsSetupState ? "Unlock" : "Set Master Password"}
                  </button>
                </form>
              )}
              {lockError && <p className="redacted-lock-error">{lockError}</p>}
            </div>
          ) : (
            <>
              <input
                className="editor-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
              />
              <div className="tag-wrapper">
                <div className="tag-list">
                  {nodeTags.map((tag) => (
                    <span key={tag.id} className="tag-pill">
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => onRemoveTag(tag.id)}
                        aria-label={`Remove ${tag.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  className="tag-input"
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setIsDropdownOpen(false), 120);
                  }}
                />
                {isDropdownOpen && (
                  <div className="tag-dropdown">
                    {filteredTagOptions.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void onAddExistingTag(tag)}
                      >
                        {tag.name}
                      </button>
                    ))}
                    {normalizedTagInput && !hasExactTagMatch && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void onCreateAndAddTag()}
                      >
                        Create new tag: "{tagInput.trim()}"
                      </button>
                    )}
                  </div>
                )}
              </div>
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="Summary"
              />
              <textarea
                className="editor-detail"
                value={editDetail}
                onChange={(e) => setEditDetail(e.target.value)}
                placeholder="Detail"
              />
              <div className="connections-section">
                <div className="connections-header">
                  <h4>Connections</h4>
                  <button type="button" onClick={onToggleDoorPicker}>
                    + Add Connection
                  </button>
                </div>
                <div className="door-list">
                  {outgoingDoors.map((door) => {
                    const targetNode = door.targetNodeId
                      ? allNodesMap[door.targetNodeId]
                      : undefined;
                    const targetTitle = targetNode?.title ?? "Missing target node";
                    return (
                      <div
                        key={door.id}
                        className={`door-item ${door.status === "orphaned" ? "orphaned" : ""}`}
                      >
                        <div className="door-main">
                          <strong>{targetTitle}</strong>
                          {door.status === "orphaned" && (
                            <span className="door-orphan-badge">[Orphaned]</span>
                          )}
                          {door.label && <span className="door-label">{door.label}</span>}
                        </div>
                        <div className="door-actions">
                          {door.status === "orphaned" && (
                            <button
                              type="button"
                              className="door-repoint"
                              onClick={() => onStartRepoint(door.id)}
                            >
                              Re-point
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void onDoorDelete(door.id)}
                            aria-label="Delete door"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="door-list incoming">
                  {incomingDoors
                    .filter((backlink) => Boolean(allNodesMap[backlink.sourceNodeId]))
                    .map((backlink) => {
                      const sourceNode = allNodesMap[backlink.sourceNodeId];
                      const sourceTitle = sourceNode.title;
                      return (
                        <div key={backlink.id} className="door-item">
                          <div className="door-main">
                            <strong>{sourceTitle}</strong>
                            <span className="door-label">Incoming</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {isDoorPickerOpen && (
                  <div className="door-picker">
                    {repointDoorId && <p className="door-picker-mode">Re-point orphaned door</p>}
                    <input
                      type="search"
                      value={doorSearchQuery}
                      onChange={(e) => setDoorSearchQuery(e.target.value)}
                      placeholder="Search nodes to connect..."
                    />
                    <div className="door-search-results">
                      {filteredDoorTargets.map((target) => (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => setDoorTargetId(target.id)}
                        >
                          <strong>{target.title}</strong>
                          <small>{target.summary.slice(0, 72)}</small>
                        </button>
                      ))}
                    </div>
                    {doorTargetId && (
                      <div className="door-create-row">
                        <input
                          type="text"
                          placeholder="Optional label..."
                          value={doorLabelInput}
                          onChange={(e) => setDoorLabelInput(e.target.value)}
                        />
                        <button type="button" onClick={() => void onConfirmConnection()}>
                          Confirm Connect
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {status && <p className="pane-status">{status}</p>}
    </aside>
  );
}

export default NodeEditor;
