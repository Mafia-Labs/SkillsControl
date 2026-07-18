import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en/translation.json'
import es from './locales/es/translation.json'
import fr from './locales/fr/translation.json'
import zh from './locales/zh/translation.json'
import ja from './locales/ja/translation.json'
import de from './locales/de/translation.json'

export const supportedLanguages = ['en', 'es', 'fr', 'zh', 'ja', 'de'] as const
export type SupportedLanguage = typeof supportedLanguages[number]

const languageStorageKey = 'skill-control-language'

const getStoredLanguage = (): SupportedLanguage | null => {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(languageStorageKey)
  return supportedLanguages.includes(stored as SupportedLanguage) ? stored as SupportedLanguage : null
}

const detectLanguage = (): SupportedLanguage => {
  const stored = getStoredLanguage()
  if (stored) return stored
  const browser = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en'
  return supportedLanguages.includes(browser as SupportedLanguage) ? browser as SupportedLanguage : 'en'
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      zh: { translation: zh },
      ja: { translation: ja },
      de: { translation: de }
    },
    lng: detectLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    react: { useSuspense: false }
  })

i18n.on('languageChanged', (language) => {
  if (typeof window !== 'undefined' && supportedLanguages.includes(language as SupportedLanguage)) {
    window.localStorage.setItem(languageStorageKey, language)
  }
})

export default i18n
