import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

export function useTheme() {
  const { theme, effectiveTheme, setTheme, computeEffectiveTheme } = useThemeStore();

  useEffect(() => {
    // Apply theme class to document element
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    // Listen for system theme changes when in system mode
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      computeEffectiveTheme();
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, computeEffectiveTheme]);

  return { theme, effectiveTheme, setTheme };
}

// Initialize theme on app load (call before React renders)
export function initializeTheme() {
  const stored = localStorage.getItem('theme-storage');
  const theme = stored ? JSON.parse(stored).state?.theme || 'system' : 'system';

  const getSystemTheme = () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.classList.add(effectiveTheme);
}
