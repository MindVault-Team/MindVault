//TEMP to be replaced with ..types/generated
type EmbeddingStatus = {
  activeModel: string;
  tier: string;
  backend: string;
  coveragePercent: number;
  lastComputedAt: string | null;
  jaccardFallbackActive: boolean;
  reembedInProgress: boolean;
};
///END TEMP to be replaced with ..types/generated

type EmbeddingSettingsProps = {
  status: EmbeddingStatus | null; 
  loading: boolean;
  onReembed: () => void;
  onCancelReembed: () => void;
};

export default function EmbeddingSettings({
  status,
  loading,
  onReembed,
  onCancelReembed,
}: EmbeddingSettingsProps) {
  if (loading) {
    return <div>Loading embedding status...</div>;
  }

  if (!status) {
    return <div>No embedding status available.</div>;
  }

  return (
    <div className="embedding-settings-panel">
      <h1 className ="embedding-settings-title">Embedding Settings</h1>

      <p className="embedding-settings-item">Active Model: {status.activeModel}</p>
      <p className="embedding-settings-item">Tier: {status.tier}</p>
      <p className="embedding-settings-item">Backend: {status.backend}</p>
      <p className="embedding-settings-item">Coverage: {status.coveragePercent}%</p>

      <button className="embedding-settings-button" onClick={onReembed}>
        Start Re-embed
      </button>

      <button className="embedding-settings-button" onClick={onCancelReembed}>
        Cancel Re-embed
      </button>
    </div>
  );
}