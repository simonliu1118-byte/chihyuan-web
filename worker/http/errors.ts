import { FieldValidationError } from "../validation/fields";
import { RequestInputError } from "./request";
import { failure } from "./response";

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof RequestInputError) {
    return failure(
      { code: error.code, message: error.message },
      requestId,
      error.status,
    );
  }

  if (error instanceof FieldValidationError) {
    return failure(
      {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        fields: error.fields,
      },
      requestId,
      422,
    );
  }

  return failure(
    { code: "INTERNAL_ERROR", message: "Unexpected internal error" },
    requestId,
    500,
  );
}
