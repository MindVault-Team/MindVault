import { useEffect, useState, useRef } from "react";
import mermaid from "mermaid";
import {
  TbClipboard,
  TbClipboardCheck,
  TbAlertCircle,
  TbSourceCode,
  TbVector,
} from "react-icons/tb";

interface MermaidBlockProps {
  code: string;
}

// Initialize Mermaid with standard premium configuration
mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "inherit",
  themeVariables: {
    fontFamily: "inherit",
    primaryColor: "#fdfcfa",
    primaryTextColor: "#1b1a17",
    primaryBorderColor: "rgba(188, 108, 37, 0.3)",
    lineColor: "rgba(188, 108, 37, 0.35)",
    secondaryColor: "rgba(188, 108, 37, 0.05)",
    tertiaryColor: "#ffffff",
  },
});

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [viewSource, setViewSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSvg, setCopiedSvg] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    // Mermaid needs a unique ID that starts with a letter and has no special characters
    const renderId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

    async function renderDiagram() {
      try {
        setError(null);

        // Remove any old mermaid error elements left in the DOM from failed rendering
        const badElements = document.querySelectorAll(`[id^="d${renderId}"], .mermaidTooltip`);
        badElements.forEach((el) => el.remove());

        // Perform rendering using Mermaid's async render API
        const { svg: renderedSvg } = await mermaid.render(renderId, code);

        if (active) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        console.error("Mermaid Render Error:", err);
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void renderDiagram();

    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = svg;
    }
  }, [svg, viewSource]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy mermaid source code:", err);
    }
  };

  const handleCopySvg = async () => {
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
      setCopiedSvg(true);
      setTimeout(() => setCopiedSvg(false), 2000);
    } catch (err) {
      console.error("Failed to copy diagram SVG:", err);
    }
  };

  return (
    <div className="mermaid-block-wrapper">
      <div className={`mermaid-block-header ${error ? "error" : ""}`}>
        <div className="mermaid-block-title-container">
          <TbVector className="mermaid-block-title-icon" size={16} />
          <span className="mermaid-block-title">
            {error ? "Mermaid Diagram (Error)" : "Mermaid Diagram"}
          </span>
        </div>

        <div className="mermaid-block-actions">
          {!error && (
            <>
              <button
                type="button"
                className="mermaid-action-btn-pill"
                onClick={() => setViewSource((prev) => !prev)}
                title={viewSource ? "Show Rendered Diagram" : "Show Source Code"}
              >
                {viewSource ? (
                  <>
                    <TbVector size={14} />
                    <span>Diagram</span>
                  </>
                ) : (
                  <>
                    <TbSourceCode size={14} />
                    <span>Source</span>
                  </>
                )}
              </button>

              {!viewSource && svg && (
                <button
                  type="button"
                  className="mermaid-action-btn-icon"
                  onClick={handleCopySvg}
                  title="Copy Diagram SVG"
                  aria-label="Copy SVG"
                >
                  {copiedSvg ? <TbClipboardCheck size={14} /> : <TbClipboard size={14} />}
                </button>
              )}
            </>
          )}

          {(error || viewSource) && (
            <button
              type="button"
              className="mermaid-action-btn-icon"
              onClick={handleCopyCode}
              title="Copy Mermaid Code"
              aria-label="Copy code"
            >
              {copied ? <TbClipboardCheck size={14} /> : <TbClipboard size={14} />}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mermaid-block-error-container">
          <div className="mermaid-block-error-message">
            <TbAlertCircle className="mermaid-error-icon" size={18} />
            <div className="mermaid-error-text">
              <strong>Rendering Error:</strong> {error}
            </div>
          </div>
          <div className="mermaid-block-error-code">
            <pre>
              <code>{code}</code>
            </pre>
          </div>
        </div>
      ) : viewSource ? (
        <div className="mermaid-block-source-container">
          <pre>
            <code>{code}</code>
          </pre>
        </div>
      ) : (
        <div ref={containerRef} className="mermaid-block-body" />
      )}
    </div>
  );
}
