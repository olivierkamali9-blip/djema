import React from "react";
import ReactDOM from "react-dom/client";
import DjemaApp from "./App.jsx";
import BenchmarkLab from "./components/BenchmarkLab.jsx";
import "./index.css";

const Racine = window.location.pathname.startsWith("/benchmark") ? BenchmarkLab : DjemaApp;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Racine />
  </React.StrictMode>
);
