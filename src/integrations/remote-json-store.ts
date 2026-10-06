import { get, put } from "@vercel/blob";

const access = "private" as const;

function hasBlobConfig() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function streamToText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function canUseRemoteJsonStore() {
  return hasBlobConfig();
}

export async function readRemoteJson<T>(pathname: string): Promise<T | undefined> {
  if (!hasBlobConfig()) return undefined;

  const result = await get(pathname, { access });
  if (!result || result.statusCode !== 200 || !result.stream) return undefined;

  return JSON.parse(await streamToText(result.stream)) as T;
}

export async function writeRemoteJson(pathname: string, data: unknown) {
  if (!hasBlobConfig()) {
    throw new Error("Vercel Blob nao esta configurado. Conecte um Blob Store ao projeto na Vercel.");
  }

  return put(pathname, JSON.stringify(data, null, 2), {
    access,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}
