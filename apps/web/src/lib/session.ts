// Logins are kept in sessionStorage, which belongs to one tab or window. So two windows can be
// two different teams, and a refresh keeps you logged in. Storage can be blocked (private
// windows, strict settings), so every access is guarded: the app still works, it just forgets.

export function load<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is blocked: the login lasts until the page is closed or refreshed.
  }
}
