import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { useUiStore, type ThemeMode } from "../stores/uiStore";

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  border: string;
}

const lightColors: ThemeColors = {
  background: "#ffffff",
  surface: "#f8f8f8",
  text: "#111111",
  textMuted: "#666666",
  primary: "#22c55e",
  border: "#e5e5e5",
};

const darkColors: ThemeColors = {
  background: "#0a0a0a",
  surface: "#1a1a1a",
  text: "#f5f5f5",
  textMuted: "#a0a0a0",
  primary: "#22c55e",
  border: "#2a2a2a",
};

const ThemeContext = createContext<ThemeColors>(lightColors);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme: ThemeMode = useUiStore((s) => s.theme);
  const systemScheme = useColorScheme();

  const colors = useMemo<ThemeColors>(() => {
    if (theme === "system") {
      return systemScheme === "dark" ? darkColors : lightColors;
    }
    return theme === "dark" ? darkColors : lightColors;
  }, [theme, systemScheme]);

  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}
