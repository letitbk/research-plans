// Inline request-changes affordance (control surface, spec §3). BK's board
// rule: no native prompt dialogs — the reason field expands in place. The
// reason is required exactly when no target-scoped pending comments exist
// (otherwise those comments ARE the change request and the reason is extra).
import { useState } from "react";

export default function RequestChangesButton({
  requireReason,
  onSubmit,
}: {
  requireReason: boolean;
  onSubmit: (reason?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button
        className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-1.5 py-0.5 text-[11px] font-medium text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
        onClick={() => setOpen(true)}
      >
        Request changes
      </button>
    );
  }
  const ready = !requireReason || text.trim().length > 0;
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        className="w-44 rounded border border-red-300 dark:border-red-800 px-1.5 py-0.5 text-[11px]"
        placeholder={requireReason ? "Reason (required)" : "Reason (optional)"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) {
            onSubmit(text.trim() || undefined);
            setOpen(false);
            setText("");
          }
          if (e.key === "Escape") {
            setOpen(false);
            setText("");
          }
        }}
      />
      <button
        className="rounded bg-red-700 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-40"
        disabled={!ready}
        onClick={() => {
          onSubmit(text.trim() || undefined);
          setOpen(false);
          setText("");
        }}
      >
        Send
      </button>
      <button
        className="rounded px-1 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        onClick={() => {
          setOpen(false);
          setText("");
        }}
      >
        ✕
      </button>
    </span>
  );
}
