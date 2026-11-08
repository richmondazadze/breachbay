"use client";
import { createContext, useContext, useEffect, useState } from "react";
type Theme = "dark" | "light";
const Context = createContext<{ theme: Theme; choose: (theme: Theme) => void }>(
  { theme: "light", choose: () => {} },
);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("breachbay-theme");
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
        document.documentElement.dataset.theme = saved;
      }
    } catch {}
  }, []);
  const choose = (next: Theme) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("breachbay-theme", next);
    } catch {}
  };
  return (
    <Context.Provider value={{ theme, choose }}>{children}</Context.Provider>
  );
}
export const useTheme = () => useContext(Context);
export function ThemeControl() {
  const { theme, choose } = useTheme();
  return (
    <button
      className="theme-toggle"
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={theme === "dark"}
      onClick={() => choose(theme === "dark" ? "light" : "dark")}
    >
      <span>Dark mode</span>
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb" />
      </span>
    </button>
  );
}
