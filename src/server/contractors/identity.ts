export function normalizeContractorName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[«»"'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

