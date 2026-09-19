import { connectionReady } from "./activation";
import type { OrcaConnection } from "../services/orca";

export type ConnectionFilter = "all" | "reviewed" | "needs-review" | "paused" | "archived";

export function filterConnections(
  connections: OrcaConnection[],
  query: string,
  filter: ConnectionFilter,
): OrcaConnection[] {
  const words = query
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return connections.filter((connection) => {
    if (connection.deletedAt) return false;
    if (filter === "archived" ? !connection.archivedAt : connection.archivedAt) return false;
    if (filter === "reviewed" && !connectionReady(connection)) return false;
    if (
      filter === "needs-review" &&
      (!connection.enabled || connectionReady(connection))
    )
      return false;
    if (filter === "paused" && connection.enabled) return false;
    const text = `${connection.name} ${connection.description}`
      .normalize("NFKC")
      .toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function connectionPage<T>(
  items: T[],
  requestedPage: number,
  pageSize = 10,
) {
  const size = Math.max(1, Math.trunc(pageSize) || 10);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, Math.trunc(requestedPage) || 1));
  const offset = (page - 1) * size;
  return {
    items: items.slice(offset, offset + size),
    page,
    pages,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + size, total),
  };
}
