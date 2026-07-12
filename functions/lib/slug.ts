const combiningDiacritics = /[̀-ͯ]/g

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(combiningDiacritics, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Stable once generated — never regenerate on edit, since changing a job's
// URL breaks search-engine indexing and any links already shared. The id
// suffix guarantees uniqueness even when two jobs share a title+company.
export function buildJobSlug(title: string, company: string, id: string): string {
  const base = [slugify(title), slugify(company)].filter(Boolean).join('-') || 'role'
  return `${base}-${id.replace(/-/g, '').slice(0, 8)}`
}
