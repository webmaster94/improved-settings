import test from "node:test";
import assert from "node:assert/strict";
import { matches, beside } from "../scripts/search.js";

test("matches word middles, accents, arbitrary word order, and literal regex characters", () => {
  assert(matches("Automatic Token Rotation", "tation"));
  assert(matches("Automatic Token Rotation", "rotation automatic"));
  assert(matches("Café + target (NPC)", "cafe (npc)"));
  assert(!matches("Automatic Token Rotation", ".*"));
  assert(!matches("Automatic Token Rotation", "rotation dragons"));
});

test("docks on the side with more room, constrains small screens, and reports unavoidable overlap", () => {
  const viewport = { width: 1920, height: 1080 };
  const child = { width: 650, height: 900 };
  const right = beside({ left: 20, right: 800, top: 60 }, child, viewport);
  assert.equal(right.side, "right"); assert.equal(right.left, 812); assert.equal(right.overlaps, false);
  const left = beside({ left: 1100, right: 1880, top: 500 }, child, viewport);
  assert.equal(left.side, "left"); assert.equal(left.left, 438); assert.equal(left.top, 172);
  const narrow = beside({ left: 240, right: 1020, top: 20 }, child, { width: 1280, height: 720 });
  assert.equal(narrow.overlaps, true); assert.equal(narrow.height, 704);
  assert(narrow.left + narrow.width <= 1272);
});
