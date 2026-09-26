export interface ApiErrorDetail {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorDetail;
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface HealthData {
  service: "cyweb";
  database: "ok";
  time: string;
}
