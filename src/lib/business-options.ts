// Shared by server validation and client forms, so it must not import anything server-only.

export const PROVINCES = {
  EC: "Eastern Cape",
  FS: "Free State",
  GP: "Gauteng",
  KZN: "KwaZulu-Natal",
  LP: "Limpopo",
  MP: "Mpumalanga",
  NC: "Northern Cape",
  NW: "North West",
  WC: "Western Cape",
} as const;

export type ProvinceCode = keyof typeof PROVINCES;
export const PROVINCE_CODES = Object.keys(PROVINCES) as [ProvinceCode, ...ProvinceCode[]];

export const LANGUAGE_NAMES = { en: "English", zu: "isiZulu", st: "Sesotho", tn: "Setswana" } as const;
