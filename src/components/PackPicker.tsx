import { PACKS, buildPack, packGroups, playableTracks, type Selection } from '../data/packs';

interface Props {
  value: Selection;
  onChange: (selection: Selection) => void;
}

/** Choose one or more packs and, inside each, which groups to play (e.g. only Fother Muckers, only endings). */
export function PackPicker({ value, onChange }: Props) {
  const total = buildPack(value).tracks.length;

  function togglePack(id: string) {
    const on = value.some((s) => s.id === id);
    const next = on ? value.filter((s) => s.id !== id) : [...value, { id, groups: [] }];
    if (next.length) onChange(next);
  }

  function toggleGroup(id: string, group: string, all: string[]) {
    onChange(
      value.map((s) => {
        if (s.id !== id) return s;
        const active = s.groups.length ? s.groups : all;
        const next = active.includes(group) ? active.filter((g) => g !== group) : [...active, group];
        if (next.length === 0) return s; // at least one group stays on
        return { id, groups: next.length === all.length ? [] : next };
      }),
    );
  }

  return (
    <div className="pack-picker">
      {PACKS.map((pack) => {
        const chosen = value.find((s) => s.id === pack.id);
        const groups = packGroups(pack);
        const count = playableTracks(pack).length;
        return (
          <div key={pack.id} className={`pick ${chosen ? 'on' : ''}`}>
            <label className="check">
              <input type="checkbox" checked={!!chosen} disabled={count === 0} onChange={() => togglePack(pack.id)} />
              <span>
                <strong>{pack.name}</strong> <span className="muted">· {count} canciones</span>
              </span>
            </label>
            {chosen && groups.length > 1 && (
              <div className="chips">
                {groups.map((g) => {
                  const active = chosen.groups.length === 0 || chosen.groups.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      className={`chip ${active ? 'active' : ''}`}
                      aria-pressed={active}
                      onClick={() => toggleGroup(pack.id, g, groups)}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <p className="muted">{total} canciones en juego</p>
    </div>
  );
}
