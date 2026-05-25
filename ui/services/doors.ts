import {
  doorCreate,
  doorDelete,
  doorListIncoming,
  doorListOutgoing,
  doorRepoint,
  doorListAll,
  type Backlink,
  type Door,
  type DoorCreateInput,
} from "../ipc";
import { AppError } from "./ipcResult";

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: AppError };

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(String(error));
}

export async function createDoor(input: DoorCreateInput): Promise<ServiceResult<Door>> {
  const result = await doorCreate(input);
  if ("ok" in result) {
    return { data: result.ok, error: null };
  }
  return { data: null, error: toAppError(result.err) };
}

export async function listOutgoingDoors(nodeId: string): Promise<ServiceResult<Door[]>> {
  const result = await doorListOutgoing(nodeId);
  if ("ok" in result) {
    return { data: result.ok, error: null };
  }
  return { data: null, error: toAppError(result.err) };
}

export async function listIncomingDoors(nodeId: string): Promise<ServiceResult<Backlink[]>> {
  const result = await doorListIncoming(nodeId);
  if ("ok" in result) {
    return { data: result.ok, error: null };
  }
  return { data: null, error: toAppError(result.err) };
}

export async function deleteDoor(doorId: string): Promise<ServiceResult<boolean>> {
  const result = await doorDelete(doorId);
  if ("ok" in result) {
    return { data: result.ok, error: null };
  }
  return { data: null, error: toAppError(result.err) };
}

export async function repointDoor(
  doorId: string,
  targetNodeId: string
): Promise<ServiceResult<boolean>> {
  const result = await doorRepoint(doorId, targetNodeId);
  if ("ok" in result) {
    return { data: result.ok, error: null };
  }
  return { data: null, error: toAppError(result.err) };
}

export async function listAllDoors(): Promise<ServiceResult<Door[]>> {
  const result = await doorListAll();
  if ("ok" in result) {
    return { data: result.ok, error: null };
  }
  return { data: null, error: toAppError(result.err) };
}
