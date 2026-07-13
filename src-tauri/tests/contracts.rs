//! Cross-module IPC contract tests (rule:testing / rule:verification). These pin the DTO JSON keys
//! and error strings the frontend matches on, so a rename on the Rust side cannot silently break the
//! TypeScript boundary — the test fails first.

use huginn_lib::dto::SettingsDto;
use huginn_lib::error::AppError;

#[test]
fn settings_dto_json_keys_are_stable() {
    let json = serde_json::to_value(SettingsDto::default()).expect("serialize");
    assert!(
        json.get("ui_scale").is_some(),
        "ui_scale key is part of the frontend contract"
    );
    assert!(
        json.get("minimize_to_tray").is_some(),
        "minimize_to_tray key is part of the frontend contract"
    );
}

#[test]
fn app_error_display_is_verbatim_for_other() {
    // The frontend surfaces the error's Display string; `Other` must render its message verbatim.
    assert_eq!(AppError::Other("boom".into()).to_string(), "boom");
}
