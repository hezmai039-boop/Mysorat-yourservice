// The service catalog itself already stores nameAr/nameEn per service (set by
// the platform owner), but "category" is a single free-text Arabic field
// with no English counterpart in the database - translating it would need a
// schema migration and re-seeding all 44 catalog entries. Categories are a
// small, fixed, owner-controlled set though, so a static map here covers
// English display without that migration - it just needs a new entry
// whenever the owner adds a genuinely new category via the admin API.
export const CATEGORY_EN: Record<string, string> = {
  "الأعمال والاستثمار": "Business & Investment",
  "الإسكان والعقار": "Housing & Real Estate",
  "الإقامة والجوازات": "Residency & Passports",
  "البلدية والمرافق": "Municipal & Utilities",
  "التعليم": "Education",
  "الصحة": "Health",
  "العدل والتوثيق": "Justice & Notarization",
  "المالية": "Finance",
  "المرور والمركبات": "Traffic & Vehicles",
  "الموارد البشرية": "Human Resources",
  "الهوية والأحوال المدنية": "Identity & Civil Affairs",
  "تأشيرات الزيارة والسياحة": "Visit & Tourism Visas",
};

export function localizeCategory(category: string, lang: string): string {
  if (lang !== "en") return category;
  return CATEGORY_EN[category] ?? category;
}
