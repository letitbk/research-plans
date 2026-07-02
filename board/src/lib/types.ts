// Mirrors the payload board.py injects into the #board-data slot (schemaVersion 1).

export interface BoardData {
  schemaVersion: number;
  generatedAt: string;
  mode: "live" | "static";
  focus: string | null;
  project: { name: string; root?: string };
  git: {
    available: boolean;
    branch?: string;
    head?: string;
    fileDates?: Record<string, { firstCommit?: string; lastCommit?: string }>;
  };
  files: {
    masterPlan: BoardFile;
    decisionLog: BoardFile;
    executionPlans: ExecutionPlanGroup[];
    reviews: BoardFile[];
  };
}

export interface BoardFile {
  path: string;
  content: string;
}

export interface ExecutionPlanGroup {
  component: string; // NN-slug
  versions: PlanVersionFile[];
  draft?: DraftFile;
}

export interface PlanVersionFile extends BoardFile {
  version: number;
}

export interface DraftFile extends BoardFile {
  proposedVersion: number;
}

// ---- parsed shapes (client-side contract parsing; see parse.ts) ----

export interface ParsedMasterPlan {
  ok: boolean;
  title: string;
  lastUpdated: string | null;
  contextMd: string;
  components: TrackerRow[];
  sequencingMd: string | null;
  raw: string;
}

export type TrackerStatus =
  | "not started"
  | "planned"
  | "in progress"
  | "done"
  | "dropped"
  | "unknown";

export interface TrackerRow {
  num: string;
  component: string;
  status: TrackerStatus;
  planLink: string;
  notes: string;
}

export interface ParsedLogEntry {
  timestamp: string;
  lateCaptured: boolean;
  fields: { label: string; text: string }[];
  raw: string;
}

export interface ParsedExecutionPlan {
  ok: boolean;
  title: string;
  version: number | null;
  componentSlug: string | null;
  date: string | null;
  supersedes: string | null;
  sections: { heading: string; content: string }[];
  signedOff: string | null;
  raw: string;
}

export interface Scorecard {
  schemaVersion: number;
  component: string;
  planVersion: number;
  planPath: string;
  rubricVersion: string;
  date: string;
  items: ScorecardItem[];
  raw: number;
  applicableMax: number;
  percent: number;
  band: string;
  excluded?: { id: number; why: string }[];
  topRevisions?: string[];
  split?: { verdict: string; detail: string };
}

export interface ScorecardItem {
  id: number;
  name?: string;
  score: number | null;
  status?: string; // "N/A" | "unknown" when score is null
  evidence?: string;
  justification?: string;
}

// ---- annotations ----

export interface PlanCommentAnnotation {
  id: string;
  type: "plan-comment";
  planPath: string;
  component: string;
  version: number;
  isDraft: boolean;
  quote: string;
  prefix: string;
  suffix: string;
  sectionHeading: string;
  occurrenceIndex: number;
  anchored: boolean;
  comment: string;
}

export interface GeneralAnnotation {
  id: string;
  type: "general";
  view: string;
  comment: string;
}

export type Annotation = PlanCommentAnnotation | GeneralAnnotation;
