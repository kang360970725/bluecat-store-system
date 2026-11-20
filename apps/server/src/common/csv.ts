export function csvRow(values: Array<string | number | null>) {
  return values
    .map((value) => {
      const text = String(value ?? '');
      const safe = /^[\s\u0000-\u001f]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(text)
        ? "'" + text
        : text;
      return '"' + safe.replace(/"/g, '""') + '"';
    })
    .join(',');
}

export function chinaCsvTime(time: Date | null) {
  if (!time) return '';
  return new Date(time.getTime() + 28_800_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}
