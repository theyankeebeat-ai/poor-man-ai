import { useTheme as useUniversalTheme, THEMES as UNIVERSAL_THEMES, type ThemeName } from "./ThemeContext";
import type { ReactNode } from "react";

export type ThemeId = ThemeName | "dark" | "midnight" | "aurora";

export const THEMES: { id: ThemeName; label: string }[] = [
  { id: "cyber-dark", label: "Cyber Dark" },
  { id: "midnight-blue", label: "Midnight" },
  { id: "matrix", label: "Matrix" },
  { id: "dracula", label: "Synthwave" },
  { id: "light", label: "Light" },
  { id: "beige", label: "Beige" }
];

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Pass-through wrapper since universal ThemeProvider is already mounted at root
  return <>{children}</>;
}

export function useTheme() {
  const { theme, setTheme } = useUniversalTheme();
  return {
    theme,
    setTheme: (t: ThemeName | string) => {
      if (t === "dark") return setTheme("cyber-dark");
      if (t === "midnight") return setTheme("midnight-blue");
      if (t === "aurora") return setTheme("dracula");
      return setTheme(t as ThemeName);
    }
  };
}
