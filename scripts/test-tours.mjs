import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const configUrl = moduleUrl(await readFile(new URL('../src/lib/tour-config.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/lib/tours.ts', import.meta.url), 'utf8'))
  .replaceAll('"@/lib/tour-config"', JSON.stringify(configUrl))
  .replace('import { databaseConfigured, withDatabase } from "@/lib/database";', 'const databaseConfigured = () => false; const withDatabase = () => { throw new Error("Database access is not allowed in this test"); };')
  .replace('import { isMailConfigured, sendMail } from "@/lib/mail";', 'const isMailConfigured = () => false; const sendMail = () => { throw new Error("Email is not allowed in this test"); };');
const { getTourManagerSchedule } = await import(moduleUrl(source));

const registration = (id, tourDate, tourTime, createdAt, tickets = 1) => Object.freeze({
  id, tourDate, tourTime, createdAt, tickets, name: 'Fixture guest', email: 'fixture@example.com', message: '', paymentStatus: 'pending',
});
const registrations = Object.freeze([
  registration('old-tour', '2026-10-10', '4:00 PM', '2026-10-10T14:00:00Z'),
  registration('later-tour', '2026-10-24', '4:00 PM', '2026-10-14T14:00:00Z'),
  registration('earliest-signup', '2026-10-17', '4:00 PM', '2026-10-01T14:00:00Z', 2),
  registration('newest-signup', '2026-10-17', '6:00 PM', '2026-10-17T13:00:00Z'),
  registration('middle-signup', '2026-10-17', '4:00 PM', '2026-10-15T14:00:00Z', 3),
]);
const snapshot = JSON.stringify(registrations);
const ids = result => result.signups.map(item => item.id);
const before = getTourManagerSchedule(registrations, 5, [], new Date('2026-10-17T19:00:00Z'));
assert.deepEqual(ids(before), ['newest-signup', 'middle-signup', 'later-tour', 'earliest-signup'], 'Newest signup comes first regardless of assigned tour');
assert.deepEqual(before.scheduledTours.map(tour => [tour.date, tour.time]), [
  ['2026-10-17', '4:00 PM'], ['2026-10-17', '6:00 PM'], ['2026-10-24', '4:00 PM'],
], 'Schedule stays in chronological order and omits past dates');
assert.equal(before.scheduledTours[0].guests, 2);
assert.equal(before.scheduledTours[0].tickets, 5);
assert.equal(before.scheduledTours[0].confirmed, true);
assert.equal(before.scheduledTours[1].confirmed, false);
assert.deepEqual(ids(getTourManagerSchedule(registrations, 5, [], new Date('2026-10-17T20:00:00Z'))), ids(before), 'Tour at the current start time remains visible');
assert.deepEqual(ids(getTourManagerSchedule(registrations, 5, [], new Date('2026-10-17T20:00:00.001Z'))), ['newest-signup', 'later-tour'], 'Passed 4 p.m. tour disappears while the upcoming 6 p.m. tour remains');
assert.deepEqual(ids(getTourManagerSchedule(registrations, 5, [], new Date('2026-10-17T22:00:01Z'))), ['later-tour']);
assert.deepEqual(ids(getTourManagerSchedule(registrations, 5, ['2026-10-17|6:00 PM'], new Date('2026-10-17T20:01:00Z'))), ['later-tour'], 'Cancelled tours and their signups are hidden');
assert.deepEqual(getTourManagerSchedule(registrations, 5, [], new Date('2027-01-01T00:00:00Z')), { signups: [], scheduledTours: [] });
assert.equal(JSON.stringify(registrations), snapshot, 'History, payments, and original store order remain unchanged');

for (const [date, startUtc] of [['2026-07-18', '2026-07-18T20:00:00Z'], ['2026-01-17', '2026-01-17T21:00:00Z'], ['2026-11-07', '2026-11-07T21:00:00Z']]) {
  const rows = [registration('seasonal', date, '4:00 PM', '2025-12-01T00:00:00Z')];
  assert.equal(getTourManagerSchedule(rows, 5, [], new Date(Date.parse(startUtc) - 1)).signups.length, 1, 'Upcoming Eastern tour remains visible across DST');
  assert.equal(getTourManagerSchedule(rows, 5, [], new Date(Date.parse(startUtc) + 1)).signups.length, 0, 'Passed Eastern tour is hidden across DST');
}
const offsets = [registration('older', '2026-10-24', '4:00 PM', '2026-10-17T15:00:00Z'), registration('newer', '2026-10-24', '4:00 PM', '2026-10-17T12:00:00-04:00')];
assert.deepEqual(ids(getTourManagerSchedule(offsets, 5, [], new Date('2026-10-17T19:00:00Z'))), ['newer', 'older'], 'Signup ordering compares actual instants even with different offsets');
console.log('Tours passed: newest signup first; upcoming dates and same-day start boundaries; Eastern summer/winter time; cancelled tours; guest totals; unchanged stored history. No database writes or emails.');
