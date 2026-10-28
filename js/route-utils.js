/*
 * Resolve clean URL routes to the HTML page key used by portal layouts.
 * Handles /contributions/, /contributions/index.html and normal .html URLs.
 */
export function resolvePageFromPathname(pathname, fallback = "dashboard.html") {
  const segments = String(pathname || "")
    .split("/")
    .map(segment => segment.trim())
    .filter(Boolean);

  if (!segments.length) return fallback;

  const last = segments[segments.length - 1].toLowerCase();
  if (last === "index.html") {
    const directory = segments[segments.length - 2];
    return directory ? directory.toLowerCase() + ".html" : fallback;
  }

  return last.includes(".") ? last : last + ".html";
}
