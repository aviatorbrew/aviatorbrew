import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import ts from "typescript";

// Observe the real file stream so cancellation also verifies descriptor cleanup.
const originalCreateReadStream = fs.createReadStream;
let lastStream;
fs.createReadStream = (...args) => (lastStream = originalCreateReadStream(...args));
syncBuiltinESMExports();
const sourceCode = await readFile(new URL("../src/lib/server-file-response.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(sourceCode, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { streamFileResponse, streamFirstExistingFile } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const directory = await mkdtemp(join(tmpdir(), "aviator-file-response-"));
const file = join(directory, "menu.pdf");
const empty = join(directory, "empty.pdf");
const bytes = Buffer.alloc(2 * 1024 * 1024);
for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
const request = (range) => new Request("http://localhost/menu.pdf", { headers: range ? { Range: range } : {} });
const options = { contentType: "application/pdf" };

try {
  await writeFile(file, bytes);
  await writeFile(empty, "");
  const full = await streamFileResponse(request(), file, options);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("Content-Length"), String(bytes.length));
  assert.equal(full.headers.get("Content-Type"), "application/pdf");
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);

  for (const [range, start, end] of [["bytes=100-199", 100, 199], ["bytes=-37", bytes.length - 37, bytes.length - 1], [`bytes=${bytes.length - 30}-`, bytes.length - 30, bytes.length - 1]]) {
    const response = await streamFileResponse(request(range), file, options);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Range"), `bytes ${start}-${end}/${bytes.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
  }
  for (const range of ["bytes=9999999-", "bytes=30-10", "bytes=0-1,3-4", "bytes=-0"]) {
    const response = await streamFileResponse(request(range), file, options);
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("Content-Range"), `bytes */${bytes.length}`);
  }
  const emptyResponse = await streamFileResponse(request(), empty, options);
  assert.equal((await emptyResponse.arrayBuffer()).byteLength, 0);
  assert.equal((await streamFileResponse(request("bytes=-5"), empty, options)).status, 416);
  const fallback = await streamFirstExistingFile(request(), [join(directory, "missing"), file], options);
  assert.deepEqual(Buffer.from(await fallback.arrayBuffer()), bytes);
  assert.equal(await streamFirstExistingFile(request(), [join(directory, "missing")], options), null);

  // A scheduled late data event after cancel reproduced ERR_INVALID_STATE with toWeb.
  const canceled = await streamFileResponse(request(), file, options);
  const reader = canceled.body.getReader();
  await reader.read();
  const source = lastStream;
  await reader.cancel("client disconnected");
  assert.equal(source.destroyed, true);
  assert.doesNotThrow(() => source.emit("data", Buffer.from("late chunk")));

  for (let iteration = 0; iteration < 100; iteration++) {
    const response = await streamFileResponse(request(), file, options);
    const source = lastStream;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), iteration % 5);
    try {
      await response.body.pipeTo(new WritableStream({ async write() { await delay(1); } }), { signal: controller.signal });
      assert.fail("Expected interrupted download");
    } catch (error) {
      assert.equal(error.name, "AbortError");
    } finally {
      clearTimeout(timer);
    }
    assert.equal(source.destroyed, true);
  }
  console.log("File responses passed: complete files, byte ranges, missing files, cancellation, and 100 interrupted downloads.");
} finally {
  fs.createReadStream = originalCreateReadStream;
  syncBuiltinESMExports();
  await rm(directory, { recursive: true, force: true });
}
