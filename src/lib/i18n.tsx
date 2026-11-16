import { createContext, useContext, useEffect, useState } from 'react';

export type AppLanguage = 'en' | 'sw';

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (next: AppLanguage) => void;
  t: (en: string, sw: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => undefined,
  t: (en) => en,
});

const STORAGE_KEY = 'tujenge_hub_lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    if (typeof window === 'undefined') return 'en';
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'sw' ? 'sw' : 'en';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
  }, [lang]);

  const setLang = (next: AppLanguage) => setLangState(next);
  const t = (en: string, sw: string) => (lang === 'sw' ? sw : en);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  return useContext(LanguageContext);
}
