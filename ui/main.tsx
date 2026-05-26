import React from "react";
import ReactDOM from "react-dom/client";
import { openUrl } from "@tauri-apps/plugin-opener";
import App from "./App";

// Intercept all global external link clicks to open them in the system default browser
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const anchor = target.closest("a");
  if (anchor && anchor.href) {
    const url = anchor.href;
    try {
      const parsedUrl = new URL(url);
      const isExternal =
        (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
        parsedUrl.origin !== window.location.origin;
      const isSpecialScheme = parsedUrl.protocol === "mailto:" || parsedUrl.protocol === "tel:";

      if (isExternal || isSpecialScheme) {
        event.preventDefault();
        void openUrl(url).catch((err) => {
          console.error("Failed to open external link:", err);
        });
      }
    } catch {
      // Ignore invalid or unparseable URLs
    }
  }
});

if (import.meta.env.DEV) {
  import("./utils/privacy").then(({ runPrivacyTests }) => {
    try {
      runPrivacyTests();
    } catch (err) {
      console.error("Privacy utility self-test failed:", err);
    }
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
