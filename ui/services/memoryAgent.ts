import { memoryExtract, type Changeset } from "../ipc";
import { unwrapIpcResult } from "./ipcResult";

/**
 * Extracts proposed memory changesets from the current chat history.
 */
export async function extractMemory(
  provider: string,
  endpoint: string,
  model: string
): Promise<Changeset> {
  return unwrapIpcResult(memoryExtract(provider, endpoint, model));
}
