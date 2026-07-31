import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

type StreamFileOptions = {
  cacheControl?: string;
  contentType: string;
};

type ByteRange = { start: number; end: number };

function requestedRange(value: string | null, size: number): ByteRange | "invalid" | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return "invalid";
  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return "invalid";

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength < 1) return "invalid";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return "invalid";
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export function requestBodyExceeds(request: Request, maxBytes: number) {
  const value = request.headers.get("content-length");
  if (!value) return false;
  const length = Number(value);
  return Number.isFinite(length) && length > maxBytes;
}

export async function streamFileResponse(request: Request, filePath: string, options: StreamFileOptions): Promise<Response> {
  const file = await stat(filePath);
  if (!file.isFile()) {
    const error = new Error("File not found.") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }

  const range = requestedRange(request.headers.get("range"), file.size);
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": options.cacheControl || "public, max-age=31536000, immutable",
    "Content-Type": options.contentType,
    "Last-Modified": file.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };

  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...commonHeaders, "Content-Range": `bytes */${file.size}` },
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, file.size - 1);
  const length = file.size === 0 ? 0 : end - start + 1;
  const nodeStream = createReadStream(filePath, file.size === 0 ? undefined : { start, end });
  const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...commonHeaders,
      "Content-Length": String(length),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${file.size}` } : {}),
    },
  });
}

export async function streamFirstExistingFile(
  request: Request,
  filePaths: string[],
  options: StreamFileOptions,
): Promise<Response | null> {
  for (const filePath of filePaths) {
    try {
      return await streamFileResponse(request, filePath, options);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}
