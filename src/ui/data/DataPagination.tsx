import { Button } from "../primitives/Button";

export interface DataPaginationProps {
  label?: string;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function DataPagination({
  label,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
}: DataPaginationProps) {
  return (
    <div className="cy-data-pagination" aria-label="資料分頁">
      <Button type="button" variant="secondary" size="small" disabled={!canPrevious} onClick={onPrevious}>
        上一頁
      </Button>
      {label ? <span className="cy-data-pagination-label">{label}</span> : null}
      <Button type="button" variant="secondary" size="small" disabled={!canNext} onClick={onNext}>
        下一頁
      </Button>
    </div>
  );
}
