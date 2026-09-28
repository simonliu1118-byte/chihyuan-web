import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./app.css";
import "./auth/auth.css";
import "./ui/forms.css";
import "./ui/data/data-view.css";
import "./ui/pickers/entity-picker.css";
import "./ui/overlays/overlay.css";
import "./ui/feedback/toast.css";
import "./ui/related/related-record-panel.css";
import "./ui/readability.css";
import "./runtime/operational.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
