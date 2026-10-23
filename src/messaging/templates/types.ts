export const LANGUAGES = ["en", "zu", "st", "tn"] as const;
export type Language = (typeof LANGUAGES)[number];

// Every template and its parameters. Adding a key here forces all four languages to implement it.
export type TemplateParams = {
  otp: { code: string; minutes: number };
};

export type TemplateKey = keyof TemplateParams;

export type TemplateSet = { [K in TemplateKey]: (params: TemplateParams[K]) => string };
