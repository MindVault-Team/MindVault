pub mod bundled;
pub mod chunking;
pub mod engine;
pub mod registry;
pub mod storage;

pub use bundled::{model_artifact_paths, sanitize_model_id, BundledEmbedEngine};
pub use chunking::{chunk_node_text, ChunkSpec};
pub use engine::{EmbedEngine, EmbedError};
pub use registry::{load_registry, OllamaDefaultConfig, Registry, TierConfig};
pub use storage::EmbeddingRow;
