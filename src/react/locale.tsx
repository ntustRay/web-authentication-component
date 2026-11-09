"use client";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  type AuthMessageOverrides,
  type AuthMessages,
  en,
  ja,
  zhTW,
} from "./messages.js";

export interface AuthLocaleOptions {
  /** BCP 47 language tag, selected by the host so SSR and hydration agree. */
  locale?: string | undefined;
  messages?: AuthMessageOverrides | undefined;
}
export interface AuthLocale {
  locale: string;
  messages: AuthMessages;
}

const LocaleContext = createContext<AuthLocale>({
  locale: "zh-TW",
  messages: zhTW,
});

function canonicalize(tag: string): string {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? "en";
  } catch {
    return "en";
  }
}

function selectCatalog(canonical: string, custom: boolean): AuthLocale {
  switch (canonical.split("-")[0]) {
    case "zh":
      return { locale: custom ? canonical : "zh-TW", messages: zhTW };
    case "ja":
      return { locale: canonical, messages: ja };
    case "en":
      return { locale: canonical, messages: en };
    default:
      return { locale: custom ? canonical : "en", messages: en };
  }
}

/** Read the current language and its complete, resolved message dictionary. */
export function useAuthLocale(): AuthLocale {
  return useContext(LocaleContext);
}

export function AuthLocaleProvider({
  locale,
  messages,
  children,
}: AuthLocaleOptions & { children: ReactNode }) {
  const parent = useAuthLocale();
  const value = useMemo(() => {
    const tag = locale === undefined ? parent.locale : canonicalize(locale);
    const base =
      tag === parent.locale ? parent : selectCatalog(tag, !!messages);
    if (!messages) return base;
    return {
      locale: base.locale,
      messages: {
        ...base.messages,
        ...messages,
        errors: { ...base.messages.errors, ...messages.errors },
        issues: { ...base.messages.issues, ...messages.issues },
      },
    };
  }, [locale, messages, parent]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
