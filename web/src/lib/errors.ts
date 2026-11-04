import { ApiError } from "@/api/client"

/** The form's list of problems ("Amount must be greater than 0"), if any. */
export function validationErrors(error: unknown): string[] {
  return error instanceof ApiError ? error.validation : []
}
