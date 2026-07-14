import { describe, it, expect } from "vitest";
import { jobsRefetchInterval } from "./useJobs";
import type { Job } from "../bindings/Job";
import type { JobState } from "../bindings/JobState";

const job = (state: JobState) => ({ state }) as Job;

describe("jobsRefetchInterval", () => {
  it("polls while a job is running or queued", () => {
    expect(jobsRefetchInterval([job("running")], 0)).toBe(500);
    expect(jobsRefetchInterval([job("queued")], 0)).toBe(500);
  });

  it("polls while a model operation is in flight, even before any job exists", () => {
    // The bug this fixes: a fresh download has registered no job yet, so a running-only check never
    // started polling, and the monitor row (and its progress bar) never appeared.
    expect(jobsRefetchInterval([], 1)).toBe(500);
  });

  it("stops when nothing is running and no operation is in flight", () => {
    expect(jobsRefetchInterval([], 0)).toBe(false);
    // A finished download is not news; the monitor only watches live work.
    expect(jobsRefetchInterval([job("succeeded")], 0)).toBe(false);
    expect(jobsRefetchInterval([job("failed")], 0)).toBe(false);
  });
});
