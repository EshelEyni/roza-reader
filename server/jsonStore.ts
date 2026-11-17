import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';

export function createJsonStore<T>(file: string, defaultValue: T) {
  // Writes run one at a time, so two saves never race on the same temp file.
  let writeQueue: Promise<void> = Promise.resolve();

  const writeNow = async (value: T) => {
    const tempFile = `${file}.tmp`;
    await writeFile(tempFile, `${JSON.stringify(value, null, 2)}\n`);
    await rename(tempFile, file);
  };

  const write = (value: T) => {
    const result = writeQueue.then(() => writeNow(value));
    writeQueue = result.catch(() => {});
    return result;
  };

  const read = async (): Promise<T> => {
    if (!existsSync(file)) return defaultValue;
    return JSON.parse(await readFile(file, 'utf8'));
  };

  return { read, write };
}
