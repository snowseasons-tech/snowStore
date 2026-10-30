// Pinned apps first, then the catalog order. Every word of the query must match somewhere.
export function findApps(apps, query, group, pinned = []) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = apps.filter((app) => {
    if (group && app.group !== group) return false;
    const text = `${app.name} ${app.note} ${app.group} ${app.keys || ''}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  return [...matches].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
}

// The first match that can be opened, for the Enter key.
export const firstOpenable = (apps) => apps.find((app) => app.url) || null;

export const remember = (list, id, max = 5) => [id, ...list.filter((x) => x !== id)].slice(0, max);
