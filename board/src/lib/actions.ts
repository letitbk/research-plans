// Researcher-action availability (control surface, spec §3). One rule for
// visibility — live board, not in a gate — and one state machine per plan:
// a displayed working draft is approvable; a signed current version shows its
// badge; archived/pre-renewal components and plan-less groups offer nothing.
import { parseExecutionPlan, preRenewalSlugs } from "./parse";
import type { Annotation, BoardData } from "./types";

export interface PlanActionState {
  kind: "approve" | "signedOff" | "none";
  version?: number;
  signedOffLine?: string;
  draftPath?: string;
  blockedByComments: boolean; // target-scoped pending comments block Approve
}

/** The ONE visibility rule for every researcher action — review menus, plan
 * clusters, Results verdict/reopen alike. Gates are modal moments: actions
 * live on the normal board (review-before-gate, BK ruling). */
export function actionsVisible(data: BoardData): boolean {
  return data.mode === "live" && !data.gate;
}

export function planActionState(
  data: BoardData,
  component: string,
  pending: Annotation[],
): PlanActionState {
  const group = data.files.executionPlans.find(
    (g) => g.component === component,
  );
  if (!group) return { kind: "none", blockedByComments: false };
  if (preRenewalSlugs(data).has(component)) {
    return { kind: "none", blockedByComments: false };
  }
  const draft = group.draft;
  if (draft) {
    const blocked = pending.some(
      (a) => a.type === "plan-comment" && a.planPath === draft.path,
    );
    return {
      kind: "approve",
      version: draft.proposedVersion,
      draftPath: draft.path,
      blockedByComments: blocked,
    };
  }
  const latest = group.versions[group.versions.length - 1];
  if (latest) {
    // parseExecutionPlan returns its fail object (signedOff: null) for plans
    // without conventional sections — fall back to the sign-off line itself.
    const signed =
      parseExecutionPlan(latest.content).signedOff ??
      /^Signed off:\s*(.+)$/m.exec(latest.content)?.[1]?.trim() ??
      null;
    if (signed) {
      return {
        kind: "signedOff",
        version: latest.version,
        signedOffLine: signed,
        blockedByComments: false,
      };
    }
  }
  return { kind: "none", blockedByComments: false };
}
