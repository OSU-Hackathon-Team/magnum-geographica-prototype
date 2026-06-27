import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { useUiStore, type ThemeMode } from "../stores/uiStore";
import { lightColors, darkColors, type ThemeColors } from "../theme/colors";

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

const lightTheme: Theme = { colors: lightColors, isDark: false };
const darkTheme: Theme = { colors: darkColors, isDark: true };

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme: ThemeMode = useUiStore((s) => s.theme);
  const systemScheme = useColorScheme();

  const value = useMemo<Theme>(() => {
    if (theme === "system") {
      return systemScheme === "dark" ? darkTheme : lightTheme;
    }
    return theme === "dark" ? darkTheme : lightTheme;
  }, [theme, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * @deprecated Prefer `useTheme().colors`. Kept for the few callers that
 * only need a flat `ThemeColors` object. Will be removed once all
 * components are converted to `useTheme()`.
 */
export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
