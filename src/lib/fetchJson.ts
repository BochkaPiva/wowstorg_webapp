/**
 * Парсинг JSON из Response без unhandled rejection при пустом/не-JSON теле.
 */
export async function readJsonSafe<T = unknown>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
