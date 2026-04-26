import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { analyticsApi, settingsApi } from '../api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [overview, setOverview] = useState(null);
  const [settings, setSettings] = useState({});
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const refreshOverview = useCallback(async () => {
    try {
      const res = await analyticsApi.overview();
      setOverview(res.data);
    } catch {}
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await settingsApi.get();
      setSettings(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([refreshOverview(), refreshSettings()]).finally(() => setLoading(false));
    // Refresh overview every 2 minutes
    const interval = setInterval(refreshOverview, 120000);
    return () => clearInterval(interval);
  }, []);

  const toggleDarkMode = () => setDarkMode(d => !d);

  return (
    <AppContext.Provider value={{
      overview, settings, darkMode, loading,
      refreshOverview, refreshSettings, toggleDarkMode,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
