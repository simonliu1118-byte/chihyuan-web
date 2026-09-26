export type EditableRowKey = string;
export type EditableRowErrors = Readonly<Record<string, string>>;

export interface EditableListRow<T> {
  key: EditableRowKey;
  value: T;
  errors: EditableRowErrors;
}

export interface EditableListState<T> {
  rows: readonly EditableListRow<T>[];
  baselineRows: readonly EditableListRow<T>[];
  dirty: boolean;
}

export type EditableListAction<T> =
  | { type: "load"; rows: readonly EditableListRow<T>[] }
  | { type: "add"; row: EditableListRow<T>; index?: number }
  | { type: "update"; key: EditableRowKey; value: T }
  | { type: "remove"; key: EditableRowKey }
  | { type: "move"; key: EditableRowKey; toIndex: number }
  | { type: "set-errors"; key: EditableRowKey; errors: EditableRowErrors }
  | { type: "clear-errors" }
  | { type: "reset" }
  | { type: "commit" };

function stripErrors<T>(rows: readonly EditableListRow<T>[]): readonly EditableListRow<T>[] {
  return rows.map((row) => ({ ...row, errors: {} }));
}

function assertUniqueRowKeys<T>(rows: readonly EditableListRow<T>[]) {
  const keys = new Set<EditableRowKey>();
  for (const row of rows) {
    if (keys.has(row.key)) {
      throw new Error(`Duplicate editable-list row key: ${row.key}`);
    }
    keys.add(row.key);
  }
}

export function createEditableListRow<T>(key: EditableRowKey, value: T): EditableListRow<T> {
  if (!key) throw new Error("Editable-list row key is required");
  return { key, value, errors: {} };
}

export function createEditableListState<T>(
  rows: readonly EditableListRow<T>[] = [],
): EditableListState<T> {
  assertUniqueRowKeys(rows);
  const cleanRows = stripErrors(rows);
  return {
    rows: cleanRows,
    baselineRows: cleanRows,
    dirty: false,
  };
}

export function editableListReducer<T>(
  state: EditableListState<T>,
  action: EditableListAction<T>,
): EditableListState<T> {
  switch (action.type) {
    case "load": {
      return createEditableListState(action.rows);
    }

    case "add": {
      if (state.rows.some((row) => row.key === action.row.key)) {
        throw new Error(`Duplicate editable-list row key: ${action.row.key}`);
      }
      const nextRows = [...state.rows];
      const index = action.index == null
        ? nextRows.length
        : Math.max(0, Math.min(action.index, nextRows.length));
      nextRows.splice(index, 0, { ...action.row, errors: {} });
      return { ...state, rows: nextRows, dirty: true };
    }

    case "update": {
      let changed = false;
      const nextRows = state.rows.map((row) => {
        if (row.key !== action.key) return row;
        changed = true;
        return { ...row, value: action.value };
      });
      return changed ? { ...state, rows: nextRows, dirty: true } : state;
    }

    case "remove": {
      const nextRows = state.rows.filter((row) => row.key !== action.key);
      return nextRows.length === state.rows.length
        ? state
        : { ...state, rows: nextRows, dirty: true };
    }

    case "move": {
      const fromIndex = state.rows.findIndex((row) => row.key === action.key);
      if (fromIndex < 0 || state.rows.length < 2) return state;
      const toIndex = Math.max(0, Math.min(action.toIndex, state.rows.length - 1));
      if (fromIndex === toIndex) return state;
      const nextRows = [...state.rows];
      const [row] = nextRows.splice(fromIndex, 1);
      nextRows.splice(toIndex, 0, row);
      return { ...state, rows: nextRows, dirty: true };
    }

    case "set-errors": {
      let changed = false;
      const nextRows = state.rows.map((row) => {
        if (row.key !== action.key) return row;
        changed = true;
        return { ...row, errors: action.errors };
      });
      return changed ? { ...state, rows: nextRows } : state;
    }

    case "clear-errors": {
      return { ...state, rows: stripErrors(state.rows) };
    }

    case "reset": {
      return {
        rows: stripErrors(state.baselineRows),
        baselineRows: stripErrors(state.baselineRows),
        dirty: false,
      };
    }

    case "commit": {
      const cleanRows = stripErrors(state.rows);
      return {
        rows: cleanRows,
        baselineRows: cleanRows,
        dirty: false,
      };
    }
  }
}

export function hasEditableListErrors<T>(state: EditableListState<T>): boolean {
  return state.rows.some((row) => Object.keys(row.errors).length > 0);
}

export function serializeEditableList<T>(state: EditableListState<T>): readonly T[] {
  return state.rows.map((row) => row.value);
}
