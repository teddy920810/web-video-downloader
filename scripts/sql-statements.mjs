export function splitSqlStatements(source) {
  const statements = [];
  let current = '';
  let singleQuoted = false;
  let dollarQuoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (!singleQuoted && char === '$' && next === '$') {
      dollarQuoted = !dollarQuoted;
      current += '$$';
      index += 1;
      continue;
    }
    if (!dollarQuoted && char === "'") {
      if (singleQuoted && next === "'") {
        current += "''";
        index += 1;
        continue;
      }
      singleQuoted = !singleQuoted;
    }
    if (char === ';' && !singleQuoted && !dollarQuoted) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else current += char;
  }
  if (singleQuoted || dollarQuoted) throw new Error('Unterminated SQL quote in migration.');
  if (current.trim()) statements.push(current.trim());
  return statements;
}
