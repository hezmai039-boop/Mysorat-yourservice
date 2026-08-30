import { useEffect, useState } from "react";

function getInitialTheme(): boolean {
  const stored = localStorage.getItem("mysorat_theme");
  if (stored) return stored === "dark";
  // الافتراضي داكن - هوية inDrive الليلية
  return true;
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("mysorat_theme", isDark ? "dark" : "light");
  }, [isDark]);

  return { isDark, toggle: () => setIsDark((prev) => !prev) };
}
