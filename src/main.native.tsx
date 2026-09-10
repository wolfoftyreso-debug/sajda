import React from "react";
import { createRoot } from "react-dom/client";
import NativeApp from "./app/NativeApp";
import { isNativeApp } from "./lib/appSurface";
import "./index.css";

if (!isNativeApp) throw new Error("The product app entry requires VITE_SAJDA_SURFACE=native.");

createRoot(document.getElementById("root")!).render(<React.StrictMode><NativeApp /></React.StrictMode>);
