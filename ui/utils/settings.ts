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
  return normalized === "lmstudio" ? "lmstudio" : "ollama";
}

export function setLlmProvider(provider: string): void {
  const normalized = provider.trim().toLowerCase();
  const next = normalized === "lmstudio" ? "lmstudio" : "ollama";
  window.localStorage.setItem(LLM_PROVIDER_KEY, next);
  window.dispatchEvent(new CustomEvent("mindvault:llm-settings-changed"));
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
