export type PlayerNoteEntry = {
  id: string;
  body: string;
  createdAt?: string;
  resolved?: boolean;
  stage?: string;
};

export const playerNotesPrefix = "__xueran_notes_v1__";

export const parsePlayerNotes = (value: string): PlayerNoteEntry[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith(playerNotesPrefix)) {
    return [{ id: "legacy", body: value }];
  }
  try {
    const parsed = JSON.parse(trimmed.slice(playerNotesPrefix.length));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (note): note is PlayerNoteEntry =>
        Boolean(note) &&
        typeof note.id === "string" &&
        typeof note.body === "string" &&
        (note.createdAt === undefined || typeof note.createdAt === "string") &&
        (note.resolved === undefined || typeof note.resolved === "boolean") &&
        (note.stage === undefined || typeof note.stage === "string"),
    );
  } catch {
    return [{ id: "legacy", body: value }];
  }
};

export const serializePlayerNotes = (notes: PlayerNoteEntry[]) =>
  notes.length
    ? `${playerNotesPrefix}${JSON.stringify(notes)}`
    : "";
