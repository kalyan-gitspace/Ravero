import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGreetingForTime } from '../src/utils/greeting.ts';

const cases = [
  ['03:59 AM', new Date(2026, 0, 1, 3, 59), 'Hello there!'],
  ['04:59 AM', new Date(2026, 0, 1, 4, 59), 'Hello there!'],
  ['05:00 AM', new Date(2026, 0, 1, 5, 0), 'Good morning'],
  ['11:59 AM', new Date(2026, 0, 1, 11, 59), 'Good morning'],
  ['12:00 PM', new Date(2026, 0, 1, 12, 0), 'Good afternoon'],
  ['03:59 PM', new Date(2026, 0, 1, 15, 59), 'Good afternoon'],
  ['04:00 PM', new Date(2026, 0, 1, 16, 0), 'Good evening'],
  ['11:59 PM', new Date(2026, 0, 1, 23, 59), 'Good evening'],
];

for (const [label, date, expected] of cases) {
  test(`local greeting at ${label}`, () => {
    assert.equal(getGreetingForTime(date), expected);
  });
}
