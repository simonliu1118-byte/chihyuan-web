import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./app.css";
import "./ui/forms.css";
import "./ui/data/data-view.css";
import "./ui/pickers/entity-picker.css";
import "./ui/overlays/overlay.css";
import "./ui/feedback/toast.css";
import "./ui/related/related-record-panel.css";
import "./modules/customer/customer-preview.css";
import "./modules/customer/customer-edit-preview.css";
import "./modules/customer/customer-approved-layout.css";
import "./modules/customer/customer-related-preview.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);