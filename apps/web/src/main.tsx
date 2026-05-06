import React from "react";
import ReactDOM from "react-dom/client";
import { AppProviders } from "./app/providers";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement == null) {
  throw new Error("Root element '#root' was not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppProviders />
  </React.StrictMode>,
);
