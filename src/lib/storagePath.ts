/** Supabase Storage keys reject characters outside [A-Za-z0-9 !\-_.*'()/] --
 *  in practice spaces and other punctuation in a real filename (e.g. a
 *  default macOS screenshot, "Screenshot 2026-09-05 at 7.08.43 AM.png")
 *  trip an "Invalid key" 400 with no user-facing error, so evidence upload
 *  silently produced nothing. Strip it down to a safe subset instead of
 *  passing the original name straight through.
 */
export function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot + 1).replace(/[^a-zA-Z0-9]/g, "") : "";
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
  return ext ? `${safeBase}.${ext.toLowerCase()}` : safeBase;
}
