import { useEffect, useMemo, useRef, useState } from 'react';
import { APPS, GROUPS, STATUS } from './apps.js';
import { findApps, firstOpenable, remember } from './search.js';

const load = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
};
const store = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Pins just last for this visit. */ }
};
const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const STATUS_STYLE = {
  live: 'text-live border-live',
  demo: 'text-ice border-ice',
  private: 'text-soft border-line',
  building: 'text-wait border-wait border-dashed',
};

function Row({ app, pinned, onPin, onOpen }) {
  const body = (
    <>
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line font-display text-sm font-extrabold text-ice">{initials(app.name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{app.name}</span>
        <span className="block text-sm text-soft">{app.note}</span>
      </span>
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[app.status]}`}>{STATUS[app.status]}</span>
    </>
  );
  return (
    <li className="flex items-center gap-1 border-t border-line first:border-t-0">
      {app.url ? (
        <a href={app.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(app.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-3 hover:bg-page">{body}</a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 p-3">{body}</div>
      )}
      <button type="button" aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${app.name}`} onClick={() => onPin(app.id)} className={`size-10 shrink-0 cursor-pointer rounded-lg text-lg hover:bg-page ${pinned ? 'text-ice' : 'text-soft'}`}>{pinned ? '★' : '☆'}</button>
    </li>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [pinned, setPinned] = useState(() => load('launcher-pinned'));
  const [recent, setRecent] = useState(() => load('launcher-recent'));
  const input = useRef(null);

  const found = useMemo(() => findApps(APPS, query, group, pinned), [query, group, pinned]);
  const searching = query.trim() !== '' || group !== '';
  const recentApps = recent.map((id) => APPS.find((a) => a.id === id)).filter(Boolean);
  const top = firstOpenable(found);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement !== input.current) { e.preventDefault(); input.current.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePin = (id) => setPinned((list) => {
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    store('launcher-pinned', next);
    return next;
  });
  const opened = (id) => setRecent((list) => {
    const next = remember(list, id);
    store('launcher-recent', next);
    return next;
  });
  const onSearchKey = (e) => {
    if (e.key === 'Escape') setQuery('');
    if (e.key === 'Enter' && top) {
      opened(top.id);
      window.open(top.url, '_blank', 'noopener,noreferrer');
    }
  };

  const rows = (list) => (
    <ul className="m-0 list-none rounded-xl border border-line bg-panel p-1">
      {list.map((app) => <Row key={app.id} app={app} pinned={pinned.includes(app.id)} onPin={togglePin} onOpen={opened} />)}
    </ul>
  );

  return (
    <main className="wrap mx-auto grid max-w-3xl gap-6 pb-14 pt-8">
      <header className="grid gap-4">
        <h1 className="m-0 font-display text-4xl font-extrabold tracking-tight">Launcher</h1>
        <label className="block">
          <span className="sr-only">Search your apps</span>
          <input id="search" ref={input} value={query} autoFocus autoComplete="off" onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
            placeholder="Search, then press Enter" className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-lg text-ink placeholder:text-soft" />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by group">
          {['', ...GROUPS].map((name) => (
            <button key={name || 'all'} type="button" aria-pressed={group === name} onClick={() => setGroup(name)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold ${group === name ? 'border-ice bg-ice text-on-ice' : 'border-line text-ink'}`}>{name || 'All'}</button>
          ))}
        </div>
      </header>

      {searching ? (
        <section aria-label="Results">
          {found.length ? rows(found) : <p className="text-soft">No apps match that. Try a shorter search, or choose All.</p>}
        </section>
      ) : (
        <>
          {recentApps.length > 0 && (
            <section className="grid gap-2">
              <h2 className="m-0 font-display text-lg font-semibold">Recent</h2>
              {rows(recentApps)}
            </section>
          )}
          {GROUPS.map((name) => (
            <section key={name} className="grid gap-2">
              <h2 className="m-0 font-display text-lg font-semibold">{name}</h2>
              {rows(found.filter((app) => app.group === name))}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
