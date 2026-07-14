import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../ui/IconButton";
import { useCancelJob, useJobs } from "../../hooks/useJobs";
import type { Job } from "../../bindings/Job";

/**
 * The process monitor (ADR-PROJ-008): what is running, how far it has got, how long it still needs,
 * and a button that actually stops it.
 *
 * It shows **running** work only. A finished download is not news; a running one is the difference
 * between an app that is working and an app that has died.
 */
export function JobMonitor() {
  const { data: jobs = [] } = useJobs();
  const running = jobs.filter((j) => j.state === "running" || j.state === "queued");
  const failed = jobs.filter((j) => j.state === "failed");

  if (running.length === 0 && failed.length === 0) return null;

  return (
    <div className="border-line bg-surface flex shrink-0 flex-col gap-1 border-t px-3 py-1.5">
      {running.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
      {failed.map((job) => (
        <FailedRow key={job.id} job={job} />
      ))}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const { t } = useTranslation();
  const cancel = useCancelJob();

  // The counts cross the boundary as `bigint` — Rust's u64 does not fit in a JS number, and ts-rs is
  // right to say so. A model is not four exabytes, so converting here is safe; pretending the type
  // were a number would not be.
  const done = job.progress.kind === "determinate" ? Number(job.progress.done) : 0;
  const total = job.progress.kind === "determinate" ? Number(job.progress.total) : 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : null;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-fg min-w-0 flex-1 truncate">{job.label}</span>

      {/* Bytes, not a percentage: "412 MB of 1500 MB" is what a person can act on. */}
      {total > 0 ? (
        <span className="text-dim tabular shrink-0 font-mono">
          {mb(done)} / {mb(total)} MB
        </span>
      ) : null}

      <div className="bg-elevated h-1 w-32 shrink-0 overflow-hidden rounded-full">
        <div
          className={`bg-accent h-full ${percent === null ? "w-1/3 animate-pulse" : ""}`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>

      {/* An ETA only when it is honest (ADR-PROJ-008): no number beats an invented one. */}
      <span className="text-dim tabular w-16 shrink-0 text-right font-mono">
        {job.eta_seconds !== null ? eta(Number(job.eta_seconds)) : "—"}
      </span>

      {job.cancellable ? (
        <IconButton
          label={t("jobs.cancel")}
          tone="danger"
          onClick={() => cancel.mutate(Number(job.id))}
          className="h-6 w-6"
        >
          <X size={13} strokeWidth={2} />
        </IconButton>
      ) : null}
    </div>
  );
}

/** A failure stays on screen: the user asked for this, and it did not happen. */
function FailedRow({ job }: { job: Job }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-danger shrink-0">✕</span>
      <span className="text-fg shrink-0">{job.label}</span>
      <span className="text-dim min-w-0 flex-1 truncate">{job.error}</span>
    </div>
  );
}

const mb = (bytes: number) => Math.round(bytes / 1_000_000).toLocaleString();

/** Seconds → `2:05`. */
function eta(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
