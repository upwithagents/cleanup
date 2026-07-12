export type FileEntry = {
  path: string;
  size: number;
  mtimeMs: number;
  ext: string; // lowercased, no dot; "" when none
};

export type WalkResult = {
  files: FileEntry[];
  emptyDirs: string[];
  skipped: string[]; // paths we could not read
};

export type FindingKind =
  | "duplicate_set"
  | "huge_file"
  | "stale_file"
  | "type_mess"
  | "empty_dir";

export type FindingDraft = {
  kind: FindingKind;
  payload: unknown;
};

export type ProposalKind = "move" | "archive" | "trash";

export type ProposalDraft = {
  kind: ProposalKind;
  sourcePath: string;
  destPath: string | null; // null for trash: backup destination is computed at apply time
  rationale: string;
  origin: "heuristic" | "llm";
};
