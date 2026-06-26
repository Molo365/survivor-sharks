import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

setAuthTokenGetter(() => localStorage.getItem("auth_token"));

// Sliding-session interceptor: whenever the server returns a fresh X-Refresh-Token
// (set on every authenticated response), silently swap it into localStorage so
// the 2-day expiry clock resets with each user activity.
const _nativeFetch = window.fetch.bind(window);
window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
  const response = await _nativeFetch(...args);
  const refreshed = response.headers.get("x-refresh-token");
  if (refreshed) {
    localStorage.setItem("auth_token", refreshed);
  }
  return response;
};

createRoot(document.getElementById("root")!).render(<App />);
