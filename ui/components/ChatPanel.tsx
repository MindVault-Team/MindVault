import React, { useEffect, useMemo, useState, useRef, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  TbBrandPython,
  TbBrandJavascript,
  TbBrandTypescript,
  TbBrandRust,
  TbBrandHtml5,
  TbBrandCss3,
  TbDatabase,
  TbTerminal2,
  TbBraces,
  TbMarkdown,
  TbBrandGolang,
  TbBrandCpp,
  TbCode,
} from "react-icons/tb";
import type { ContextAssemblerScope } from "../constants/contextBudget";
import type { Vault } from "../ipc";
import {
  chatAppendMessage,
  clearChatHistory,
  getChatHistory,
  type ChatMessage,
} from "../services/chat";
import { chatWithScope } from "../services/nodes";
import { getSetting } from "../services/settings";
import { listVaults } from "../services/vaults";
import {
  getLlmModel,
  getLlmProvider,
  getLmStudioEndpoint,
  getOllamaEndpoint,
  getLlmMode,
  setLlmMode,
  getApiKey,
} from "../utils/settings";

type CodeBlockProps = {
  language: string;
  code: string;
};

function getLanguageIcon(language: string): React.ReactNode {
  const lang = language.toLowerCase().trim();
  if (!lang) return null;

  const size = 15;

  switch (lang) {
    case "python":
    case "py":
      return <TbBrandPython size={size} />;
    case "javascript":
    case "js":
      return <TbBrandJavascript size={size} />;
    case "typescript":
    case "ts":
      return <TbBrandTypescript size={size} />;
    case "rust":
    case "rs":
      return <TbBrandRust size={size} />;
    case "bash":
    case "sh":
    case "shell":
    case "zsh":
      return <TbTerminal2 size={size} />;
    case "json":
      return <TbBraces size={size} />;
    case "html":
      return <TbBrandHtml5 size={size} />;
    case "css":
      return <TbBrandCss3 size={size} />;
    case "sql":
      return <TbDatabase size={size} />;
    case "markdown":
    case "md":
      return <TbMarkdown size={size} />;
    case "go":
    case "golang":
      return <TbBrandGolang size={size} />;
    case "cpp":
    case "c++":
    case "c":
      return <TbBrandCpp size={size} />;
    default:
      return <TbCode size={size} />;
  }
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code block:", err);
    }
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <div className="code-block-lang-container">
          {getLanguageIcon(language)}
          <span className="code-block-lang">{language}</span>
        </div>
        <button
          type="button"
          className="code-block-copy-btn"
          onClick={handleCopy}
          aria-label={copied ? "Copied to clipboard" : "Copy code"}
          title={copied ? "Copied!" : "Copy"}
        >
          {copied ? (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ) : (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          )}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

type ChatPanelProps = {
  selectedNodeIds: string[];
  scope: ContextAssemblerScope;
  selectedVaultId: string | null;
  onSelectVault: (vaultId: string | null) => void;
  onOpenSettings?: () => void;
  isRedactedUnlocked: boolean;
};

function ChatPanel({
  selectedNodeIds,
  scope,
  selectedVaultId,
  onSelectVault,
  onOpenSettings,
  isRedactedUnlocked,
}: ChatPanelProps) {
  const MAX_RENDERED_MESSAGES = 120;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [status, setStatus] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const [userName, setUserName] = useState("Lisa");
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [agentMode, setAgentMode] = useState<"Recall/Chat" | "Ingest/Memory" | "Onboarding">(
    "Recall/Chat"
  );
  const [currentProvider, setCurrentProvider] = useState(() => getLlmProvider());
  const [currentModel, setCurrentModel] = useState(() => getLlmModel());
  const [currentMode, setCurrentMode] = useState(() => getLlmMode());
  const [activeDropdown, setActiveDropdown] = useState<
    "vault" | "mode" | "model" | "overflow" | null
  >(null);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 250)}px`;
    }
  }, [input]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const timeOfDay = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  }, []);

  const selectedVaultName = useMemo(() => {
    if (!selectedVaultId) return "Root Graph";
    const match = vaults.find((v) => v.id === selectedVaultId);
    return match ? match.name : "Root Graph";
  }, [selectedVaultId, vaults]);

  const activeModelDisplay = useMemo(() => {
    const isCloud = ["openai", "anthropic", "google", "xai"].includes(currentProvider);
    if (isCloud) {
      let niceName = currentProvider.charAt(0).toUpperCase() + currentProvider.slice(1);
      if (currentProvider === "openai") niceName = "OpenAI";
      if (currentProvider === "anthropic") niceName = "Anthropic";
      if (currentProvider === "google") niceName = "Google Gemini";
      if (currentProvider === "xai") niceName = "xAI Grok";
      return `Cloud: ${currentModel || "Model"} (${niceName})`;
    }
    const niceName = currentProvider === "ollama" ? "Ollama" : "LM Studio";
    return `Local: ${currentModel || "Model"} (${niceName})`;
  }, [currentProvider, currentModel]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const name = await getSetting("displayName");
        if (active && name && name.trim()) {
          setUserName(name.trim());
        }
      } catch (e) {
        console.error("Failed to load user name:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleSettingsChange() {
      setCurrentProvider(getLlmProvider());
      setCurrentModel(getLlmModel());
      setCurrentMode(getLlmMode());
    }
    window.addEventListener("mindvault:llm-settings-changed", handleSettingsChange);
    return () => {
      window.removeEventListener("mindvault:llm-settings-changed", handleSettingsChange);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await listVaults();
        if (active) {
          setVaults(data);
        }
      } catch (e) {
        console.error("Failed to load vaults:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedVaultId]);

  useEffect(() => {
    if (!activeDropdown) return;
    function handleGlobalClick() {
      setActiveDropdown(null);
    }
    const timer = setTimeout(() => {
      window.addEventListener("click", handleGlobalClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [activeDropdown]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const history = await getChatHistory();
        if (!active) {
          return;
        }
        setMessages(history);
        setStatus("");
      } catch (error) {
        if (!active) {
          return;
        }
        setStatus(String(error));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const canSend = useMemo(
    () => input.trim().length > 0 && !isSending && !isClearing,
    [input, isSending, isClearing]
  );
  const visibleMessages = useMemo(() => {
    if (messages.length <= MAX_RENDERED_MESSAGES) {
      return messages;
    }
    return messages.slice(-MAX_RENDERED_MESSAGES);
  }, [messages]);
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessages.length);

  async function executeSendMessage(promptText: string) {
    if (isSending || isClearing || !promptText.trim()) return;

    setStatus("");
    setIsSending(true);

    const userMsgId = crypto.randomUUID();
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: promptText,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const persistUserMessage = chatAppendMessage(userMsgId, "user", promptText);

      const provider = getLlmProvider();
      let endpoint = "";
      if (provider === "lmstudio") {
        endpoint = getLmStudioEndpoint();
      } else if (provider === "ollama") {
        endpoint = getOllamaEndpoint();
      } else if (["openai", "anthropic", "google", "xai"].includes(provider)) {
        endpoint = await getApiKey(provider);
      }
      const model = getLlmModel();

      let executionPrompt = promptText;
      if (agentMode === "Ingest/Memory") {
        executionPrompt = `[Agent Mode: Ingest/Memory] Please extract, deduplicate, and store the following input as a new Node in the memory system. Do not generate a long conversational response, just confirm storage details or output a brief success summary:\n\n${promptText}`;
      } else if (agentMode === "Onboarding") {
        executionPrompt = `[Agent Mode: Onboarding] Act as the Onboarding Agent. Conduct an interview and ask clarifying questions to help build initial context for the user:\n\n${promptText}`;
      }

      const aiResponse = await chatWithScope(
        selectedNodeIds,
        scope,
        provider,
        endpoint,
        model,
        executionPrompt,
        isRedactedUnlocked
      );
      await persistUserMessage;

      const aiMsgId = crypto.randomUUID();
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        role: "assistant",
        content: aiResponse,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      await chatAppendMessage(aiMsgId, "assistant", aiResponse);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setIsSending(false);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    const promptText = input.trim();
    setInput("");
    await executeSendMessage(promptText);
  }

  async function handleClearChat() {
    if (isSending || isClearing || messages.length === 0) {
      return;
    }
    const shouldClear = window.confirm(
      "Are you sure you want to permanently delete all messages in this conversation? This cannot be undone."
    );
    if (!shouldClear) {
      return;
    }

    setIsClearing(true);
    setStatus("");
    try {
      await clearChatHistory();
      setMessages([]);
      setStatus("Chat cleared.");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setIsClearing(false);
    }
  }

  async function handleNewChat() {
    if (isSending || isClearing) return;
    setIsClearing(true);
    setStatus("");
    try {
      await clearChatHistory();
      setMessages([]);
      setInput("");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setIsClearing(false);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  async function handleCopyMessage(content: string, id: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  }

  async function handleRetryMessage(index: number) {
    // Find the last user message before this assistant message
    let targetPrompt = "";
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        targetPrompt = messages[i].content;
        break;
      }
    }
    if (targetPrompt) {
      await executeSendMessage(targetPrompt);
    }
  }

  function toggleDropdown(type: "vault" | "mode" | "model" | "overflow") {
    setActiveDropdown((prev) => (prev === type ? null : type));
  }

  function handleSelectVault(vaultId: string | null) {
    onSelectVault(vaultId);
    setActiveDropdown(null);
  }

  function handleSelectMode(mode: "Recall/Chat" | "Ingest/Memory" | "Onboarding") {
    setAgentMode(mode);
    setActiveDropdown(null);
  }

  function handleSelectModeSettings(mode: "local" | "cloud" | "hybrid") {
    setLlmMode(mode);
    setCurrentMode(mode);
    setActiveDropdown(null);
    if (onOpenSettings) {
      onOpenSettings();
    }
  }

  if (messages.length === 0) {
    return (
      <section className="chat-panel zen-dashboard">
        <div className="zen-container">
          <h1 className="zen-greeting">
            Good {timeOfDay}, <span className="zen-username">{userName}</span>
          </h1>
          <div className="zen-search-wrapper">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask MindVault..."
              className="zen-search-input"
              autoFocus
              disabled={isSending || isClearing}
              rows={1}
            />
            <button
              type="button"
              className="zen-search-submit"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending || isClearing}
              aria-label="Send query"
            >
              ➔
            </button>
          </div>

          <div className="zen-pills-row">
            {/* Pill 1: Active Vault */}
            <div className="zen-pill-container" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`zen-pill ${activeDropdown === "vault" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDropdown("vault");
                }}
              >
                <span className="zen-pill-icon">📁</span>
                <span className="zen-pill-label">Vault:</span>
                <span className="zen-pill-value">{selectedVaultName}</span>
                <span className="zen-pill-chevron">▾</span>
              </button>
              {activeDropdown === "vault" && (
                <div className="zen-dropdown">
                  <div className="zen-dropdown-header">Select Scoped Memory Domain</div>
                  <button
                    type="button"
                    className={`zen-dropdown-item ${!selectedVaultId ? "selected" : ""}`}
                    onClick={() => handleSelectVault(null)}
                  >
                    <span className="item-icon">🌐</span>
                    <span className="item-text">Root Graph (Global Context)</span>
                  </button>
                  {vaults.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`zen-dropdown-item ${selectedVaultId === v.id ? "selected" : ""}`}
                      onClick={() => handleSelectVault(v.id)}
                    >
                      <span className="item-icon">📁</span>
                      <span className="item-text">{v.name}</span>
                      <span className="item-badge">{v.privacyTier.replace("_", " ")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pill 2: Agent Mode */}
            <div className="zen-pill-container" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`zen-pill ${activeDropdown === "mode" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDropdown("mode");
                }}
              >
                <span className="zen-pill-icon">✦</span>
                <span className="zen-pill-label">Mode:</span>
                <span className="zen-pill-value">{agentMode}</span>
                <span className="zen-pill-chevron">▾</span>
              </button>
              {activeDropdown === "mode" && (
                <div className="zen-dropdown animate-fade-in">
                  <div className="zen-dropdown-header">Select Intent / Execution State</div>
                  <button
                    type="button"
                    className={`zen-dropdown-item ${agentMode === "Recall/Chat" ? "selected" : ""}`}
                    onClick={() => handleSelectMode("Recall/Chat")}
                  >
                    <span className="item-icon">💬</span>
                    <div className="item-details">
                      <div className="item-title">Recall/Chat</div>
                      <div className="item-desc">
                        MACRL routing to fetch relevant Nodes & converse
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`zen-dropdown-item ${agentMode === "Ingest/Memory" ? "selected" : ""}`}
                    onClick={() => handleSelectMode("Ingest/Memory")}
                  >
                    <span className="item-icon">📥</span>
                    <div className="item-details">
                      <div className="item-title">Ingest/Memory</div>
                      <div className="item-desc">
                        Extract, deduplicate, and store input as new Node
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`zen-dropdown-item ${agentMode === "Onboarding" ? "selected" : ""}`}
                    onClick={() => handleSelectMode("Onboarding")}
                  >
                    <span className="item-icon">🎓</span>
                    <div className="item-details">
                      <div className="item-title">Onboarding</div>
                      <div className="item-desc">
                        Trigger Onboarding Agent interview for context
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Pill 3: Model */}
            <div className="zen-pill-container" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`zen-pill ${activeDropdown === "model" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDropdown("model");
                }}
              >
                <span className="zen-pill-icon">⚙</span>
                <span className="zen-pill-label">Model:</span>
                <span className="zen-pill-value">{activeModelDisplay}</span>
                <span className="zen-pill-chevron">▾</span>
              </button>
              {activeDropdown === "model" && (
                <div className="zen-dropdown models-dropdown">
                  <div className="zen-dropdown-header">Select Model Environment</div>

                  <button
                    type="button"
                    className={`zen-dropdown-item ${currentMode === "local" ? "selected" : ""}`}
                    onClick={() => handleSelectModeSettings("local")}
                  >
                    <span className="item-icon">💻</span>
                    <div className="item-details">
                      <div className="item-title">Local Models</div>
                      <div className="item-desc">
                        Secure, offline models via Ollama or LM Studio
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`zen-dropdown-item ${currentMode === "cloud" ? "selected" : ""}`}
                    onClick={() => handleSelectModeSettings("cloud")}
                  >
                    <span className="item-icon">☁️</span>
                    <div className="item-details">
                      <div className="item-title">Cloud Models</div>
                      <div className="item-desc">
                        High-performance AI via OpenAI, Anthropic, Google, xAI
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`zen-dropdown-item ${currentMode === "hybrid" ? "selected" : ""}`}
                    onClick={() => handleSelectModeSettings("hybrid")}
                  >
                    <span className="item-icon">⚡</span>
                    <div className="item-details">
                      <div className="item-title">Hybrid Mode</div>
                      <div className="item-desc">
                        Run both Cloud and Local models simultaneously
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
          {status && <p className="chat-status">{status}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="chat-panel chat-active">
      <div className="chat-thread">
        {hiddenMessageCount > 0 ? (
          <p className="chat-history-trim-note">
            Showing latest {visibleMessages.length} messages ({hiddenMessageCount} older hidden for
            speed).
          </p>
        ) : null}
        <div className="chat-messages-container">
          {visibleMessages.map((message, index) => (
            <article key={message.id} className={`chat-message chat-message-${message.role}`}>
              {message.role === "assistant" && <div className="chat-avatar">MV</div>}
              <div className="chat-bubble-container">
                <div className="chat-bubble">
                  {message.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        pre({ children, ...props }) {
                          const childrenArray = React.Children.toArray(children);
                          const codeChild = childrenArray.find(
                            (
                              child
                            ): child is React.ReactElement<{
                              className?: string;
                              children?: React.ReactNode;
                            }> => React.isValidElement(child) && child.type === "code"
                          );

                          if (codeChild) {
                            const codeProps = codeChild.props;
                            const className = codeProps.className || "";
                            const match = /language-(\w+)/.exec(className);
                            const language = match ? match[1] : "";

                            const codeContent = codeProps.children;
                            const codeString =
                              typeof codeContent === "string"
                                ? codeContent
                                : Array.isArray(codeContent)
                                  ? codeContent.join("")
                                  : String(codeContent || "");

                            return (
                              <CodeBlock language={language} code={codeString.replace(/\n$/, "")} />
                            );
                          }

                          return <pre {...props}>{children}</pre>;
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    message.content
                  )}
                  {message.isStreaming && <span className="streaming-cursor" />}
                </div>
                {message.role === "assistant" && !message.isStreaming && (
                  <div className="chat-bubble-actions">
                    <button
                      type="button"
                      className="chat-action-btn"
                      onClick={() => handleCopyMessage(message.content, message.id)}
                      title="Copy message"
                    >
                      {copiedMessageId === message.id ? (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      ) : (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      className="chat-action-btn"
                      onClick={() => handleRetryMessage(index)}
                      title="Retry response"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
          {isSending && (
            <article className="chat-message chat-message-assistant loading-message">
              <div className="chat-avatar">MV</div>
              <div className="chat-bubble loading-bubble">
                <div className="dot-pulse-container">
                  <span className="dot-pulse" />
                  <span className="dot-pulse delay-1" />
                  <span className="dot-pulse delay-2" />
                </div>
              </div>
            </article>
          )}
          <div ref={threadEndRef} />
        </div>
      </div>

      <div className="chat-input-container">
        {/* Compact Persistent status pills bar above bottom text input area */}
        <div className="zen-pills-row compact">
          {/* Pill 1: Active Vault */}
          <div className="zen-pill-container" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`zen-pill ${activeDropdown === "vault" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown("vault");
              }}
            >
              <span className="zen-pill-icon">📁</span>
              <span className="zen-pill-label">Vault:</span>
              <span className="zen-pill-value">{selectedVaultName}</span>
              <span className="zen-pill-chevron">▾</span>
            </button>
            {activeDropdown === "vault" && (
              <div className="zen-dropdown">
                <div className="zen-dropdown-header">Select Scoped Memory Domain</div>
                <button
                  type="button"
                  className={`zen-dropdown-item ${!selectedVaultId ? "selected" : ""}`}
                  onClick={() => handleSelectVault(null)}
                >
                  <span className="item-icon">🌐</span>
                  <span className="item-text">Root Graph (Global Context)</span>
                </button>
                {vaults.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`zen-dropdown-item ${selectedVaultId === v.id ? "selected" : ""}`}
                    onClick={() => handleSelectVault(v.id)}
                  >
                    <span className="item-icon">📁</span>
                    <span className="item-text">{v.name}</span>
                    <span className="item-badge">{v.privacyTier.replace("_", " ")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pill 2: Agent Mode */}
          <div className="zen-pill-container" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`zen-pill ${activeDropdown === "mode" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown("mode");
              }}
            >
              <span className="zen-pill-icon">✦</span>
              <span className="zen-pill-label">Mode:</span>
              <span className="zen-pill-value">{agentMode}</span>
              <span className="zen-pill-chevron">▾</span>
            </button>
            {activeDropdown === "mode" && (
              <div className="zen-dropdown animate-fade-in">
                <div className="zen-dropdown-header">Select Intent / Execution State</div>
                <button
                  type="button"
                  className={`zen-dropdown-item ${agentMode === "Recall/Chat" ? "selected" : ""}`}
                  onClick={() => handleSelectMode("Recall/Chat")}
                >
                  <span className="item-icon">💬</span>
                  <div className="item-details">
                    <div className="item-title">Recall/Chat</div>
                    <div className="item-desc">
                      MACRL routing to fetch relevant Nodes & converse
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`zen-dropdown-item ${agentMode === "Ingest/Memory" ? "selected" : ""}`}
                  onClick={() => handleSelectMode("Ingest/Memory")}
                >
                  <span className="item-icon">📥</span>
                  <div className="item-details">
                    <div className="item-title">Ingest/Memory</div>
                    <div className="item-desc">
                      Extract, deduplicate, and store input as new Node
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`zen-dropdown-item ${agentMode === "Onboarding" ? "selected" : ""}`}
                  onClick={() => handleSelectMode("Onboarding")}
                >
                  <span className="item-icon">🎓</span>
                  <div className="item-details">
                    <div className="item-title">Onboarding</div>
                    <div className="item-desc">Trigger Onboarding Agent interview for context</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Pill 3: Model */}
          <div className="zen-pill-container" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`zen-pill ${activeDropdown === "model" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown("model");
              }}
            >
              <span className="zen-pill-icon">⚙</span>
              <span className="zen-pill-label">Model:</span>
              <span className="zen-pill-value">{activeModelDisplay}</span>
              <span className="zen-pill-chevron">▾</span>
            </button>
            {activeDropdown === "model" && (
              <div className="zen-dropdown models-dropdown">
                <div className="zen-dropdown-header">Select Model Environment</div>

                <button
                  type="button"
                  className={`zen-dropdown-item ${currentMode === "local" ? "selected" : ""}`}
                  onClick={() => handleSelectModeSettings("local")}
                >
                  <span className="item-icon">💻</span>
                  <div className="item-details">
                    <div className="item-title">Local Models</div>
                    <div className="item-desc">Secure, offline models via Ollama or LM Studio</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`zen-dropdown-item ${currentMode === "cloud" ? "selected" : ""}`}
                  onClick={() => handleSelectModeSettings("cloud")}
                >
                  <span className="item-icon">☁️</span>
                  <div className="item-details">
                    <div className="item-title">Cloud Models</div>
                    <div className="item-desc">
                      High-performance AI via OpenAI, Anthropic, Google, xAI
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`zen-dropdown-item ${currentMode === "hybrid" ? "selected" : ""}`}
                  onClick={() => handleSelectModeSettings("hybrid")}
                >
                  <span className="item-icon">⚡</span>
                  <div className="item-details">
                    <div className="item-title">Hybrid Mode</div>
                    <div className="item-desc">Run both Cloud and Local models simultaneously</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Overflow dropdown trigger */}
          <div
            className="zen-pill-container overflow-container"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={`compact-pill-more ${activeDropdown === "overflow" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown("overflow");
              }}
              aria-label="More options"
            >
              ···
            </button>
            {activeDropdown === "overflow" && (
              <div className="zen-dropdown overflow-dropdown">
                <button
                  type="button"
                  className="zen-dropdown-item new-chat-item"
                  onClick={() => {
                    setActiveDropdown(null);
                    void handleNewChat();
                  }}
                >
                  <span className="item-icon">✨</span>
                  <div className="item-details">
                    <div className="item-title">New Chat</div>
                    <div className="item-desc">Start a fresh conversation</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="zen-dropdown-item danger-item"
                  onClick={() => {
                    setActiveDropdown(null);
                    void handleClearChat();
                  }}
                >
                  <span className="item-icon">🗑️</span>
                  <div className="item-details">
                    <div className="item-title">Delete Chat History</div>
                    <div className="item-desc">Permanently erase all messages</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* High-rounded input area matching search bar styles */}
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask MindVault..."
            disabled={isSending || isClearing}
            rows={1}
          />
          <button
            type="button"
            className="chat-input-submit"
            onClick={() => void handleSend()}
            disabled={!canSend}
            aria-label="Send query"
          >
            ➔
          </button>
        </div>
      </div>
      {status && <p className="chat-status">{status}</p>}
    </section>
  );
}

export default ChatPanel;
