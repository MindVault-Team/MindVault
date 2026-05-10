import { invoke } from "@tauri-apps/api/core";
import type {
  Backlink,
  Door,
  DoorCreateInput,
  Node,
  NodeCreateInput,
  NodeUpdateInput,
  OnboardingProposedNode,
  Tag,
  TagCreateInput,
  Vault,
  VaultCreateInput,
  VaultUpdateInput,
} from "./types/generated";

export type IpcResult<T> = { ok: T } | { err: string };
export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};
export type {
  Backlink,
  Door,
  DoorCreateInput,
  Node,
  NodeCreateInput,
  NodeUpdateInput,
  OnboardingProposedNode,
  Tag,
  TagCreateInput,
  Vault,
  VaultCreateInput,
  VaultUpdateInput,
};

async function invokeTyped<T>(
  command: string,
  payload?: Record<string, unknown>
): Promise<IpcResult<T>> {
  try {
    return await invoke<IpcResult<T>>(command, payload);
  } catch (error) {
    return { err: String(error) };
  }
}

export function greet(name: string) {
  return invokeTyped<string>("greet", { name });
}

export function dbPing() {
  return invokeTyped<string>("db_ping");
}

export function settingsGet(key: string) {
  return invokeTyped<string | null>("settings_get", { key });
}

export function settingsSet(key: string, value: string) {
  return invokeTyped<boolean>("settings_set", { key, value });
}

export function onboardingGetComplete() {
  return settingsGet("onboarding_complete");
}

export function onboardingSetComplete(isComplete: boolean) {
  return settingsSet("onboarding_complete", JSON.stringify(isComplete));
}

export function chatGetHistory() {
  return invokeTyped<ChatMessage[]>("chat_get_history");
}

export function chatAppendMessage(id: string, role: string, content: string) {
  return invokeTyped<void>("chat_append_message", { id, role, content });
}

export function chatClearHistory() {
  return invokeTyped<void>("chat_clear_history");
}

export function vaultCreate(input: VaultCreateInput) {
  return invokeTyped<Vault>("vault_create", { input });
}

export function vaultList() {
  return invokeTyped<Vault[]>("vault_list");
}

export function vaultDelete(vaultId: string) {
  return invokeTyped<boolean>("vault_delete", { vaultId });
}

export function vaultUpdate(input: VaultUpdateInput) {
  return invokeTyped<Vault>("vault_update", { input });
}

export function nodeCreate(input: NodeCreateInput) {
  return invokeTyped<Node>("node_create", { input });
}

export function nodeGet(nodeId: string) {
  return invokeTyped<Node | null>("node_get", { nodeId });
}

export function nodeList() {
  return invokeTyped<Node[]>("node_list");
}

export function nodeUpdate(input: NodeUpdateInput) {
  return invokeTyped<Node>("node_update", { input });
}

export function nodeDelete(nodeId: string) {
  return invokeTyped<boolean>("node_delete", { nodeId });
}

export function nodeTouch(nodeId: string) {
  return invokeTyped<boolean>("node_touch", { nodeId });
}

export function tagList() {
  return invokeTyped<Tag[]>("tag_list");
}

export function tagCreate(input: TagCreateInput) {
  return invokeTyped<Tag>("tag_create", { input });
}

export function nodeTagsGet(nodeId: string) {
  return invokeTyped<Tag[]>("node_tags_get", { nodeId });
}

export function nodeTagAdd(nodeId: string, tagId: string) {
  return invokeTyped<boolean>("node_tag_add", { nodeId, tagId });
}

export function nodeTagRemove(nodeId: string, tagId: string) {
  return invokeTyped<boolean>("node_tag_remove", { nodeId, tagId });
}

export function doorCreate(input: DoorCreateInput) {
  return invokeTyped<Door>("door_create", { input });
}

export function doorListOutgoing(nodeId: string) {
  return invokeTyped<Door[]>("door_list_outgoing", { nodeId });
}

export function doorListIncoming(nodeId: string) {
  return invokeTyped<Backlink[]>("door_list_incoming", { nodeId });
}

export function doorDelete(doorId: string) {
  return invokeTyped<boolean>("door_delete", { doorId });
}

export function doorRepoint(doorId: string, targetNodeId: string) {
  return invokeTyped<boolean>("door_repoint", { doorId, targetNodeId });
}

export function authIsSetup() {
  return invokeTyped<boolean>("auth_secret_is_setup");
}

export function authSetPassword(password: string) {
  return invokeTyped<boolean>("auth_secret_set", { passphrase: password });
}

export function authVerifyPassword(password: string) {
  return invokeTyped<boolean>("auth_secret_verify", { passphrase: password });
}

export function decayRefreshAll() {
  return invokeTyped<number>("decay_refresh_all");
}

export function decayOptimizeAll() {
  return invokeTyped<number>("decay_optimize_all");
}

export function debugAssembleContext(nodeIds: string[], scope: string) {
  return invokeTyped<string>("debug_assemble_context", { nodeIds, scope });
}

export async function countTokens(text: string): Promise<number> {
  const result = await invokeTyped<number>("llm_count_tokens", { text });
  if ("ok" in result) {
    return result.ok;
  }
  throw new Error(result.err);
}

export function listLlmModels(provider: string, endpoint: string) {
  return invokeTyped<string[]>("llm_list_models", { provider, endpoint });
}

export function chatWithLlm(
  nodeIds: string[],
  scope: string,
  provider: string,
  endpoint: string,
  model: string,
  userPrompt: string
) {
  return invoke<string>("llm_chat", {
    nodeIds,
    scope,
    provider,
    endpoint,
    model,
    userPrompt,
  })
    .then((ok) => ({ ok }) as IpcResult<string>)
    .catch((error) => ({ err: String(error) }) as IpcResult<string>);
}

/** One-shot onboarding extraction: Q&A JSON → proposed nodes (calls configured LLM). */
export function onboardingExtractProposals(
  answersJson: string,
  provider: string,
  endpoint: string,
  model: string
) {
  return invoke<OnboardingProposedNode[]>("onboarding_extract_proposals", {
    answersJson,
    provider,
    endpoint,
    model,
  })
    .then((ok) => ({ ok }) as IpcResult<OnboardingProposedNode[]>)
    .catch((error) => ({ err: String(error) }) as IpcResult<OnboardingProposedNode[]>);
}
