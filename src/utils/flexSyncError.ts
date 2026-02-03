export type FlexSyncErrorPayload = {
  code?: string;
  error?: string;
  message?: string;
  lender_email?: string;
  lender_name?: string;
  [key: string]: unknown;
};

function tryParseJson(value: unknown): unknown | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function looksLikePayload(value: unknown): value is FlexSyncErrorPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" ||
    typeof v.message === "string" ||
    typeof v.error === "string" ||
    typeof v.lender_name === "string" ||
    typeof v.lender_email === "string"
  );
}

/**
 * Supabase function invocations can surface the JSON body in different places
 * (data, error.context, or embedded in error.message). This normalizes it.
 */
export function extractFlexSyncErrorPayload(input: {
  data?: unknown;
  error?: unknown;
}): FlexSyncErrorPayload | null {
  // 1) Sometimes the server JSON body is returned in `data` even on non-2xx
  const fromData = tryParseJson(input.data);
  if (looksLikePayload(fromData)) return fromData;

  const errAny = input.error as any;

  // 2) Sometimes it's in an error context body
  const contextBody =
    errAny?.context?.body ??
    errAny?.context?.responseBody ??
    errAny?.context?.response?.body;
  const fromContext = tryParseJson(contextBody);
  if (looksLikePayload(fromContext)) return fromContext;

  // 3) Sometimes it’s embedded in the message: "... , {\"code\":...}"
  const message = errAny?.message;
  if (typeof message === "string") {
    const jsonStart = message.indexOf("{");
    if (jsonStart >= 0) {
      const fromMessage = tryParseJson(message.slice(jsonStart));
      if (looksLikePayload(fromMessage)) return fromMessage;
    }
  }

  return null;
}
