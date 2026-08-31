import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from '../../../scripts/sql-statements.mjs';

describe('SQL migration splitter', () => {
  it('keeps semicolons inside PL/pgSQL dollar quotes', () => {
    expect(splitSqlStatements("CREATE TABLE example(id int); CREATE FUNCTION f() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;")).toHaveLength(2);
  });
  it('keeps semicolons inside string values', () => {
    expect(splitSqlStatements("SELECT 'one;two'; SELECT 2;")).toEqual(["SELECT 'one;two'", 'SELECT 2']);
  });
});
