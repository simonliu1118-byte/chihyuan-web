export class FieldValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Request validation failed");
    this.name = "FieldValidationError";
    this.fields = fields;
  }
}

export interface TextFieldOptions {
  minLength?: number;
  maxLength?: number;
  trim?: boolean;
}

export class ValidationBag {
  private readonly errors: Record<string, string> = {};

  constructor(private readonly input: Record<string, unknown>) {}

  requiredText(field: string, options: TextFieldOptions = {}): string | null {
    const raw = this.input[field];
    if (typeof raw !== "string") {
      this.add(field, "必填");
      return null;
    }

    const trim = options.trim ?? true;
    const value = trim ? raw.trim() : raw;
    const minLength = options.minLength ?? 1;

    if (value.length < minLength) {
      this.add(field, "必填");
      return null;
    }
    if (options.maxLength != null && value.length > options.maxLength) {
      this.add(field, `不可超過 ${options.maxLength} 個字元`);
      return null;
    }

    return value;
  }

  optionalText(field: string, options: TextFieldOptions = {}): string | null {
    const raw = this.input[field];
    if (raw == null || raw === "") return null;
    if (typeof raw !== "string") {
      this.add(field, "格式錯誤");
      return null;
    }

    const trim = options.trim ?? true;
    const value = trim ? raw.trim() : raw;
    if (value.length === 0) return null;
    if (options.minLength != null && value.length < options.minLength) {
      this.add(field, `至少 ${options.minLength} 個字元`);
      return null;
    }
    if (options.maxLength != null && value.length > options.maxLength) {
      this.add(field, `不可超過 ${options.maxLength} 個字元`);
      return null;
    }

    return value;
  }

  requiredPositiveInteger(field: string): number | null {
    const raw = this.input[field];
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
      this.add(field, "必須是正整數");
      return null;
    }
    return raw;
  }

  optionalPositiveInteger(field: string): number | null {
    const raw = this.input[field];
    if (raw == null || raw === "") return null;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
      this.add(field, "必須是正整數");
      return null;
    }
    return raw;
  }

  requiredBoolean(field: string): boolean | null {
    const raw = this.input[field];
    if (typeof raw !== "boolean") {
      this.add(field, "必須是布林值");
      return null;
    }
    return raw;
  }

  requiredIsoDate(field: string): string | null {
    const value = this.requiredText(field, { maxLength: 10 });
    if (value == null) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.add(field, "日期格式必須為 YYYY-MM-DD");
      return null;
    }

    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      this.add(field, "日期無效");
      return null;
    }

    return value;
  }

  add(field: string, message: string): void {
    if (!(field in this.errors)) this.errors[field] = message;
  }

  hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  fields(): Record<string, string> {
    return { ...this.errors };
  }

  throwIfInvalid(): void {
    if (this.hasErrors()) throw new FieldValidationError(this.fields());
  }
}
