import type { Status } from "@/lib/schema";
import { STATUS_LABEL } from "@/lib/status";

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  return (
    <span className={`chip chip--${status}`}>
      <span className="chip__dot" aria-hidden />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
