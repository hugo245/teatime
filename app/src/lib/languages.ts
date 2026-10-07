export type Language = { code: string; name: string; native: string };

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'sv', name: 'Swedish', native: 'Svenska' },
  { code: 'da', name: 'Danish', native: 'Dansk' },
  { code: 'no', name: 'Norwegian', native: 'Norsk' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
];

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

export function languageName(code: string) {
  const language = byCode.get(code);
  if (!language) return code;
  return language.name === language.native ? language.name : `${language.native} (${language.name})`;
}

export function deviceLanguage(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    const code = locale.split('-')[0]!.toLowerCase();
    if (code === 'nb' || code === 'nn') return 'no';
    return byCode.has(code) ? code : 'en';
  } catch {
    return 'en';
  }
}
