import { STATUS_LABEL, type CollectionStatus } from "@/lib/dashboard";

// Colour plus a text label, never colour alone.
export function StatusPill({ status }: { status: CollectionStatus }) {
  return <span className={`pill ${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}

export function SamplePill() {
  return (
    <span className="pill sample" title="Made-up data for the preview">
      Sample
    </span>
  );
}
