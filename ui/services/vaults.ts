import {
  vaultCreate,
  vaultDelete,
  vaultList,
  vaultUpdate,
  vaultGet,
  vaultUpdatePosition,
  vaultUpdateColorTheme,
  type Node,
  type Vault,
  type VaultCreateInput,
  type VaultUpdateInput,
} from "../ipc";
import { unwrapIpcResult } from "./ipcResult";

export async function createVault(input: VaultCreateInput): Promise<Vault> {
  return unwrapIpcResult(vaultCreate(input));
}

export async function listVaults(): Promise<Vault[]> {
  return unwrapIpcResult(vaultList());
}

export async function deleteVault(vaultId: string): Promise<boolean> {
  return unwrapIpcResult(vaultDelete(vaultId));
}

export async function updateVault(input: VaultUpdateInput): Promise<Vault> {
  return unwrapIpcResult(vaultUpdate(input));
}

function getParentVaultId(vault: Vault): string | null {
  const parentFromCamel = vault.parentVaultId ?? null;
  const parentFromSnake =
    (vault as unknown as { parent_vault_id?: string | null }).parent_vault_id ?? null;
  return parentFromCamel ?? parentFromSnake;
}

export function resolveVaultPath(node: Node, allVaults: Vault[]): string {
  const vaultById = new Map<string, Vault>();
  for (const vault of allVaults) {
    vaultById.set(vault.id, vault);
  }

  if (node.subVaultId) {
    const parentVault = vaultById.get(node.vaultId);
    const childVault = vaultById.get(node.subVaultId);
    if (parentVault && childVault) {
      return `${parentVault.name} / ${childVault.name}`;
    }
    if (childVault) {
      return childVault.name;
    }
    if (parentVault) {
      return parentVault.name;
    }
    return "Unknown Vault";
  }

  const topLevelVault = vaultById.get(node.vaultId);
  if (!topLevelVault) {
    return "Unknown Vault";
  }

  const parentVaultId = getParentVaultId(topLevelVault);
  if (!parentVaultId) {
    return topLevelVault.name;
  }

  const parentVault = vaultById.get(parentVaultId);
  return parentVault ? `${parentVault.name} / ${topLevelVault.name}` : topLevelVault.name;
}

export async function getVault(vaultId: string): Promise<Vault | null> {
  return unwrapIpcResult(vaultGet(vaultId));
}

const positionDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function updateVaultPosition(vaultId: string, x: number, y: number): void {
  const existing = positionDebounceTimers.get(vaultId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(async () => {
    positionDebounceTimers.delete(vaultId);
    try {
      await unwrapIpcResult(vaultUpdatePosition(vaultId, x, y));
    } catch (err) {
      console.error("Failed to update vault position:", err);
    }
  }, 300);
  positionDebounceTimers.set(vaultId, timer);
}

export async function updateVaultColorTheme(vaultId: string, colorTheme: string): Promise<boolean> {
  try {
    return await unwrapIpcResult(vaultUpdateColorTheme(vaultId, colorTheme));
  } catch (err) {
    console.error("Failed to update vault color theme:", err);
    return false;
  }
}
