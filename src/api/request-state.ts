import { ApiClientError } from "./client";

export type RequestStatus = "idle" | "loading" | "success" | "error";

export interface RequestState<T> {
  status: RequestStatus;
  data: T | null;
  error: ApiClientError | null;
}

export type RequestAction<T> =
  | { type: "reset" }
  | { type: "start" }
  | { type: "success"; data: T }
  | { type: "error"; error: ApiClientError };

export function createRequestState<T>(data: T | null = null): RequestState<T> {
  return {
    status: data == null ? "idle" : "success",
    data,
    error: null,
  };
}

export function requestStateReducer<T>(
  state: RequestState<T>,
  action: RequestAction<T>,
): RequestState<T> {
  switch (action.type) {
    case "reset":
      return createRequestState<T>();
    case "start":
      return {
        status: "loading",
        data: state.data,
        error: null,
      };
    case "success":
      return {
        status: "success",
        data: action.data,
        error: null,
      };
    case "error":
      return {
        status: "error",
        data: state.data,
        error: action.error,
      };
  }
}
