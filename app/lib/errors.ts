import { Either } from "purify-ts/Either";
import type { JsonValue } from "type-fest";

export class AppError extends Error {
  name = "AppError";
}

export class ConvertError extends AppError {
  name = "ConvertError";
}

export class GeometryError extends AppError {
  name = "GeometryError";
}

export function parseOrError<T = JsonValue>(str: string) {
  return Either.encase(() => {
    return JSON.parse(str) as T;
  });
}
