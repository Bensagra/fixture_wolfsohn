import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TournamentProvider } from "./lib/store";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TournamentProvider>
      <App />
    </TournamentProvider>
  </React.StrictMode>,
);
