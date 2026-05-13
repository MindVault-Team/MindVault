import { useEffect, useMemo, useState } from "react";
import type { Node } from "../ipc";
import { AppError } from "../services/ipcResult";
import { getNode } from "../services/nodes";

type ActiveMemoryPanelProps = {
  selectedNodeIds: string[];
};

type NodePriorityMeta = {
  profile: string;
  accessCount30Active: number;
};

function parsePriorityMeta(priorityJson: string): NodePriorityMeta {
  try {
    const raw = JSON.parse(priorityJson) as Record<string, unknown>;
    const profile = typeof raw.profile === "string" ? raw.profile : "standard";
    const accessCount30Active =
      typeof raw.access_count_30active === "number" ? raw.access_count_30active : 0;
    return { profile, accessCount30Active };
  } catch {
    return { profile: "standard", accessCount30Active: 0 };
  }
}

function shortLabel(node: Node): string {
  const primary = node.title.trim() || node.summary.trim() || node.detail?.trim() || node.id;
  return primary.length > 64 ? `${primary.slice(0, 63)}...` : primary;
}

function ActiveMemoryPanel({ selectedNodeIds }: ActiveMemoryPanelProps) {
  const [loadedNodes, setLoadedNodes] = useState<Node[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      if (selectedNodeIds.length === 0) {
        if (!active) {
          return;
        }
        setLoadedNodes([]);
        setStatus("");
        return;
      }

      try {
        const nodes = await Promise.all(selectedNodeIds.map((id) => getNode(id)));
        if (!active) {
          return;
        }
        setLoadedNodes(nodes.filter((node): node is Node => node !== null));
        setStatus("");
      } catch (error) {
        if (!active) {
          return;
        }
        setLoadedNodes([]);
        if (error instanceof AppError) {
          setStatus(error.message);
        } else {
          setStatus("Unable to load active memory nodes.");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedNodeIds]);

  const nodeCards = useMemo(
    () =>
      loadedNodes.map((node) => {
        const meta = parsePriorityMeta(node.priority);
        return (
          <article key={node.id} className="active-memory-item">
            <div className="active-memory-item-top">
              <strong>{shortLabel(node)}</strong>
              <span className="active-memory-door-stub">🚪 0</span>
            </div>
            <div className="active-memory-item-meta">
              <span className={`active-memory-rate-badge rate-${meta.profile}`}>
                {meta.profile}
              </span>
              <span className="active-memory-usage">activity {meta.accessCount30Active}</span>
            </div>
          </article>
        );
      }),
    [loadedNodes]
  );

  return (
    <section className="active-memory-panel">
      <header className="active-memory-header">
        <h3>Active Memory</h3>
      </header>
      {loadedNodes.length === 0 ? (
        <p className="active-memory-empty">No nodes selected for context.</p>
      ) : (
        <div className="active-memory-list">{nodeCards}</div>
      )}
      {status ? <p className="active-memory-status">{status}</p> : null}
    </section>
  );
}

export default ActiveMemoryPanel;
