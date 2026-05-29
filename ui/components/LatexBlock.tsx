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

// Allowlist-based URL sanitizer to prevent javascript: and data: XSS via \href{}
function sanitizeHrefUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed, window.location.href);
    const safeProtocols = ["http:", "https:", "mailto:"];
    if (safeProtocols.includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch {
    // Not a valid URL — fall through
  }
  // Block unsafe or malformed URLs entirely
  return "about:blank";
}

interface LatexBlockProps {
  code: string;
}

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
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "%") {
          // Count consecutive backslashes immediately preceding this %
          let backslashCount = 0;
          let j = i - 1;
          while (j >= 0 && line[j] === "\\") {
            backslashCount++;
            j--;
          }
          // Odd count = escaped \%, even count (including 0) = real comment
          if (backslashCount % 2 === 0) {
            return line.substring(0, i);
          }
        }
      }
      return line;
    })
    .join("\n");
}

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

function extractEnvironment(text: string, envName: string): string | null {
  const beginStr = `\\begin{${envName}}`;
  const endStr = `\\end{${envName}}`;

  const startIdx = text.indexOf(beginStr);
  if (startIdx === -1) return null;

  const endIdx = text.indexOf(endStr);
  if (endIdx === -1) return null;

  return text.substring(startIdx + beginStr.length, endIdx).trim();
}

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

function cleanEscapedChars(text: string): string {
  return text.replace(/\\([&_%$#{}]|maketitle)/g, "$1");
}

function normalizeLatexMacros(text: string): string {
  let result = text;

  // 1. Strip vspace and hspace macros completely
  result = result.replace(/\\[vh]space\*?\{[^}]*\}/g, "");

  // 2. Normalize brace groups like {\LARGE content} to \LARGE{content}
  const sizeTags = [
    "LARGE",
    "Large",
    "large",
    "small",
    "footnotesize",
    "scriptsize",
    "tiny",
    "bfseries",
    "itshape",
  ];
  for (const tag of sizeTags) {
    let startIdx = 0;
    while (true) {
      const searchStr = `{\\${tag}`;
      const idx = result.indexOf(searchStr, startIdx);
      if (idx === -1) break;

      // Find matching closing brace
      let braceCount = 1;
      let j = idx + searchStr.length;
      let closeIdx = -1;
      while (j < result.length) {
        if (result[j] === "{") {
          braceCount++;
        } else if (result[j] === "}") {
          braceCount--;
          if (braceCount === 0) {
            closeIdx = j;
            break;
          }
        }
        j++;
      }

      if (closeIdx !== -1) {
        const content = result.substring(idx + searchStr.length, closeIdx);
        result =
          result.substring(0, idx) + `\\${tag}{` + content + "}" + result.substring(closeIdx + 1);
      } else {
        break;
      }
      startIdx = idx + 1;
    }
  }

  // 3. Convert raw spacing and specific text macros
  result = result
    .replace(/\\textbar\b/g, "|")
    .replace(/\\textbullet\b/g, "•")
    .replace(/\\\s+/g, " ") // replace standard escaped backslash spaces '\ ' with a regular space
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%");

  return result;
}

interface SizedSegment {
  text: string;
  sizeClass: string | null;
}

function segmentizeBlock(text: string): SizedSegment[] {
  const sizeMacros = [
    "\\LARGE{",
    "\\Large{",
    "\\large{",
    "\\small{",
    "\\footnotesize{",
    "\\scriptsize{",
    "\\tiny{",
  ];

  let depth = 0;
  for (let idx = 0; idx < text.length; idx++) {
    if (depth === 0) {
      for (const macro of sizeMacros) {
        if (text.startsWith(macro, idx)) {
          const start = idx + macro.length;
          let braceCount = 1;
          let i = start;
          while (i < text.length && braceCount > 0) {
            const char = text[i];
            if (char === "{") braceCount++;
            else if (char === "}") braceCount--;
            i++;
          }

          if (braceCount === 0) {
            const before = text.substring(0, idx);
            const innerContent = text.substring(start, i - 1);
            const after = text.substring(i);

            const sizeClass = macro.replace(/\\/g, "").replace(/\{/g, "");
            const segments: SizedSegment[] = [];

            if (before.trim()) {
              segments.push(...segmentizeBlock(before));
            }
            segments.push({ text: innerContent, sizeClass: `latex-size-${sizeClass}` });
            if (after.trim()) {
              segments.push(...segmentizeBlock(after));
            }
            return segments;
          }
        }
      }
    }

    const char = text[idx];
    if (char === "{") depth++;
    else if (char === "}") depth--;
  }

  return [{ text, sizeClass: null }];
}

function findUnescapedChar(text: string, charToFind: string, startIdx: number = 0): number {
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === charToFind) {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && text[j] === "\\") {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        return i;
      }
    }
  }
  return -1;
}

// ----------------------------------------------------------------------
// Custom highly robust parser to translate inline macros and math
// ($...$) recursively into structured React elements.
// ----------------------------------------------------------------------
function renderInlineText(text: string): React.ReactNode[] {
  const normalized = normalizeLatexMacros(text);
  const result: React.ReactNode[] = [];
  let currentText = normalized;
  let keyCounter = 0;

  while (currentText.length > 0) {
    // 1. Find inline math trigger '$'
    const dollarIdx = findUnescapedChar(currentText, "$");

    // 2. Find styling macros
    const macros = [
      "\\textbf{",
      "\\textit{",
      "\\texttt{",
      "\\underline{",
      "\\emph{",
      "\\LARGE{",
      "\\Large{",
      "\\large{",
      "\\small{",
      "\\footnotesize{",
      "\\scriptsize{",
      "\\tiny{",
      "\\bfseries{",
      "\\itshape{",
      "\\href{",
    ];
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

      const nextDollarIdx = findUnescapedChar(currentText, "$", dollarIdx + 1);
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

      // Handle double-argument href macro: \href{url}{text}
      if (nearestMacro === "\\href{") {
        let braceCount = 1;
        let i = start;
        let url = "";
        while (i < currentText.length && braceCount > 0) {
          const char = currentText[i];
          if (char === "{") braceCount++;
          else if (char === "}") braceCount--;
          if (braceCount > 0) url += char;
          i++;
        }

        if (braceCount === 0) {
          // Find the second braced argument: {text}
          let textStart = i;
          while (textStart < currentText.length && /\s/.test(currentText[textStart])) {
            textStart++;
          }

          if (textStart < currentText.length && currentText[textStart] === "{") {
            let textBraceCount = 1;
            let j = textStart + 1;
            let linkText = "";
            while (j < currentText.length && textBraceCount > 0) {
              const char = currentText[j];
              if (char === "{") textBraceCount++;
              else if (char === "}") textBraceCount--;
              if (textBraceCount > 0) linkText += char;
              j++;
            }

            if (textBraceCount === 0) {
              result.push(
                <a
                  key={`href-${keyCounter++}`}
                  href={sanitizeHrefUrl(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="latex-link"
                >
                  {renderInlineText(linkText)}
                </a>
              );
              currentText = currentText.substring(j);
              continue;
            }
          }
        }

        // Fallback if href parsing fails
        result.push(cleanEscapedChars(currentText.substring(nearestMacroIdx)));
        break;
      }

      // Standard single-argument balanced-braces macros
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
        if (
          nearestMacro === "\\LARGE{" ||
          nearestMacro === "\\Large{" ||
          nearestMacro === "\\large{" ||
          nearestMacro === "\\small{" ||
          nearestMacro === "\\footnotesize{" ||
          nearestMacro === "\\scriptsize{" ||
          nearestMacro === "\\tiny{"
        ) {
          const sizeClass = nearestMacro.replace(/\\/g, "").replace(/\{/g, "");
          result.push(
            <span key={`size-${keyCounter++}`} className={`latex-size-${sizeClass}`}>
              {renderInlineText(content)}
            </span>
          );
        } else {
          const tag =
            nearestMacro === "\\textbf{" || nearestMacro === "\\bfseries{"
              ? "strong"
              : nearestMacro === "\\textit{" ||
                  nearestMacro === "\\itshape{" ||
                  nearestMacro === "\\emph{"
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
          } else if (tag === "u") {
            result.push(<u key={`style-${keyCounter++}`}>{innerNodes}</u>);
          } else {
            result.push(<span key={`style-${keyCounter++}`}>{innerNodes}</span>);
          }
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
    | "center"
    | "multicols"
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
      case "center": {
        const centerContent = rawContent
          .replace(/\\begin\{center\}/g, "")
          .replace(/\\end\{center\}/g, "")
          .trim();

        const segments = segmentizeBlock(centerContent);
        const centerNodes: React.ReactNode[] = [];

        segments.forEach((seg, segIdx) => {
          const subLines = seg.text.split(/\\\\|\\newline/).map((l) => l.trim());
          const segNodes: React.ReactNode[] = [];

          subLines.forEach((subLine, subIdx) => {
            if (subIdx > 0) {
              segNodes.push(<br key={`br-${key}-${segIdx}-${subIdx}`} />);
            }
            segNodes.push(
              <span key={`line-${key}-${segIdx}-${subIdx}`}>{renderInlineText(subLine)}</span>
            );
          });

          if (seg.sizeClass) {
            centerNodes.push(
              <span key={`seg-${key}-${segIdx}`} className={seg.sizeClass}>
                {segNodes}
              </span>
            );
          } else {
            centerNodes.push(...segNodes);
          }
        });

        result.push(
          <div
            key={key}
            className="latex-center-block"
            style={{
              textAlign: "center",
              margin: "15px 0",
              width: "100%",
            }}
          >
            {centerNodes}
          </div>
        );
        break;
      }
      case "multicols": {
        const colMatch = /\\begin\{multicols\*?\}\{(\d+)\}/.exec(rawContent);
        const colCount = colMatch ? parseInt(colMatch[1]) : 2;

        const innerContent = rawContent
          .replace(/\\begin\{multicols\*?\}\{\d+\}/g, "")
          .replace(/\\end\{multicols\*?\}/g, "")
          .trim();

        const segments = segmentizeBlock(innerContent);
        const colNodes: React.ReactNode[] = [];

        segments.forEach((seg, segIdx) => {
          const subLines = seg.text.split(/\\\\|\\newline/).map((l) => l.trim());
          const segNodes: React.ReactNode[] = [];

          subLines.forEach((subLine, subIdx) => {
            if (subIdx > 0) {
              segNodes.push(<br key={`br-${key}-${segIdx}-${subIdx}`} />);
            }

            if (subLine.includes("\\hfill")) {
              const parts = subLine.split("\\hfill").map((p) => p.trim());
              segNodes.push(
                <div
                  key={`hfill-${key}-${segIdx}-${subIdx}`}
                  className="latex-hfill-line"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                    alignItems: "baseline",
                    textAlign: "left",
                  }}
                >
                  <span className="latex-hfill-left">{renderInlineText(parts[0])}</span>
                  <span className="latex-hfill-right">{renderInlineText(parts[1])}</span>
                </div>
              );
            } else {
              segNodes.push(
                <span key={`line-${key}-${segIdx}-${subIdx}`}>{renderInlineText(subLine)}</span>
              );
            }
          });

          if (seg.sizeClass) {
            colNodes.push(
              <span key={`seg-${key}-${segIdx}`} className={seg.sizeClass}>
                {segNodes}
              </span>
            );
          } else {
            colNodes.push(...segNodes);
          }
        });

        result.push(
          <div
            key={key}
            className="latex-multicols-block"
            style={{
              columnCount: colCount,
              columnGap: "30px",
              textAlign: "justify",
              margin: "15px 0",
              width: "100%",
            }}
          >
            {colNodes}
          </div>
        );
        break;
      }
      case "paragraph":
      default: {
        const segments = segmentizeBlock(rawContent);
        const paragraphContent: React.ReactNode[] = [];

        segments.forEach((seg, segIdx) => {
          const subLines = seg.text.split(/\\\\|\\newline/).map((l) => l.trim());
          const segNodes: React.ReactNode[] = [];

          subLines.forEach((subLine, subIdx) => {
            if (subIdx > 0) {
              segNodes.push(<br key={`br-${key}-${segIdx}-${subIdx}`} />);
            }

            if (subLine.includes("\\hfill")) {
              const parts = subLine.split("\\hfill").map((p) => p.trim());
              segNodes.push(
                <div
                  key={`hfill-${key}-${segIdx}-${subIdx}`}
                  className="latex-hfill-line"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                    alignItems: "baseline",
                    textAlign: "left",
                  }}
                >
                  <span className="latex-hfill-left">{renderInlineText(parts[0])}</span>
                  <span className="latex-hfill-right">{renderInlineText(parts[1])}</span>
                </div>
              );
            } else {
              segNodes.push(
                <span key={`line-${key}-${segIdx}-${subIdx}`}>{renderInlineText(subLine)}</span>
              );
            }
          });

          if (seg.sizeClass) {
            paragraphContent.push(
              <span key={`seg-${key}-${segIdx}`} className={seg.sizeClass}>
                {segNodes}
              </span>
            );
          } else {
            paragraphContent.push(...segNodes);
          }
        });

        result.push(
          <p key={key} className="latex-paragraph">
            {paragraphContent}
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

    if (trimmed.startsWith("\\begin{center}")) {
      flushBlock();
      currentBlockType = "center";
      blockLines.push(line);
      continue;
    }
    if (trimmed.startsWith("\\end{center}")) {
      blockLines.push(line);
      flushBlock();
      continue;
    }

    if (trimmed.startsWith("\\begin{multicols}")) {
      flushBlock();
      currentBlockType = "multicols";
      blockLines.push(line);
      continue;
    }
    if (trimmed.startsWith("\\end{multicols}")) {
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

  // Extract content between \begin{document} and \end{document} to fully strip the LaTeX preamble
  const beginDocIdx = bodyCode.indexOf("\\begin{document}");
  if (beginDocIdx !== -1) {
    const endDocIdx = bodyCode.indexOf("\\end{document}");
    if (endDocIdx !== -1 && endDocIdx > beginDocIdx) {
      bodyCode = bodyCode.substring(beginDocIdx + "\\begin{document}".length, endDocIdx).trim();
    } else {
      bodyCode = bodyCode.substring(beginDocIdx + "\\begin{document}".length).trim();
    }
  }

  bodyCode = stripMacro(bodyCode, "\\title");
  bodyCode = stripMacro(bodyCode, "\\author");
  bodyCode = stripMacro(bodyCode, "\\date");
  bodyCode = stripMacro(bodyCode, "\\markboth");
  bodyCode = stripEnvironment(bodyCode, "abstract");
  bodyCode = stripEnvironment(bodyCode, "IEEEkeywords");
  bodyCode = stripEnvironment(bodyCode, "keywords");

  // Preprocess bodyCode to strip settings/macros that shouldn't render as text
  bodyCode = bodyCode
    // Strip preamble/settings macros completely
    .replace(/\\geometry\{[^}]*\}/g, "")
    .replace(/\\setlength\{[^}]*\}\{[^}]*\}/g, "")
    .replace(/\\definecolor\{[^}]*\}\{[^}]*\}\{[^}]*\}/g, "")
    .replace(/\\titleformat\*?\{[^}]*\}(?:\{[^}]*\}){0,4}/g, "")
    .replace(/\\titlespacing\*?\{[^}]*\}(?:\{[^}]*\}){0,3}/g, "")
    .replace(/\\setlist\*?\[[^\]]*\]\{[^}]*\}/g, "")
    .replace(/\\newcommand\{[^}]*\}\[[^\]]*\]\{[\s\S]*?\n\}/g, "") // remove macro definition blocks
    .replace(/\\newcommand\{[^}]*\}\{[\s\S]*?\}/g, "")

    // Strip layout control macros from body text
    .replace(/\\sloppy/g, "")
    .replace(/\\hyphenpenalty=\d+/g, "")
    .replace(/\\pagenumbering\{[^}]*\}/g, "")
    .replace(/\\selectfont/g, "")
    .replace(/\\fontsize\{\d+\}\{\d+\}/g, "")

    // Map specific custom resume macros to standard structures for elegant high-fidelity parsing
    .replace(/\\resumesection\*?\{/g, "\\section{");

  // Ensure multicols environments are on their own line boundaries to be matched correctly by line-by-line block parsers
  bodyCode = bodyCode
    .replace(/\\begin\{multicols\*?\}\{\d+\}/g, (match) => `\n${match}\n`)
    .replace(/\\end\{multicols\*?\}/g, (match) => `\n${match}\n`);

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
    // Built entirely via DOM APIs to avoid document.write() XSS sink (CodeQL: DOM text reinterpreted as HTML).
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
      // Set the document title safely via the DOM property (no HTML parsing)
      frameDoc.title = title || "LaTeX Compiled Document";

      // Add KaTeX stylesheet via DOM
      const katexLink = frameDoc.createElement("link");
      katexLink.setAttribute("rel", "stylesheet");
      katexLink.setAttribute(
        "href",
        "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css"
      );
      frameDoc.head.appendChild(katexLink);

      // Add print styles via DOM
      const styleEl = frameDoc.createElement("style");
      styleEl.textContent = `
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
      `;
      frameDoc.head.appendChild(styleEl);

      // Safe DOM cloning: use importNode to deep-clone the rendered content into the
      // iframe body instead of reading innerHTML and re-parsing it as raw HTML.
      // This preserves structure without creating a DOM-text-to-HTML XSS sink.
      const clonedContent = frameDoc.importNode(printContainerRef.current, true);
      frameDoc.body.appendChild(clonedContent);

      printFrame.contentWindow?.focus();

      // Safely clean up and remove the iframe after printing is completed or cancelled
      printFrame.contentWindow?.addEventListener("afterprint", () => {
        document.body.removeChild(printFrame);
      });

      // Allow KaTeX fonts to load before opening print dialog
      setTimeout(() => {
        printFrame.contentWindow?.print();
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
