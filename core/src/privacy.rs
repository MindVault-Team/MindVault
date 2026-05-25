#![allow(dead_code)]

const OPEN: &str = "open";
const LOCAL_ONLY: &str = "local_only";
const LOCKED: &str = "locked";
const REDACTED: &str = "redacted";

fn normalize_tier(tier: Option<&str>) -> &'static str {
    match tier {
        Some(LOCAL_ONLY) => LOCAL_ONLY,
        Some(LOCKED) => LOCKED,
        Some(REDACTED) => REDACTED,
        _ => OPEN,
    }
}

pub fn get_privacy_rank(tier: Option<&str>) -> u8 {
    match normalize_tier(tier) {
        OPEN => 0,
        LOCAL_ONLY => 1,
        LOCKED => 2,
        REDACTED => 3,
        _ => 0,
    }
}

pub fn get_effective_privacy(
    node_tier: Option<&str>,
    sub_vault_tier: Option<&str>,
    vault_tier: Option<&str>,
) -> &'static str {
    let tiers = [
        normalize_tier(node_tier),
        normalize_tier(sub_vault_tier),
        normalize_tier(vault_tier),
    ];

    let mut strictest = OPEN;
    for tier in tiers {
        if get_privacy_rank(Some(tier)) > get_privacy_rank(Some(strictest)) {
            strictest = tier;
        }
    }
    strictest
}

#[allow(dead_code)]
pub fn generate_pointer_stub(node_title: &str, node_id: &str) -> String {
    format!(
        "[LOCKED NODE STUB] Title: {} (ID: {}) - Content withheld due to privacy constraints.",
        node_title, node_id
    )
}

#[cfg(test)]
mod tests {
    use super::{get_effective_privacy, get_privacy_rank};

    #[test]
    fn privacy_waterfall_parent_locked_beats_node_open() {
        let effective = get_effective_privacy(Some("open"), Some("locked"), None);
        assert_eq!(effective, "locked");
    }

    #[test]
    fn privacy_waterfall_node_redacted_beats_parent_open() {
        let effective = get_effective_privacy(Some("redacted"), Some("open"), None);
        assert_eq!(effective, "redacted");
    }

    #[test]
    fn privacy_waterfall_same_tier_stays_same() {
        let effective = get_effective_privacy(Some("local_only"), Some("local_only"), None);
        assert_eq!(effective, "local_only");
    }

    #[test]
    fn privacy_waterfall_redacted_beats_locked_across_hierarchy() {
        let effective = get_effective_privacy(Some("open"), Some("locked"), Some("redacted"));
        assert_eq!(effective, "redacted");
    }

    #[test]
    fn privacy_rank_unknown_tiers_fall_back_to_open() {
        assert_eq!(get_privacy_rank(Some("unknown")), 0);
        let effective = get_effective_privacy(Some("mystery"), Some("still-unknown"), None);
        assert_eq!(effective, "open");
    }
}
