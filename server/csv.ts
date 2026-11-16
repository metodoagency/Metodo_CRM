export function csvCell(value: string) {
  return '"' + value.replace(/^\s*[=+@\-\t\r]/u, "'$&").replaceAll('"', '""') + '"';
}
