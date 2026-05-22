import React, { useState, useEffect, useRef } from "react";
import {
  TbClipboard,
  TbClipboardCheck,
  TbSourceCode,
  TbFileText,
  TbPrinter,
  TbFileCheck,
} from "react-icons/tb";
import katex from "katex";

interface LatexBlockProps {
  code: string;
}

// ----------------------------------------------------------------------
// Safe official KaTeX direct DOM render component to completely avoid
// raw HTML injection references, ensuring strict compliance
// with preflight rules while keeping parsing type-safe and secure.
// ----------------------------------------------------------------------
interface KatexMathProps {
  math: string;
  displayMode?: boolean;
}

function KatexMath({ math, displayMode = false }: KatexMathProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) {
      try {
        katex.render(math.trim(), ref.current, {
          displayMode,
          throwOnError: false,
        });
      } catch (err) {
        console.error("KaTeX rendering error:", err);
        ref.current.textContent = math;
      }
    }
  }, [math, displayMode]);

  return <span ref={ref} />;
}

// ----------------------------------------------------------------------
// Safe helper to strip LaTeX block comments while preserving escaped ones (\%)
// ----------------------------------------------------------------------
function stripLaTeXComments(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      let i = 0;
      while (i < line.length) {
        if (line[i] === "%") {
          if (i === 0 || line[i - 1] !== "\\") {
            return line.substring(0, i);
          }
        }
        i++;
      }
      return line;
    })
    .join("\n");
}

// ----------------------------------------------------------------------
// Balanced-braces argument extractor for LaTeX macros like \title, \author, etc.
// ----------------------------------------------------------------------
function extractMacroArg(text: string, macroName: string): string | null {
  const index = text.indexOf(macroName);
  if (index === -1) return null;

  let start = index + macroName.length;
  // Skip any whitespace between the macro and open brace
  while (start < text.length && /\s/.test(text[start])) {
    start++;
  }
  if (start >= text.length || text[start] !== "{") return null;

  let braceCount = 1;
  let i = start + 1;
  let content = "";
  while (i < text.length && braceCount > 0) {
    const char = text[i];
    if (char === "{") {
      braceCount++;
    } else if (char === "}") {
      braceCount--;
    }
    if (braceCount > 0) {
      content += char;
    }
    i++;
  }
  return content.trim();
}

// ----------------------------------------------------------------------
// Extract text content inside LaTeX environments like \begin{env} ... \end{env}
// ----------------------------------------------------------------------
function extractEnvironment(text: string, envName: string): string | null {
  const beginStr = `\\begin{${envName}}`;
  const endStr = `\\end{${envName}}`;

  const startIdx = text.indexOf(beginStr);
  if (startIdx === -1) return null;

  const endIdx = text.indexOf(endStr);
  if (endIdx === -1) return null;

  return text.substring(startIdx + beginStr.length, endIdx).trim();
}

// ----------------------------------------------------------------------
// Balanced-braces macro stripper for excluding metadata declarations from body
// ----------------------------------------------------------------------
function stripMacro(text: string, macroName: string): string {
  let result = text;
  while (true) {
    const index = result.indexOf(macroName);
    if (index === -1) break;

    let start = index + macroName.length;
    while (start < result.length && /\s/.test(result[start])) {
      start++;
    }
    if (start >= result.length || result[start] !== "{") {
      result = result.substring(0, index) + result.substring(start);
      continue;
    }

    let braceCount = 1;
    let i = start + 1;
    while (i < result.length && braceCount > 0) {
      const char = result[i];
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
      }
      i++;
    }
    result = result.substring(0, index) + result.substring(i);
  }
  return result;
}

// ----------------------------------------------------------------------
// Environment stripper for excluding abstract/keywords blocks from body
// ----------------------------------------------------------------------
function stripEnvironment(text: string, envName: string): string {
  const beginStr = `\\begin{${envName}}`;
  const endStr = `\\end{${envName}}`;
  let result = text;
  while (true) {
    const startIdx = result.indexOf(beginStr);
    if (startIdx === -1) break;

    const endIdx = result.indexOf(endStr);
    if (endIdx === -1) {
      result = result.substring(0, startIdx) + result.substring(startIdx + beginStr.length);
      continue;
    }
    result = result.substring(0, startIdx) + result.substring(endIdx + endStr.length);
  }
  return result;
}

// ----------------------------------------------------------------------
// Replaces backslash escaped symbols with literal ones inside plain text blocks
// ----------------------------------------------------------------------
function cleanEscapedChars(text: string): string {
  return text.replace(/\\([&_%$#{}]|maketitle)/g, "$1");
}

// ----------------------------------------------------------------------
// Custom highly robust parser to translate inline macros and math
// ($...$) recursively into structured React elements.
// ----------------------------------------------------------------------
function renderInlineText(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let currentText = text;
  let keyCounter = 0;

  while (currentText.length > 0) {
    // 1. Find inline math trigger '$'
    const dollarIdx = currentText.indexOf("$");

    // 2. Find styling macros
    const macros = ["\\textbf{", "\\textit{", "\\texttt{", "\\underline{", "\\emph{"];
    let nearestMacroIdx = -1;
    let nearestMacro = "";

    for (const macro of macros) {
      const idx = currentText.indexOf(macro);
      if (idx !== -1 && (nearestMacroIdx === -1 || idx < nearestMacroIdx)) {
        nearestMacroIdx = idx;
        nearestMacro = macro;
      }
    }

    // Determine whether math or a style macro comes first
    if (dollarIdx === -1 && nearestMacroIdx === -1) {
      result.push(cleanEscapedChars(currentText));
      break;
    }

    const firstIsMath = dollarIdx !== -1 && (nearestMacroIdx === -1 || dollarIdx < nearestMacroIdx);

    if (firstIsMath) {
      if (dollarIdx > 0) {
        result.push(cleanEscapedChars(currentText.substring(0, dollarIdx)));
      }

      const nextDollarIdx = currentText.indexOf("$", dollarIdx + 1);
      if (nextDollarIdx === -1) {
        result.push(cleanEscapedChars(currentText.substring(dollarIdx)));
        break;
      }

      const mathExpr = currentText.substring(dollarIdx + 1, nextDollarIdx);
      result.push(<KatexMath key={`math-${keyCounter++}`} math={mathExpr} displayMode={false} />);

      currentText = currentText.substring(nextDollarIdx + 1);
    } else {
      if (nearestMacroIdx > 0) {
        result.push(cleanEscapedChars(currentText.substring(0, nearestMacroIdx)));
      }

      const start = nearestMacroIdx + nearestMacro.length;
      let braceCount = 1;
      let i = start;
      let content = "";
      while (i < currentText.length && braceCount > 0) {
        const char = currentText[i];
        if (char === "{") braceCount++;
        else if (char === "}") braceCount--;
        if (braceCount > 0) content += char;
        i++;
      }

      if (braceCount === 0) {
        const tag =
          nearestMacro === "\\textbf{"
            ? "strong"
            : nearestMacro === "\\textit{" || nearestMacro === "\\emph{"
              ? "em"
              : nearestMacro === "\\texttt{"
                ? "code"
                : "u";

        const innerNodes = renderInlineText(content);

        if (tag === "strong") {
          result.push(<strong key={`style-${keyCounter++}`}>{innerNodes}</strong>);
        } else if (tag === "em") {
          result.push(<em key={`style-${keyCounter++}`}>{innerNodes}</em>);
        } else if (tag === "code") {
          result.push(<code key={`style-${keyCounter++}`}>{innerNodes}</code>);
        } else {
          result.push(<u key={`style-${keyCounter++}`}>{innerNodes}</u>);
        }

        currentText = currentText.substring(i);
      } else {
        result.push(cleanEscapedChars(currentText.substring(nearestMacroIdx)));
        break;
      }
    }
  }

  return result;
}

// ----------------------------------------------------------------------
// High-fidelity structured parsing for block-level elements
// ----------------------------------------------------------------------
function parseLaTeXBody(bodyText: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const lines = bodyText.split("\n");

  let currentBlockType:
    | "section"
    | "subsection"
    | "subsubsection"
    | "paragraph"
    | "equation"
    | "list"
    | "table"
    | "figure"
    | "verbatim"
    | null = null;

  let blockLines: string[] = [];
  let sectionNum = 0;
  let subsectionNum = 0;
  let subsubsectionNum = 0;
  let equationNum = 0;
  let keyCounter = 0;

  function toRoman(num: number): string {
    const lookup: [string, number][] = [
      ["M", 1000],
      ["CM", 900],
      ["D", 500],
      ["CD", 400],
      ["C", 100],
      ["XC", 90],
      ["L", 50],
      ["XL", 40],
      ["X", 10],
      ["IX", 9],
      ["V", 5],
      ["IV", 4],
      ["I", 1],
    ];
    let roman = "";
    let n = num;
    for (const [romanChar, value] of lookup) {
      while (n >= value) {
        roman += romanChar;
        n -= value;
      }
    }
    return roman;
  }

  function parseTabularToTable(body: string) {
    const rows = body
      .split("\\\\")
      .map((r) => r.trim())
      .filter((r) => r && r !== "\\hline" && !r.startsWith("\\hline"));

    const parsedRows = rows.map((row) => {
      return row.split("&").map((cell) => cell.replace(/\\hline/g, "").trim());
    });

    if (parsedRows.length === 0) return null;

    const headerRow = parsedRows[0];
    const dataRows = parsedRows.slice(1);

    return (
      <table className="latex-table-element">
        <thead>
          <tr>
            {headerRow.map((cell, idx) => (
              <th key={`th-${idx}`}>{renderInlineText(cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rIdx) => (
            <tr key={`tr-${rIdx}`}>
              {row.map((cell, cIdx) => (
                <td key={`td-${rIdx}-${cIdx}`}>{renderInlineText(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function flushBlock() {
    if (blockLines.length === 0 && !currentBlockType) return;

    const rawContent = blockLines.join("\n").trim();
    if (!rawContent && currentBlockType === "paragraph") {
      currentBlockType = null;
      blockLines = [];
      return;
    }

    const key = `latex-block-${keyCounter++}`;

    switch (currentBlockType) {
      case "section": {
        sectionNum++;
        subsectionNum = 0;
        subsubsectionNum = 0;
        const roman = toRoman(sectionNum);
        result.push(
          <h2 key={key} className="latex-section">
            <span className="latex-sec-num">{roman}. </span>
            {renderInlineText(rawContent)}
          </h2>
        );
        break;
      }
      case "subsection": {
        subsectionNum++;
        subsubsectionNum = 0;
        const letter = String.fromCharCode(64 + subsectionNum); // A, B, C...
        result.push(
          <h3 key={key} className="latex-subsection">
            <span className="latex-subsec-num">{letter}. </span>
            {renderInlineText(rawContent)}
          </h3>
        );
        break;
      }
      case "subsubsection": {
        subsubsectionNum++;
        result.push(
          <h4 key={key} className="latex-subsubsection">
            <span className="latex-subsubsec-num">{subsubsectionNum}) </span>
            {renderInlineText(rawContent)}
          </h4>
        );
        break;
      }
      case "equation": {
        equationNum++;
        const mathContent = rawContent
          .replace(/\\begin\{(equation|align|gather|split)\*?\}/g, "")
          .replace(/\\end\{(equation|align|gather|split)\*?\}/g, "")
          .trim();
        result.push(
          <div key={key} className="latex-equation-container">
            <div className="latex-equation-wrapper">
              <KatexMath math={mathContent} displayMode={true} />
            </div>
            <span className="latex-equation-number">({equationNum})</span>
          </div>
        );
        break;
      }
      case "verbatim": {
        const codeContent = rawContent
          .replace(/\\begin\{verbatim\}/g, "")
          .replace(/\\end\{verbatim\}/g, "")
          .trim();
        result.push(
          <pre key={key} className="latex-verbatim">
            <code>{codeContent}</code>
          </pre>
        );
        break;
      }
      case "list": {
        const listType = rawContent.includes("\\begin{enumerate}") ? "enumerate" : "itemize";
        const itemLines = rawContent
          .replace(/\\begin\{(itemize|enumerate)\}/g, "")
          .replace(/\\end\{(itemize|enumerate)\}/g, "")
          .split("\\item")
          .map((x) => x.trim())
          .filter(Boolean);

        const listContent = itemLines.map((item, idx) => (
          <li key={`li-${idx}`}>{renderInlineText(item)}</li>
        ));

        if (listType === "enumerate") {
          result.push(
            <ol key={key} className="latex-list-ordered">
              {listContent}
            </ol>
          );
        } else {
          result.push(
            <ul key={key} className="latex-list-unordered">
              {listContent}
            </ul>
          );
        }
        break;
      }
      case "table": {
        const captionMatch = /\\caption\{([^}]+)\}/.exec(rawContent);
        const caption = captionMatch ? captionMatch[1] : "";

        const tabularMatch = /\\begin\{tabular\}\{([^}]+)\}([\s\S]+?)\\end\{tabular\}/.exec(
          rawContent
        );
        const tabularBody = tabularMatch ? tabularMatch[2] : "";

        result.push(
          <div key={key} className="latex-table-container">
            <span className="latex-table-caption">
              <strong>TABLE {toRoman(sectionNum || 1)}:</strong> {caption}
            </span>
            <div className="latex-table-wrapper">{parseTabularToTable(tabularBody)}</div>
          </div>
        );
        break;
      }
      case "figure": {
        const captionMatch = /\\caption\{([^}]+)\}/.exec(rawContent);
        const caption = captionMatch ? captionMatch[1] : "";

        result.push(
          <div key={key} className="latex-figure-container">
            <div className="latex-figure-mock">
              <div className="latex-figure-graphic-box">
                <TbFileCheck className="latex-fig-icon" />
                <span>[Vector Graphic Placeholder]</span>
              </div>
            </div>
            <span className="latex-figure-caption">
              <strong>Fig. {sectionNum || 1}.</strong> {caption}
            </span>
          </div>
        );
        break;
      }
      case "paragraph":
      default: {
        result.push(
          <p key={key} className="latex-paragraph">
            {renderInlineText(rawContent)}
          </p>
        );
        break;
      }
    }

    currentBlockType = null;
    blockLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (
      trimmed.startsWith("\\begin{equation}") ||
      trimmed.startsWith("\\begin{align}") ||
      trimmed.startsWith("\\begin{gather}")
    ) {
      flushBlock();
      currentBlockType = "equation";
      blockLines.push(line);
      continue;
    }
    if (
      trimmed.startsWith("\\end{equation}") ||
      trimmed.startsWith("\\end{align}") ||
      trimmed.startsWith("\\end{gather}")
    ) {
      blockLines.push(line);
      flushBlock();
      continue;
    }

    if (trimmed.startsWith("\\begin{verbatim}")) {
      flushBlock();
      currentBlockType = "verbatim";
      blockLines.push(line);
      continue;
    }
    if (trimmed.startsWith("\\end{verbatim}")) {
      blockLines.push(line);
      flushBlock();
      continue;
    }

    if (trimmed.startsWith("\\begin{itemize}") || trimmed.startsWith("\\begin{enumerate}")) {
      flushBlock();
      currentBlockType = "list";
      blockLines.push(line);
      continue;
    }
    if (trimmed.startsWith("\\end{itemize}") || trimmed.startsWith("\\end{enumerate}")) {
      blockLines.push(line);
      flushBlock();
      continue;
    }

    if (trimmed.startsWith("\\begin{table}")) {
      flushBlock();
      currentBlockType = "table";
      blockLines.push(line);
      continue;
    }
    if (trimmed.startsWith("\\end{table}")) {
      blockLines.push(line);
      flushBlock();
      continue;
    }

    if (trimmed.startsWith("\\begin{figure}")) {
      flushBlock();
      currentBlockType = "figure";
      blockLines.push(line);
      continue;
    }
    if (trimmed.startsWith("\\end{figure}")) {
      blockLines.push(line);
      flushBlock();
      continue;
    }

    if (
      trimmed.startsWith("\\begin{abstract}") ||
      trimmed.startsWith("\\end{abstract}") ||
      trimmed.startsWith("\\begin{IEEEkeywords}") ||
      trimmed.startsWith("\\end{IEEEkeywords}")
    ) {
      continue;
    }

    const secMatch = /^\\section\*?\{([^}]+)\}/.exec(trimmed);
    if (secMatch) {
      flushBlock();
      currentBlockType = "section";
      blockLines.push(secMatch[1]);
      flushBlock();
      continue;
    }

    const subsecMatch = /^\\subsection\*?\{([^}]+)\}/.exec(trimmed);
    if (subsecMatch) {
      flushBlock();
      currentBlockType = "subsection";
      blockLines.push(subsecMatch[1]);
      flushBlock();
      continue;
    }

    const subsubsecMatch = /^\\subsubsection\*?\{([^}]+)\}/.exec(trimmed);
    if (subsubsecMatch) {
      flushBlock();
      currentBlockType = "subsubsection";
      blockLines.push(subsubsecMatch[1]);
      flushBlock();
      continue;
    }

    if (
      trimmed.startsWith("\\documentclass") ||
      trimmed.startsWith("\\usepackage") ||
      trimmed.startsWith("\\begin{document}") ||
      trimmed.startsWith("\\end{document}") ||
      trimmed === "\\maketitle"
    ) {
      continue;
    }

    if (currentBlockType && currentBlockType !== "paragraph") {
      blockLines.push(line);
      continue;
    }

    if (trimmed === "") {
      flushBlock();
    } else {
      if (!currentBlockType) {
        currentBlockType = "paragraph";
      }
      blockLines.push(line);
    }
  }

  flushBlock();
  return result;
}

export default function LatexBlock({ code }: LatexBlockProps) {
  const [viewSource, setViewSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  const cleanCode = stripLaTeXComments(code);

  // Extract Metadata
  const title = extractMacroArg(cleanCode, "\\title");
  const author = extractMacroArg(cleanCode, "\\author");
  const date = extractMacroArg(cleanCode, "\\date");
  const abstract = extractEnvironment(cleanCode, "abstract");
  const keywords =
    extractEnvironment(cleanCode, "IEEEkeywords") || extractEnvironment(cleanCode, "keywords");

  // Clean the body code from metadata and abstract/keywords blocks to prevent duplicates in body view
  let bodyCode = cleanCode;
  bodyCode = stripMacro(bodyCode, "\\title");
  bodyCode = stripMacro(bodyCode, "\\author");
  bodyCode = stripMacro(bodyCode, "\\date");
  bodyCode = stripMacro(bodyCode, "\\markboth");
  bodyCode = stripEnvironment(bodyCode, "abstract");
  bodyCode = stripEnvironment(bodyCode, "IEEEkeywords");
  bodyCode = stripEnvironment(bodyCode, "keywords");

  // Renders the structured paper body
  const docBody = parseLaTeXBody(bodyCode);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy LaTeX code:", err);
    }
  };

  const handlePrint = () => {
    if (!printContainerRef.current) return;

    // Premium sandboxed print mechanism: Clone the compiled HTML paper view into a printing iframe,
    // keeping the main window untouched while avoiding styling leakage!
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(`
        <html>
          <head>
            <title>${title || "LaTeX Compiled Document"}</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');
              body {
                font-family: "Playfair Display", "Times New Roman", "PT Serif", Georgia, serif;
                color: #1b1a17;
                background: #ffffff;
                padding: 1.5in 1in 1in 1in;
                margin: 0;
                font-size: 11pt;
                line-height: 1.6;
              }
              .title {
                text-align: center;
                font-size: 20pt;
                font-weight: bold;
                margin-bottom: 20px;
              }
              .author {
                text-align: center;
                font-size: 11pt;
                margin-bottom: 30px;
                font-style: italic;
              }
              .abstract-block {
                margin: 0 40px 30px 40px;
                font-size: 10pt;
                text-align: justify;
              }
              .abstract-title {
                font-weight: bold;
                font-style: normal;
              }
              .keywords-block {
                margin: 0 40px 30px 40px;
                font-size: 10pt;
              }
              h2.latex-section {
                font-size: 13pt;
                text-transform: uppercase;
                text-align: center;
                font-weight: bold;
                margin-top: 30px;
                margin-bottom: 15px;
                border-bottom: 1px solid #1b1a17;
                padding-bottom: 5px;
              }
              h3.latex-subsection {
                font-size: 11pt;
                font-weight: bold;
                margin-top: 20px;
                margin-bottom: 10px;
              }
              h4.latex-subsubsection {
                font-size: 11pt;
                font-style: italic;
                margin-top: 15px;
                margin-bottom: 5px;
              }
              p.latex-paragraph {
                text-indent: 20px;
                margin: 0 0 15px 0;
                text-align: justify;
              }
              .latex-equation-container {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 20px 0;
                padding: 0 10px;
              }
              .latex-equation-wrapper {
                flex-grow: 1;
                text-align: center;
              }
              .latex-equation-number {
                font-size: 11pt;
                margin-left: 20px;
              }
              .latex-table-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                margin: 25px 0;
                page-break-inside: avoid;
              }
              .latex-table-caption {
                font-size: 9pt;
                text-transform: uppercase;
                margin-bottom: 10px;
                letter-spacing: 0.5px;
              }
              .latex-table-element {
                border-collapse: collapse;
                width: 80%;
                margin: 0 auto;
              }
              .latex-table-element th, .latex-table-element td {
                border-top: 1px solid #1b1a17;
                border-bottom: 1px solid #1b1a17;
                padding: 6px 12px;
                font-size: 10pt;
                text-align: center;
              }
              .latex-figure-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                margin: 25px 0;
                page-break-inside: avoid;
              }
              .latex-figure-mock {
                width: 60%;
                height: 150px;
                border: 1px dashed #1b1a17;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 10px;
              }
              .latex-figure-caption {
                font-size: 9pt;
                margin-top: 8px;
              }
              .latex-verbatim {
                background: #f5f5f0;
                border: 1px solid #d3d3c3;
                padding: 12px;
                font-family: monospace;
                font-size: 9.5pt;
                white-space: pre-wrap;
                margin: 15px 0;
              }
              ol.latex-list-ordered, ul.latex-list-unordered {
                margin: 15px 0;
                padding-left: 40px;
              }
              li {
                margin-bottom: 6px;
                text-align: justify;
              }
            </style>
          </head>
          <body>
            ${printContainerRef.current.innerHTML}
          </body>
        </html>
      `);
      frameDoc.close();

      printFrame.contentWindow?.focus();
      // Allow KaTeX fonts to load before opening print dialog
      setTimeout(() => {
        printFrame.contentWindow?.print();
        document.body.removeChild(printFrame);
      }, 500);
    }
  };

  return (
    <div className="latex-block-wrapper">
      {/* Premium Header Controls */}
      <div className="latex-block-header">
        <div className="latex-tabs">
          <button
            type="button"
            className={`latex-tab-btn ${!viewSource ? "active" : ""}`}
            onClick={() => setViewSource(false)}
            title="View beautiful academic compiled paper"
          >
            <TbFileText className="tab-icon" />
            <span>Paper Preview</span>
          </button>
          <button
            type="button"
            className={`latex-tab-btn ${viewSource ? "active" : ""}`}
            onClick={() => setViewSource(true)}
            title="View raw LaTeX source code"
          >
            <TbSourceCode className="tab-icon" />
            <span>Source Code</span>
          </button>
        </div>

        <div className="latex-actions">
          <button
            type="button"
            className="latex-action-btn"
            onClick={handleCopyCode}
            title="Copy LaTeX source code"
          >
            {copied ? (
              <>
                <TbClipboardCheck className="action-icon copied" />
                <span className="copied">Copied!</span>
              </>
            ) : (
              <>
                <TbClipboard className="action-icon" />
                <span>Copy Code</span>
              </>
            )}
          </button>

          {!viewSource && (
            <button
              type="button"
              className="latex-action-btn print-btn"
              onClick={handlePrint}
              title="Print paper or save as high-fidelity PDF"
            >
              <TbPrinter className="action-icon" />
              <span>Print / Save PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Body Views */}
      <div className="latex-block-body">
        {viewSource ? (
          <div className="latex-source-scroll-container">
            <div className="code-block-wrapper" style={{ margin: 0 }}>
              <div className="code-block-header">
                <div className="code-block-lang-container">
                  <TbSourceCode className="tab-icon" style={{ color: "#bc6c25" }} />
                  <span className="code-block-lang">latex</span>
                </div>
                <button
                  type="button"
                  className="code-block-copy-btn"
                  onClick={handleCopyCode}
                  aria-label={copied ? "Copied to clipboard" : "Copy code"}
                  title={copied ? "Copied!" : "Copy"}
                >
                  {copied ? <TbClipboardCheck size={14} /> : <TbClipboard size={14} />}
                </button>
              </div>
              <pre style={{ margin: 0, padding: "16px", overflow: "auto" }}>
                <code>{code.replace(/\n$/, "")}</code>
              </pre>
            </div>
          </div>
        ) : (
          <div className="latex-paper-scroll-container">
            <div className="latex-paper-view" ref={printContainerRef}>
              {/* Journal / Tech Class Header (mock) */}
              <div className="latex-paper-header-mock">
                JOURNAL OF MINDFORCE SCIENTIFIC ARCHITECTURE, VOL. 15, NO. 4, MAY 2026
              </div>

              {/* Title */}
              {title && <h1 className="title">{renderInlineText(title)}</h1>}

              {/* Author */}
              {author && <div className="author">{renderInlineText(author)}</div>}

              {/* Date */}
              {date && <div className="date">{renderInlineText(date)}</div>}

              {/* IEEE double line divider */}
              <div className="latex-double-divider" />

              {/* Abstract Block */}
              {abstract && (
                <div className="abstract-block">
                  <span className="abstract-title">Abstract—</span>
                  {renderInlineText(abstract)}
                </div>
              )}

              {/* Keywords Block */}
              {keywords && (
                <div className="keywords-block">
                  <strong>
                    <em>Index Terms—</em>
                  </strong>
                  {renderInlineText(keywords)}
                </div>
              )}

              {/* Main Body content */}
              <div className="latex-paper-main-content">{docBody}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
