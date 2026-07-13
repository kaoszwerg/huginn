use std::process::Command;

fn main() {
    embed_build_metadata();
    tauri_build::build()
}

/// Embed git commit + build date as compile-time env vars so every build is traceable to a commit
/// (ADR-CORE-024), even between releases when the SemVer version is unchanged. Falls back to "unknown"
/// when git is unavailable (e.g. a source tarball without `.git`).
fn embed_build_metadata() {
    // Rebuild when the checked-out commit or the index (staged changes) changes.
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-changed=../.git/index");

    let sha = git(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "unknown".into());
    let dirty = git(&["status", "--porcelain"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let build_date =
        git(&["show", "-s", "--format=%cI", "HEAD"]).unwrap_or_else(|| "unknown".into());

    println!("cargo:rustc-env=GIT_SHA={sha}");
    println!("cargo:rustc-env=GIT_DIRTY={dirty}");
    println!("cargo:rustc-env=BUILD_COMMIT_DATE={build_date}");
}

fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}
