import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Key,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useDebouncedValue } from "../foundation/useDebouncedValue";
import { FieldFrame } from "../primitives/FieldFrame";

export type EntityPickerSearchStatus = "idle" | "loading" | "ready" | "error";

export interface EntityPickerProps<T> {
  label: ReactNode;
  value: T | null;
  onSelect: (value: T | null) => void;
  search: (query: string, signal: AbortSignal) => Promise<readonly T[]>;
  getKey: (item: T) => Key;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => ReactNode;
  onSearchError?: (error: unknown) => void;
  placeholder?: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  minQueryLength?: number;
  debounceMs?: number;
  noResultsText?: string;
  searchErrorText?: string;
  className?: string;
}

export function EntityPicker<T>({
  label,
  value,
  onSelect,
  search,
  getKey,
  getLabel,
  getDescription,
  onSearchError,
  placeholder = "輸入關鍵字搜尋…",
  description,
  error,
  required = false,
  disabled = false,
  clearable = true,
  minQueryLength = 1,
  debounceMs = 250,
  noResultsText = "找不到符合的資料",
  searchErrorText = "搜尋失敗，請稍後再試",
  className = "",
}: EntityPickerProps<T>) {
  const generatedId = useId();
  const inputId = `cy-entity-picker-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef(search);
  const searchErrorRef = useRef(onSearchError);
  const selectedLabel = value !== null ? getLabel(value) : "";

  const [inputValue, setInputValue] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<readonly T[]>([]);
  const [status, setStatus] = useState<EntityPickerSearchStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebouncedValue(inputValue.trim(), debounceMs);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    searchErrorRef.current = onSearchError;
  }, [onSearchError]);

  useEffect(() => {
    setInputValue(selectedLabel);
  }, [value, selectedLabel]);

  useEffect(() => {
    if (!open || disabled) return;

    if (debouncedQuery.length < minQueryLength) {
      setResults([]);
      setStatus("idle");
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setResults([]);
    setActiveIndex(-1);

    void searchRef.current(debouncedQuery, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setResults(items);
        setStatus("ready");
        setActiveIndex(items.length > 0 ? 0 : -1);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        searchErrorRef.current?.(cause);
        setResults([]);
        setStatus("error");
        setActiveIndex(-1);
      });

    return () => controller.abort();
  }, [debouncedQuery, disabled, minQueryLength, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setActiveIndex(-1);
      setInputValue(selectedLabel);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, selectedLabel]);

  const activeOptionId = useMemo(
    () => (activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined),
    [activeIndex, listboxId],
  );

  function selectItem(item: T) {
    onSelect(item);
    setInputValue(getLabel(item));
    setOpen(false);
    setActiveIndex(-1);
    setResults([]);
    setStatus("idle");
    inputRef.current?.focus();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setInputValue(event.target.value);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (results.length > 0) {
        setActiveIndex((current) => Math.min(results.length - 1, Math.max(0, current + 1)));
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length > 0) {
        setActiveIndex((current) => Math.max(0, current <= 0 ? results.length - 1 : current - 1));
      }
      return;
    }

    if (event.key === "Enter" && open && activeIndex >= 0 && activeIndex < results.length) {
      event.preventDefault();
      selectItem(results[activeIndex]);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      setInputValue(selectedLabel);
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      setActiveIndex(-1);
      setInputValue(selectedLabel);
    }
  }

  function handleClear() {
    onSelect(null);
    setInputValue("");
    setResults([]);
    setStatus("idle");
    setActiveIndex(-1);
    setOpen(false);
    inputRef.current?.focus();
  }

  const describedBy = error
    ? `${inputId}-error`
    : description
      ? `${inputId}-description`
      : undefined;

  return (
    <FieldFrame
      label={label}
      htmlFor={inputId}
      description={description}
      error={error}
      required={required}
      className={className}
    >
      <div className="cy-entity-picker" ref={rootRef}>
        <div className="cy-entity-picker-control">
          <input
            ref={inputRef}
            id={inputId}
            className="cy-input cy-entity-picker-input"
            type="text"
            value={inputValue}
            onChange={handleChange}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={open ? activeOptionId : undefined}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            aria-busy={status === "loading" || undefined}
          />
          {clearable && value !== null && !disabled ? (
            <button className="cy-entity-picker-clear" type="button" onClick={handleClear} aria-label="清除選取">
              ×
            </button>
          ) : null}
        </div>

        {open && !disabled ? (
          <div className="cy-entity-picker-popover">
            <div className="cy-entity-picker-list" id={listboxId} role="listbox">
              {debouncedQuery.length < minQueryLength ? (
                <div className="cy-entity-picker-message">
                  {minQueryLength <= 1 ? "請輸入關鍵字" : `請至少輸入 ${minQueryLength} 個字元`}
                </div>
              ) : null}

              {debouncedQuery.length >= minQueryLength && status === "loading" ? (
                <div className="cy-entity-picker-message" role="status">
                  搜尋中…
                </div>
              ) : null}

              {status === "error" ? (
                <div className="cy-entity-picker-message is-error" role="alert">
                  {searchErrorText}
                </div>
              ) : null}

              {status === "ready" && results.length === 0 ? (
                <div className="cy-entity-picker-message">{noResultsText}</div>
              ) : null}

              {status === "ready"
                ? results.map((item, index) => {
                    const itemKey = getKey(item);
                    const active = index === activeIndex;
                    const selected = value !== null ? getKey(value) === itemKey : false;
                    return (
                      <div
                        key={itemKey}
                        id={`${listboxId}-option-${index}`}
                        className="cy-entity-picker-option"
                        role="option"
                        aria-selected={selected}
                        data-active={active || undefined}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => selectItem(item)}
                      >
                        <div className="cy-entity-picker-option-label">{getLabel(item)}</div>
                        {getDescription ? (
                          <div className="cy-entity-picker-option-description">{getDescription(item)}</div>
                        ) : null}
                      </div>
                    );
                  })
                : null}
            </div>
          </div>
        ) : null}
      </div>
    </FieldFrame>
  );
}
