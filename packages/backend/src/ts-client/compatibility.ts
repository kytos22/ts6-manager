// null means that the version cannot be classified safely.
export function keepFilesCompatibility(version: string): boolean | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([^\s]+))?(?:\s|$)/i.exec(version.trim());
  if (!match) return null;
  const major = Number(match[1]);
  if (major < 6) return null;
  if (major > 6 || Number(match[2]) > 0 || Number(match[3]) > 0) return true;
  const pre = match[4];
  if (!pre) return true;
  const beta = /^beta(\d+)(?:\.\d+)*$/i.exec(pre);
  if (beta) return Number(beta[1]) >= 13;
  if (/^rc\d+(?:\.\d+)*$/i.test(pre)) return true;
  return null;
}
