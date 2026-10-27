"use client";

// Mensajes del formulario de /contacto: bandeja de entrada y archivados, filtros (texto, leídos, rango de fechas),
// selección múltiple con acciones en lote y panel de lectura. Abrir un mensaje lo marca como leído.
import { useId, useMemo, useRef, useState } from "react";
import type { ContactMessage } from "@/lib/contact/types";
import { addDays, dayKey } from "@/lib/admin/metrics";
import {
  countMessages,
  DEFAULT_MESSAGE_FILTERS,
  filterMessages,
  type MessageFilters,
  type MessageFolder,
  type MessageReadFilter,
} from "@/lib/admin/messages";
import { useAdminToday, useDataSource } from "./AdminProvider";
import { AdminDialog } from "./AdminDialog";
import { formatDateTime } from "./format";
import { useMessagesState, useMessagesStore } from "./useMessages";
import ui from "./admin.module.css";
import styles from "./messages.module.css";

const PAGE = 50;

const relativeDate = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short" });
const timeOnly = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" });

/** Fecha corta de la lista: la hora si es de hoy, "ayer" o el día y mes. */
function listDate(iso: string, today: string): string {
  const day = dayKey(iso);
  if (day === today) return timeOnly.format(new Date(iso));
  if (day === addDays(today, -1)) return "Ayer";
  return relativeDate.format(new Date(iso));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

const PRESETS: { label: string; days: number }[] = [
  { label: "Hoy", days: 0 },
  { label: "Últimos 7 días", days: 6 },
  { label: "Últimos 30 días", days: 29 },
];

export function MessagesView() {
  const id = useId();
  const demo = useDataSource() === "demo";
  const store = useMessagesStore();
  const state = useMessagesState();
  const [filters, setFilters] = useState<MessageFilters>(DEFAULT_MESSAGE_FILTERS);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const readerRef = useRef<HTMLHeadingElement>(null);
  const today = useAdminToday();

  const counts = useMemo(() => countMessages(state.messages), [state.messages]);
  const filtered = useMemo(() => filterMessages(state.messages, filters), [state.messages, filters]);
  const shown = filtered.slice(0, limit);
  const open = openId ? (state.messages.find((m) => m.id === openId) ?? null) : null;
  const filtersActive = filters.read !== "all" || filters.from !== "" || filters.to !== "" || filters.query.trim() !== "";

  // Al cambiar los filtros se limpia la selección (no se actúa sobre mensajes que no se ven).
  const update = (patch: Partial<MessageFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setSelected(new Set());
    setLimit(PAGE);
  };

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "ok", text: ok });
    } catch {
      setNotice({ kind: "error", text: "No se pudo completar la acción. Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  const plural = (n: number) => (n === 1 ? "1 mensaje" : `${n} mensajes`);

  function openMessage(m: ContactMessage) {
    setOpenId(m.id);
    if (!m.read) void store.update([m.id], { read: true }).catch(() => undefined);
    requestAnimationFrame(() => readerRef.current?.focus());
  }

  async function setArchived(ids: string[], archived: boolean) {
    await run(() => store.update(ids, { archived }), `${plural(ids.length)} ${archived ? "archivado" : "movido a la bandeja de entrada"}${ids.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    if (openId && ids.includes(openId)) setOpenId(null);
  }

  async function setRead(ids: string[], read: boolean) {
    await run(() => store.update(ids, { read }), `${plural(ids.length)} marcado${ids.length === 1 ? "" : "s"} como ${read ? "leído" : "no leído"}${ids.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    if (!read && openId && ids.includes(openId)) setOpenId(null);
  }

  async function remove(ids: string[]) {
    await run(() => store.remove(ids), `${plural(ids.length)} eliminado${ids.length === 1 ? "" : "s"}.`);
    setConfirmDelete(null);
    setSelected(new Set());
    if (openId && ids.includes(openId)) setOpenId(null);
  }

  const allShownSelected = shown.length > 0 && shown.every((m) => selected.has(m.id));
  const selectedIds = [...selected];
  const folder = filters.folder;

  return (
    <div className={ui.page}>
      <div className={ui.pageHeader}>
        <div>
          <h1>Mensajes</h1>
          <p className={ui.lead}>
            Mensajes enviados desde el formulario de contacto.
            {demo ? " En la demostración se guardan en este navegador." : ""}
          </p>
        </div>
      </div>

      <ul className={styles.stats}>
        <li className={styles.stat}>
          <span className={styles.statValue}>{counts.unread}</span>
          <span className={styles.statLabel}>Sin leer</span>
        </li>
        <li className={styles.stat}>
          <span className={styles.statValue}>{counts.inbox}</span>
          <span className={styles.statLabel}>En bandeja</span>
        </li>
        <li className={styles.stat}>
          <span className={styles.statValue}>{counts.archived}</span>
          <span className={styles.statLabel}>Archivados</span>
        </li>
      </ul>

      <div className={styles.folders} role="group" aria-label="Carpeta">
        {(
          [
            ["inbox", "Bandeja de entrada", counts.inbox],
            ["archived", "Archivados", counts.archived],
          ] as [MessageFolder, string, number][]
        ).map(([value, label, n]) => (
          <button
            key={value}
            type="button"
            className={styles.folder}
            aria-pressed={folder === value}
            onClick={() => {
              update({ folder: value });
              setOpenId(null);
            }}
          >
            {label}
            <span className={styles.folderCount}>{n}</span>
          </button>
        ))}
      </div>

      <form className={styles.filters} role="search" aria-label="Filtrar mensajes" onSubmit={(e) => e.preventDefault()}>
        <div className={`${ui.field} ${styles.search}`}>
          <label className={ui.label} htmlFor={`${id}-q`}>
            Buscar
          </label>
          <input
            id={`${id}-q`}
            type="search"
            className={ui.input}
            placeholder="Nombre, correo, teléfono o texto"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
          />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-read`}>
            Estado
          </label>
          <select id={`${id}-read`} className={ui.select} value={filters.read} onChange={(e) => update({ read: e.target.value as MessageReadFilter })}>
            <option value="all">Todos</option>
            <option value="unread">No leídos</option>
            <option value="read">Leídos</option>
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-from`}>
            Desde
          </label>
          <input id={`${id}-from`} type="date" className={ui.input} value={filters.from} max={filters.to || today} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-to`}>
            Hasta
          </label>
          <input id={`${id}-to`} type="date" className={ui.input} value={filters.to} min={filters.from || undefined} max={today} onChange={(e) => update({ to: e.target.value })} />
        </div>
        <div className={styles.presets}>
          {PRESETS.map((p) => {
            const from = addDays(today, -p.days);
            const active = filters.from === from && filters.to === today;
            return (
              <button key={p.label} type="button" className={styles.chip} aria-pressed={active} onClick={() => update(active ? { from: "", to: "" } : { from, to: today })}>
                {p.label}
              </button>
            );
          })}
          {filtersActive ? (
            <button type="button" className={styles.clear} onClick={() => update({ read: "all", from: "", to: "", query: "" })}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </form>

      {notice ? (
        <p className={`${ui.alert} ${notice.kind === "ok" ? ui.alertOk : ui.alertError}`} role={notice.kind === "ok" ? "status" : "alert"}>
          {notice.text}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className={`${ui.alert} ${ui.alertError}`} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={`${styles.split} ${open ? styles.splitOpen : ""}`}>
        <section className={styles.listPane} aria-label="Lista de mensajes">
          <div className={styles.listHead}>
            <label className={styles.selectAll}>
              <input
                type="checkbox"
                checked={allShownSelected}
                disabled={shown.length === 0}
                onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((m) => m.id)))}
              />
              <span>{allShownSelected ? "Quitar selección" : "Seleccionar todos"}</span>
            </label>
            <p className={styles.resultCount} role="status">
              {state.status === "loading" ? "Cargando…" : plural(filtered.length)}
            </p>
          </div>

          {state.status === "loading" ? (
            <p className={styles.emptyState}>Cargando mensajes…</p>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 6.5h17v11h-17z" />
                <path d="m3.5 7 8.5 6.5L20.5 7" />
              </svg>
              <p>
                {filtersActive
                  ? "No hay mensajes con estos filtros."
                  : folder === "archived"
                    ? "No hay mensajes archivados."
                    : "Aún no hay mensajes. Aparecerán aquí cuando alguien escriba desde la página de contacto."}
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {shown.map((m) => {
                const isSelected = selected.has(m.id);
                return (
                  <li
                    key={m.id}
                    className={`${styles.item} ${m.read ? "" : styles.itemUnread} ${m.id === openId ? styles.itemOpen : ""} ${isSelected ? styles.itemSelected : ""}`}
                  >
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selected);
                          if (isSelected) next.delete(m.id);
                          else next.add(m.id);
                          setSelected(next);
                        }}
                      />
                      <span className="visually-hidden">Seleccionar mensaje de {m.name}</span>
                    </label>
                    <button type="button" className={styles.itemButton} aria-current={m.id === openId ? "true" : undefined} onClick={() => openMessage(m)}>
                      <span className={styles.avatar} aria-hidden="true">
                        {initials(m.name)}
                      </span>
                      <span className={styles.itemBody}>
                        <span className={styles.itemTop}>
                          <span className={styles.itemName}>
                            {m.read ? null : <span className="visually-hidden">No leído: </span>}
                            {m.name}
                          </span>
                          <time className={styles.itemDate} dateTime={m.createdAt} title={formatDateTime(m.createdAt)}>
                            {listDate(m.createdAt, today)}
                          </time>
                        </span>
                        <span className={styles.itemEmail}>{m.email}</span>
                        <span className={styles.itemPreview}>{m.message}</span>
                      </span>
                      {m.read ? null : <span className={styles.dot} aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > shown.length ? (
            <div className={styles.more}>
              <button type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={() => setLimit(limit + PAGE)}>
                Mostrar más ({filtered.length - shown.length} restantes)
              </button>
            </div>
          ) : null}
        </section>

        <section className={styles.readerPane} aria-label="Mensaje abierto">
          {open ? (
            <article className={styles.reader}>
              <button type="button" className={styles.back} onClick={() => setOpenId(null)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14.5 6 8.5 12l6 6" />
                </svg>
                Volver a la lista
              </button>
              <header className={styles.readerHead}>
                <span className={`${styles.avatar} ${styles.avatarLg}`} aria-hidden="true">
                  {initials(open.name)}
                </span>
                <div className={styles.readerWho}>
                  <h2 ref={readerRef} tabIndex={-1}>
                    {open.name}
                  </h2>
                  <p>
                    <time dateTime={open.createdAt}>{formatDateTime(open.createdAt)}</time>
                    {open.archived ? <span className={`${ui.badge} ${styles.archivedBadge}`}>Archivado</span> : null}
                  </p>
                </div>
              </header>

              <dl className={styles.contact}>
                <div>
                  <dt>Correo</dt>
                  <dd>
                    <a href={`mailto:${open.email}`}>{open.email}</a>
                  </dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>{open.phone ? <a href={`tel:${open.phone}`}>{open.phone}</a> : <span className={styles.muted}>No indicó</span>}</dd>
                </div>
              </dl>

              <div className={styles.messageBody}>{open.message}</div>

              <div className={styles.readerActions}>
                <a
                  className={`${ui.btn} ${styles.reply}`}
                  href={`mailto:${open.email}?subject=${encodeURIComponent("Respuesta a tu mensaje en Nutra Elements")}`}
                >
                  Responder por correo
                </a>
                {open.phone ? (
                  <a className={`${ui.btn} ${ui.btnOutline}`} href={`https://wa.me/${open.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp<span className="visually-hidden"> (se abre en una pestaña nueva)</span>
                  </a>
                ) : null}
                <span className={styles.spacer} />
                <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => void setRead([open.id], false)}>
                  Marcar como no leído
                </button>
                <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => void setArchived([open.id], !open.archived)}>
                  {open.archived ? "Mover a la bandeja" : "Archivar"}
                </button>
                <button type="button" className={`${ui.btn} ${ui.btnDangerOutline}`} disabled={busy} onClick={() => setConfirmDelete([open.id])}>
                  Eliminar
                </button>
              </div>
            </article>
          ) : (
            <div className={styles.readerEmpty}>
              <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7.5 12 3l8 4.5v9.5H4z" />
                <path d="m4 8 8 5.5L20 8" />
              </svg>
              <p>Selecciona un mensaje para leerlo.</p>
            </div>
          )}
        </section>
      </div>

      {selected.size > 0 ? (
        <div className={ui.selectionBar} role="region" aria-label="Acciones sobre la selección">
          <p>{selected.size === 1 ? "1 seleccionado" : `${selected.size} seleccionados`}</p>
          <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => void setRead(selectedIds, true)}>
            Marcar leídos
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => void setRead(selectedIds, false)}>
            Marcar no leídos
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => void setArchived(selectedIds, folder === "inbox")}>
            {folder === "inbox" ? "Archivar" : "Mover a la bandeja"}
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnDanger}`} disabled={busy} onClick={() => setConfirmDelete(selectedIds)}>
            Eliminar
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => setSelected(new Set())}>
            Cancelar
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <AdminDialog
          title={confirmDelete.length === 1 ? "Eliminar mensaje" : `Eliminar ${confirmDelete.length} mensajes`}
          description="Se eliminan definitivamente y no se pueden recuperar. Si solo quieres sacarlos de la bandeja, archívalos."
          busy={busy}
          onClose={() => setConfirmDelete(null)}
        >
          <div className={ui.actions}>
            <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => setConfirmDelete(null)}>
              Cancelar
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnDanger}`} disabled={busy} onClick={() => void remove(confirmDelete)}>
              {busy ? "Eliminando…" : "Eliminar definitivamente"}
            </button>
          </div>
        </AdminDialog>
      ) : null}
    </div>
  );
}
