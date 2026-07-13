// Helpers for interpreting errors thrown by Tauri command invocations. Tauri serialises the Rust
// `AppError` to its Display string (see src-tauri/src/error.rs), so the value a rejected `invoke`
// promise carries is that string — these helpers read it back out.

/** Best-effort message extraction. Command rejections are strings, but guard for `Error`/`{message}`
 * shapes too so callers never have to care what was thrown. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
