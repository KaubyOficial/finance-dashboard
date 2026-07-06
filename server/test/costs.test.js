import { describe, it, expect } from 'vitest';
import { makeDb } from './helpers.js';
import { validateCost, createCost, listCosts, updateCost, deleteCost } from '../src/costs/service.js';
import { analyzeCsv, importCsv } from '../src/costs/csv.js';

describe('cost validation', () => {
  it('accepts a valid direct cost', () => {
    expect(() => validateCost({ kind: 'one_off', category: 'x', amount: 10, currency: 'USD', channel_id: 'redef_de', start_date: '2026-01-01' })).not.toThrow();
  });
  it('rejects non-positive amounts', () => {
    expect(() => validateCost({ kind: 'one_off', category: 'x', amount: 0, currency: 'USD', channel_id: 'a', start_date: '2026-01-01' })).toThrow(/> 0/);
  });
  it('requires an allocation_rule for shared costs', () => {
    expect(() => validateCost({ kind: 'recurring', category: 'x', amount: 10, currency: 'USD', channel_id: null, start_date: '2026-01-01' })).toThrow(/allocation_rule/);
  });
  it('rejects custom percentages that do not sum to 100', () => {
    expect(() => validateCost({ kind: 'recurring', category: 'x', amount: 10, currency: 'USD', channel_id: null, allocation_rule: 'custom', allocation_custom: { a: 40 }, start_date: '2026-01-01' })).toThrow(/100/);
  });
  it('rejects a one-off with an end_date', () => {
    expect(() => validateCost({ kind: 'one_off', category: 'x', amount: 10, currency: 'USD', channel_id: 'a', start_date: '2026-01-01', end_date: '2026-02-01' })).toThrow(/avulso/);
  });
  it('rejects recurring end before start', () => {
    expect(() => validateCost({ kind: 'recurring', category: 'x', amount: 10, currency: 'USD', channel_id: 'a', start_date: '2026-03-01', end_date: '2026-01-01' })).toThrow(/antes/);
  });
});

describe('cost CRUD', () => {
  it('creates, lists, updates and deletes', () => {
    const db = makeDb();
    const c = createCost(db, { kind: 'recurring', category: 'TTS', amount: 99, currency: 'USD', channel_id: 'redef_de', start_date: '2026-01-01' });
    expect(c.id).toBeGreaterThan(0);
    expect(listCosts(db, { channel_id: 'redef_de' }).length).toBe(1);
    const upd = updateCost(db, c.id, { amount: 120 });
    expect(upd.amount).toBe(120);
    expect(deleteCost(db, c.id)).toBe(true);
    expect(listCosts(db, {}).length).toBe(0);
  });

  it('lists by month for recurring coverage and one-off exactness', () => {
    const db = makeDb();
    createCost(db, { kind: 'recurring', category: 'A', amount: 10, currency: 'USD', channel_id: 'redef_de', start_date: '2026-01-01', end_date: '2026-03-31' });
    createCost(db, { kind: 'one_off', category: 'B', amount: 5, currency: 'USD', channel_id: 'redef_de', start_date: '2026-05-10' });
    expect(listCosts(db, { month: '2026-02' }).length).toBe(1); // only recurring
    expect(listCosts(db, { month: '2026-05' }).length).toBe(1); // only one-off
  });
});

describe('CSV import', () => {
  const header = 'kind;category;description;amount;currency;channel_id;allocation_rule;allocation_custom;start_date;end_date';
  const good = `${header}\nrecurring;TTS;ElevenLabs;99,00;USD;redef_de;;;2026-01-01;\none_off;Narração;Fiverr;40,00;EUR;cortes_de;;;2026-05-10;`;

  it('parses BR decimals and the ; delimiter', () => {
    const db = makeDb();
    const a = analyzeCsv(db, good);
    expect(a.errors).toEqual([]);
    expect(a.toInsert.length).toBe(2);
    expect(a.toInsert[0].cost.amount).toBeCloseTo(99, 6);
  });

  it('reports a bad line by number without aborting valid ones', () => {
    const db = makeDb();
    const bad = `${header}\nrecurring;TTS;x;abc;USD;redef_de;;;2026-01-01;\none_off;Y;y;10;USD;redef_de;;;2026-02-01;`;
    const a = analyzeCsv(db, bad);
    expect(a.errors.length).toBe(1);
    expect(a.errors[0].line).toBe(2);
    expect(a.toInsert.length).toBe(1);
  });

  it('handles a BOM and is idempotent (second import inserts nothing)', () => {
    const db = makeDb();
    const withBom = '﻿' + good;
    const first = importCsv(db, withBom, { dryRun: false });
    expect(first.inserted).toBe(2);
    const second = importCsv(db, withBom, { dryRun: false });
    expect(second.inserted).toBe(0);
    expect(second.duplicates.length).toBe(2);
  });
});
