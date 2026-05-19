import { useEffect, useState } from "react";
import { DEV_ONBOARDING_CHANGED } from "../constants/devEvents";
import { onboardingExtractProposals } from "../ipc";
import { getLlmModels } from "../services/nodes";
import { unwrapIpcResult } from "../services/ipcResult";
import { AppError } from "../services/ipcResult";
import { getOnboardingComplete, setOnboardingComplete } from "../services/settings";
import {
  getLlmModel,
  getLlmProvider,
  getLmStudioEndpoint,
  getOllamaEndpoint,
  setLlmModel,
  setLlmProvider,
  setLmStudioEndpoint,
  setOllamaEndpoint,
} from "../utils/settings";

type Provider = "ollama" | "lmstudio";

const DEV_SAMPLE_ONBOARDING_ANSWERS = `{
  "displayName": "Dev Tester",
  "useMindVaultFor": "capturing context for projects",
  "workContext": "software engineer on a small team",
  "interests": "running, reading, local LLMs"
}`;

function LlmSettings() {
  const showDevOnboardingTools = import.meta.env.DEV;
  const [onboardingCompleteLabel, setOnboardingCompleteLabel] = useState<string>("…");
  const [onboardingDevBusy, setOnboardingDevBusy] = useState(false);
  const [extractionAnswersJson, setExtractionAnswersJson] = useState(DEV_SAMPLE_ONBOARDING_ANSWERS);
  const [extractionPreview, setExtractionPreview] = useState("");
  const [extractionBusy, setExtractionBusy] = useState(false);

  const [provider, setProvider] = useState<Provider>(() => {
    return getLlmProvider() === "lmstudio" ? "lmstudio" : "ollama";
  });
  const [ollamaEndpoint, setOllamaEndpointState] = useState(() => getOllamaEndpoint());
  const [lmStudioEndpoint, setLmStudioEndpointState] = useState(() => getLmStudioEndpoint());
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => getLlmModel());
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endpoint = provider === "ollama" ? ollamaEndpoint : lmStudioEndpoint;

  useEffect(() => {
    if (!showDevOnboardingTools) {
      return;
    }
    void (async () => {
      try {
        const done = await getOnboardingComplete();
        setOnboardingCompleteLabel(done ? "complete" : "not complete");
      } catch {
        setOnboardingCompleteLabel("error");
      }
    })();
  }, [showDevOnboardingTools]);

  useEffect(() => {
    let active = true;
    if (!endpoint.trim()) return;
    void (async () => {
      try {
        const fetchedModels = await getLlmModels(provider, endpoint.trim());
        if (active) {
          setModels(fetchedModels);
        }
      } catch (e) {
        console.warn("Auto-fetch models failed:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [provider, endpoint]);

  useEffect(() => {
    function handleSettingsChange() {
      const nextProvider = getLlmProvider() === "lmstudio" ? "lmstudio" : "ollama";
      setProvider(nextProvider);
      setSelectedModel(getLlmModel(nextProvider));
    }
    window.addEventListener("mindvault:llm-settings-changed", handleSettingsChange);
    return () => {
      window.removeEventListener("mindvault:llm-settings-changed", handleSettingsChange);
    };
  }, []);

  async function refreshOnboardingDevState() {
    try {
      const done = await getOnboardingComplete();
      setOnboardingCompleteLabel(done ? "complete" : "not complete");
    } catch {
      setOnboardingCompleteLabel("error");
    }
    window.dispatchEvent(new CustomEvent(DEV_ONBOARDING_CHANGED));
  }

  async function onDevTestOnboardingExtraction() {
    setExtractionPreview("");
    if (!selectedModel.trim()) {
      setExtractionPreview("Pick a model first (Test Connection & Fetch Models), then try again.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractionAnswersJson.trim()) as unknown;
    } catch {
      setExtractionPreview("Answers JSON is invalid — fix JSON syntax.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setExtractionPreview("Answers must be a JSON object at the top level.");
      return;
    }

    setExtractionBusy(true);
    try {
      const proposals = await unwrapIpcResult(
        onboardingExtractProposals(
          extractionAnswersJson.trim(),
          provider,
          endpoint.trim(),
          selectedModel.trim()
        )
      );
      setExtractionPreview(JSON.stringify(proposals, null, 2));
      setStatus(`Dev: onboarding_extract_proposals OK (${proposals.length} proposal(s)).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExtractionPreview(`Error:\n${message}`);
      setStatus("Dev: extraction failed — see Developer panel.");
    } finally {
      setExtractionBusy(false);
    }
  }

  async function onTestConnection() {
    setIsLoading(true);
    setStatus("");
    try {
      const fetchedModels = await getLlmModels(provider, endpoint.trim());
      setModels(fetchedModels);
      if (fetchedModels.length === 0) {
        setStatus("Connected, but no models were returned.");
      } else {
        const nextModel =
          selectedModel && fetchedModels.includes(selectedModel) ? selectedModel : fetchedModels[0];
        setSelectedModel(nextModel);
        setLlmModel(provider, nextModel);
        setStatus(`Connected. Found ${fetchedModels.length} model(s).`);
      }
    } catch (err) {
      if (err instanceof AppError) {
        setStatus(err.message);
      } else {
        setStatus("Failed to connect to endpoint.");
      }
    }
    setIsLoading(false);
  }

  function onSaveSettings() {
    setLlmProvider(provider);
    if (provider === "ollama") {
      setOllamaEndpoint(ollamaEndpoint);
      setOllamaEndpointState(getOllamaEndpoint());
      setStatus("Saved Ollama settings.");
    } else {
      setLmStudioEndpoint(lmStudioEndpoint);
      setLmStudioEndpointState(getLmStudioEndpoint());
      setStatus("Saved LM Studio settings.");
    }
  }

  function onSelectModel(model: string) {
    setSelectedModel(model);
    setLlmModel(provider, model);
    setStatus("Saved model.");
  }

  function onProviderChange(nextProvider: Provider) {
    setProvider(nextProvider);
    setLlmProvider(nextProvider);
    setModels([]);
    setStatus("");
    setSelectedModel(getLlmModel(nextProvider));
  }

  return (
    <aside className="pane pane-right llm-settings">
      <div className="pane-header">
        <h3>⚙️ LLM Settings</h3>
      </div>

      <div className="provider-toggle" role="radiogroup" aria-label="LLM provider">
        <label>
          <input
            type="radio"
            name="llm-provider"
            checked={provider === "ollama"}
            onChange={() => onProviderChange("ollama")}
          />
          Ollama
        </label>
        <label>
          <input
            type="radio"
            name="llm-provider"
            checked={provider === "lmstudio"}
            onChange={() => onProviderChange("lmstudio")}
          />
          LM Studio
        </label>
      </div>

      <label className="settings-field">
        <span>Endpoint URL</span>
        <input
          type="text"
          value={endpoint}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (provider === "ollama") {
              setOllamaEndpointState(nextValue);
            } else {
              setLmStudioEndpointState(nextValue);
            }
            setModels([]);
            setStatus("");
            setSelectedModel("");
            setLlmModel(provider, "");
          }}
          placeholder={provider === "ollama" ? "http://localhost:11434" : "http://localhost:1234"}
        />
      </label>

      <button type="button" className="settings-action" onClick={() => void onTestConnection()}>
        {isLoading ? "Testing..." : "Test Connection & Fetch Models"}
      </button>

      <label className="settings-field">
        <span>Model</span>
        <select
          value={selectedModel}
          onChange={(event) => onSelectModel(event.target.value)}
          disabled={models.length === 0 && !selectedModel}
        >
          {models.length === 0 ? <option value="">No models loaded</option> : null}
          {selectedModel && !models.includes(selectedModel) ? (
            <option value={selectedModel}>{selectedModel} (Saved)</option>
          ) : null}
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="settings-action save" onClick={onSaveSettings}>
        Save
      </button>

      {showDevOnboardingTools ? (
        <div className="llm-settings-dev" aria-label="Developer onboarding shortcuts">
          <h4 className="llm-settings-dev-title">Developer</h4>
          <p className="llm-settings-dev-line">
            Onboarding: <strong>{onboardingCompleteLabel}</strong>
          </p>
          <div className="llm-settings-dev-actions">
            <button
              type="button"
              className="settings-action"
              disabled={onboardingDevBusy}
              onClick={() => {
                setOnboardingDevBusy(true);
                void (async () => {
                  try {
                    await setOnboardingComplete(false);
                    await refreshOnboardingDevState();
                    setStatus("Onboarding reset: wizard should appear.");
                  } catch (err) {
                    setStatus(err instanceof Error ? err.message : String(err));
                  } finally {
                    setOnboardingDevBusy(false);
                  }
                })();
              }}
            >
              Reset onboarding
            </button>
            <button
              type="button"
              className="settings-action"
              disabled={onboardingDevBusy}
              onClick={() => {
                setOnboardingDevBusy(true);
                void (async () => {
                  try {
                    await setOnboardingComplete(true);
                    await refreshOnboardingDevState();
                    setStatus("Onboarding marked complete.");
                  } catch (err) {
                    setStatus(err instanceof Error ? err.message : String(err));
                  } finally {
                    setOnboardingDevBusy(false);
                  }
                })();
              }}
            >
              Mark onboarding done
            </button>
          </div>

          <label className="settings-field llm-settings-dev-field">
            <span>Test onboarding_extract_proposals (answers JSON)</span>
            <textarea
              className="llm-settings-dev-json-input"
              rows={6}
              spellCheck={false}
              value={extractionAnswersJson}
              onChange={(event) => setExtractionAnswersJson(event.target.value)}
              aria-label="Sample onboarding answers JSON"
            />
          </label>
          <button
            type="button"
            className="settings-action"
            disabled={extractionBusy || onboardingDevBusy}
            onClick={() => void onDevTestOnboardingExtraction()}
          >
            {extractionBusy ? "Running extraction…" : "Run onboarding extraction"}
          </button>
          {extractionPreview ? (
            <pre className="llm-settings-dev-json-preview" tabIndex={0}>
              {extractionPreview}
            </pre>
          ) : null}

          <p className="llm-settings-dev-note">Shown only in dev builds.</p>
        </div>
      ) : null}

      {status && <p className="pane-status">{status}</p>}
    </aside>
  );
}

export default LlmSettings;
