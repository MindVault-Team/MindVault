import {
  chatAppendMessage as ipcChatAppendMessage,
  chatClearHistory as ipcChatClearHistory,
  chatGetHistory as ipcChatGetHistory,
  chatEditAndTruncate as ipcChatEditAndTruncate,
  type ChatMessage,
} from "../ipc";
import { unwrapIpcResult } from "./ipcResult";

export type { ChatMessage };

export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  return unwrapIpcResult(ipcChatGetHistory(sessionId));
}

export async function chatAppendMessage(id: string, role: string, content: string): Promise<void> {
  return unwrapIpcResult(ipcChatAppendMessage(id, role, content));
}

export async function clearChatHistory(sessionId: string): Promise<void> {
  return unwrapIpcResult(ipcChatClearHistory(sessionId));
}

export async function chatEditAndTruncate(
  editId: string,
  newContent: string,
  deleteIds: string[]
): Promise<void> {
  return unwrapIpcResult(ipcChatEditAndTruncate(editId, newContent, deleteIds));
}
