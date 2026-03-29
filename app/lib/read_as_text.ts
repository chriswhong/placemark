import { EitherAsync } from "purify-ts/EitherAsync";
import type { AppError } from "./errors";

export default function readAsText(
  file: ArrayBuffer,
): EitherAsync<AppError, string> {
  return EitherAsync(function readAsTextInner() {
    return Promise.resolve(new TextDecoder().decode(file));
  });
}
