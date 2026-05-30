pub mod changeset;
pub mod commit;
pub mod parser;
pub mod persistence;
pub mod prompt;
pub mod similarity;
pub mod trigger;

pub use changeset::{build_changeset, ChangesetItemType, PendingChangeset, PendingChangesetItem};
pub use commit::commit_changeset_transaction;
pub use parser::{
    parse_candidates_from_llm_output, parse_candidates_json, CandidateAction, CandidateNode,
};
pub use persistence::{
    count_pending_items, list_changeset_items, list_pending_changesets, list_resolved_changesets,
    persist_changeset,
};
pub use prompt::MEMORY_EXTRACTION_SYSTEM_PROMPT;
pub use similarity::{
    classify_similarity, compute_text_similarity, jaccard_similarity, tokenize, SimilarityClass,
    SIMILARITY_DUPLICATE, SIMILARITY_FLAG,
};
pub use trigger::{mark_extraction_complete, should_extract};
