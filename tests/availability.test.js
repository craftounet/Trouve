import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commonSlots,
  occurs,
  monday,
  datePlus,
  clock,
} from "../src/availability.js";
const e = (id, user, s, t, extra = {}) => ({
  id,
  user_id: user,
  day_of_week: 0,
  start_time: s,
  end_time: t,
  recurrence_start: "2026-09-01",
  recurrence_end: null,
  ...extra,
});
const base = { memberIds: ["a", "b"], date: "2026-09-28", groupId: "g" };
test("union des agendas, chevauchements et minutes exactes", () =>
  assert.deepEqual(
    commonSlots({
      ...base,
      events: [
        e("1", "a", "08:15", "10:15"),
        e("2", "b", "09:00", "11:45"),
        e("3", "a", "12:15", "14:00"),
      ],
    }),
    [
      [705, 735],
      [840, 1080],
    ],
  ));
test("une absence en attente ne libère rien", () =>
  assert.deepEqual(
    commonSlots({
      ...base,
      events: [e("1", "a", "08:00", "18:00")],
      cancellations: [
        {
          event_id: "1",
          group_id: "g",
          occurrence_date: base.date,
          status: "pending",
        },
      ],
    }),
    [],
  ));
test("confirmation limitée au groupe et à la date", () => {
  const events = [e("1", "a", "08:00", "18:00")],
    c = {
      event_id: "1",
      group_id: "g",
      occurrence_date: base.date,
      status: "confirmed",
    };
  assert.deepEqual(commonSlots({ ...base, events, cancellations: [c] }), [
    [480, 1080],
  ]);
  assert.deepEqual(
    commonSlots({
      ...base,
      events,
      cancellations: [{ ...c, group_id: "other" }],
    }),
    [],
  );
  assert.deepEqual(
    commonSlots({
      ...base,
      events,
      cancellations: [{ ...c, occurrence_date: "2026-10-05" }],
    }),
    [],
  );
});
test("aucun membre ne produit pas de faux créneaux", () =>
  assert.deepEqual(commonSlots({ ...base, memberIds: [], events: [] }), []));
test("cours hors période ou membres étrangers ignorés", () =>
  assert.deepEqual(
    commonSlots({
      ...base,
      events: [
        e("1", "a", "08:00", "18:00", { recurrence_end: "2026-09-27" }),
        e("2", "c", "08:00", "18:00"),
      ],
    }),
    [[480, 1080]],
  ));
test("fin de récurrence inclusive et dimanche", () => {
  assert.equal(
    occurs(
      e("1", "a", "08:00", "09:00", { recurrence_end: base.date }),
      base.date,
    ),
    true,
  );
  assert.equal(
    occurs(e("1", "a", "08:00", "09:00", { day_of_week: 6 }), "2026-10-04"),
    true,
  );
});
test("semaines et changement heure sans glissement de jour", () => {
  assert.equal(monday("2026-10-25"), "2026-10-19");
  assert.equal(datePlus("2026-10-25", 1), "2026-10-26");
  assert.equal(clock(615), "10:15");
});
test("bornes et intervalles adjacents", () =>
  assert.deepEqual(
    commonSlots({
      ...base,
      events: [e("1", "a", "07:00", "09:00"), e("2", "b", "09:00", "17:45")],
    }),
    [],
  ));
