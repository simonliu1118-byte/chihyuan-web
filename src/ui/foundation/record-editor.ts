export type RecordEditorMode = "empty" | "view" | "create" | "edit";

export interface RecordEditorState<T> {
  mode: RecordEditorMode;
  value: T | null;
  baseline: T | null;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
}

export type RecordEditorAction<T> =
  | { type: "reset" }
  | { type: "load"; value: T }
  | { type: "start-create"; value: T }
  | { type: "start-edit" }
  | { type: "change"; value: T }
  | { type: "save-start" }
  | { type: "save-success"; value: T }
  | { type: "save-failure" }
  | { type: "conflict" }
  | { type: "cancel" };

export function createEmptyRecordEditorState<T>(): RecordEditorState<T> {
  return {
    mode: "empty",
    value: null,
    baseline: null,
    dirty: false,
    saving: false,
    conflict: false,
  };
}

export function recordEditorReducer<T>(
  state: RecordEditorState<T>,
  action: RecordEditorAction<T>,
): RecordEditorState<T> {
  switch (action.type) {
    case "reset":
      return createEmptyRecordEditorState<T>();

    case "load":
      return {
        mode: "view",
        value: action.value,
        baseline: action.value,
        dirty: false,
        saving: false,
        conflict: false,
      };

    case "start-create":
      return {
        mode: "create",
        value: action.value,
        baseline: null,
        dirty: false,
        saving: false,
        conflict: false,
      };

    case "start-edit":
      if (state.mode !== "view" || state.value == null) return state;
      return {
        ...state,
        mode: "edit",
        baseline: state.value,
        dirty: false,
        saving: false,
        conflict: false,
      };

    case "change":
      if (state.mode !== "create" && state.mode !== "edit") return state;
      return {
        ...state,
        value: action.value,
        dirty: true,
        conflict: false,
      };

    case "save-start":
      if ((state.mode !== "create" && state.mode !== "edit") || state.value == null) return state;
      return {
        ...state,
        saving: true,
        conflict: false,
      };

    case "save-success":
      return {
        mode: "view",
        value: action.value,
        baseline: action.value,
        dirty: false,
        saving: false,
        conflict: false,
      };

    case "save-failure":
      return {
        ...state,
        saving: false,
      };

    case "conflict":
      if (state.mode !== "edit") return state;
      return {
        ...state,
        saving: false,
        conflict: true,
        dirty: true,
      };

    case "cancel":
      if (state.saving) return state;
      if (state.mode === "create") return createEmptyRecordEditorState<T>();
      if (state.mode === "edit") {
        if (state.baseline == null) return createEmptyRecordEditorState<T>();
        return {
          mode: "view",
          value: state.baseline,
          baseline: state.baseline,
          dirty: false,
          saving: false,
          conflict: false,
        };
      }
      return state;
  }
}

export function hasUnsavedRecordChanges<T>(state: RecordEditorState<T>): boolean {
  return state.dirty || state.saving;
}

export function isRecordEditorEditable<T>(state: RecordEditorState<T>): boolean {
  return state.mode === "create" || state.mode === "edit";
}
