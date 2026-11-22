import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { TrainingSourceProvider } from "./trainingSource/index.js";

// Mount the reader with a given training source. The web entry (main.jsx)
// passes the API-backed source; the extension's reader.html entry will pass
// its chrome.storage source.
export const createReaderApp = (source, container) => {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <TrainingSourceProvider source={source}>
        <App />
      </TrainingSourceProvider>
    </StrictMode>,
  );
  return root;
};
