import { settingsGet, settingsSet } from "../ipc";
import { unwrapIpcResult } from "../services/ipcResult";

const LLM_PROVIDER_KEY = "mindvault.llm.provider";
const OLLAMA_ENDPOINT_KEY = "mindvault.llm.ollama.endpoint";
const LMSTUDIO_ENDPOINT_KEY = "mindvault.llm.lmstudio.endpoint";
const LEGACY_LLM_MODEL_KEY = "mindvault.llm.model";
const DEFAULT_PROVIDER = "ollama";
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
const DEFAULT_LMSTUDIO_ENDPOINT = "http://localhost:1234";

export function getLlmProvider(): string {
  const value = window.localStorage.getItem(LLM_PROVIDER_KEY);
  if (!value || !value.trim()) {
    return DEFAULT_PROVIDER;
  }
  const normalized = value.trim().toLowerCase();
  if (["ollama", "lmstudio", "openai", "anthropic", "google", "xai"].includes(normalized)) {
    return normalized;
  }
  return DEFAULT_PROVIDER;
}

export function setLlmProvider(provider: string, skipEvent = false): void {
  const normalized = provider.trim().toLowerCase();
  const next = ["ollama", "lmstudio", "openai", "anthropic", "google", "xai"].includes(normalized)
    ? normalized
    : DEFAULT_PROVIDER;
  window.localStorage.setItem(LLM_PROVIDER_KEY, next);
  if (!skipEvent) {
    window.dispatchEvent(new CustomEvent("mindvault:llm-settings-changed"));
  }
}

export function getOllamaEndpoint(): string {
  const value = window.localStorage.getItem(OLLAMA_ENDPOINT_KEY);
  if (!value || !value.trim()) {
    return DEFAULT_OLLAMA_ENDPOINT;
  }
  return value;
}

export function setOllamaEndpoint(url: string): void {
  const normalized = url.trim();
  window.localStorage.setItem(OLLAMA_ENDPOINT_KEY, normalized || DEFAULT_OLLAMA_ENDPOINT);
}

export function getLmStudioEndpoint(): string {
  const value = window.localStorage.getItem(LMSTUDIO_ENDPOINT_KEY);
  if (!value || !value.trim()) {
    return DEFAULT_LMSTUDIO_ENDPOINT;
  }
  return value;
}

export function setLmStudioEndpoint(url: string): void {
  const normalized = url.trim();
  window.localStorage.setItem(LMSTUDIO_ENDPOINT_KEY, normalized || DEFAULT_LMSTUDIO_ENDPOINT);
}

export function getLlmModel(provider?: string): string {
  const p = provider || getLlmProvider();
  const providerKey = `mindvault.llm.${p}.model`;
  const existing = window.localStorage.getItem(providerKey);

  if (existing) {
    return existing;
  }

  const legacy = window.localStorage.getItem(LEGACY_LLM_MODEL_KEY);
  if (legacy) {
    window.localStorage.setItem(providerKey, legacy);
    window.localStorage.removeItem(LEGACY_LLM_MODEL_KEY);
    return legacy;
  }

  return "";
}

export function setLlmModel(provider: string, model: string): void {
  window.localStorage.setItem(`mindvault.llm.${provider}.model`, model.trim());
  window.dispatchEvent(new CustomEvent("mindvault:llm-settings-changed"));
}

const LLM_MODE_KEY = "mindvault.llm.mode";

export function getLlmMode(): "local" | "cloud" | "hybrid" {
  const val = window.localStorage.getItem(LLM_MODE_KEY);
  if (val === "cloud" || val === "hybrid") return val;
  return "local";
}

export function setLlmMode(mode: "local" | "cloud" | "hybrid"): void {
  window.localStorage.setItem(LLM_MODE_KEY, mode);
  // Synchronize provider to matching group
  const currentProvider = getLlmProvider();
  if (mode === "local") {
    if (!["ollama", "lmstudio"].includes(currentProvider)) {
      setLlmProvider("ollama", true);
    }
  } else if (mode === "cloud") {
    if (!["openai", "anthropic", "google", "xai"].includes(currentProvider)) {
      setLlmProvider("openai", true);
    }
  }
  window.dispatchEvent(new CustomEvent("mindvault:llm-settings-changed"));
}

export async function getApiKey(provider: string): Promise<string> {
  const value = await unwrapIpcResult(settingsGet(`mindvault.llm.${provider}.apikey`));
  return value || "";
}

export async function setApiKey(provider: string, key: string): Promise<void> {
  await unwrapIpcResult(settingsSet(`mindvault.llm.${provider}.apikey`, key.trim()));
  window.dispatchEvent(new CustomEvent("mindvault:llm-settings-changed"));
}
