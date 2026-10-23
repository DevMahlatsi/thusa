import { en } from "./en";
import { st } from "./st";
import { tn } from "./tn";
import type { Language, TemplateKey, TemplateParams, TemplateSet } from "./types";
import { zu } from "./zu";

export * from "./types";

export const templates: Record<Language, TemplateSet> = { en, zu, st, tn };

export function renderTemplate<K extends TemplateKey>(language: Language, key: K, params: TemplateParams[K]): string {
  return templates[language][key](params);
}
