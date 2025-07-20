// packages/shared/src/utils/string.utils.ts
export function toUpperCase(str: string): string {
  return str.toUpperCase();
}

export function toLowerCase(str: string): string {
  return str.toLowerCase();
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function truncate(str: string, length: number, suffix: string = '...'): string {
  if (str.length <= length) return str;
  return str.substring(0, length - suffix.length) + suffix;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatSKU(sku: string): string {
  return sku.toUpperCase().replace(/\s+/g, '-');
}

