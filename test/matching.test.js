import assert from "node:assert/strict";
import test from "node:test";

import { rankCustomerCandidates, rankProductCandidates } from "../src/matching.js";

test("customer aliases resolve while ambiguous names remain reviewable", () => {
  const result = rankCustomerCandidates({ nameRead: "Marinee 28" }, [
    { id: "a", name: "Marinee", aliases: ["Marinee 28"], addresses: [] },
    { id: "b", name: "Marina", aliases: [], addresses: [] },
  ]);
  assert.equal(result.confidence, "high");
  assert.equal(result.suggestedCustomerId, "a");
});

test("product matching combines supplier wording and arithmetic", () => {
  const result = rankProductCandidates({ productNameRead: "Pakchoy", qtyRead: 0.25, totalRead: 9000 }, [
    { id: "a", code: "legacy-rs-619", name: "Pakcoy", inputUnitCode: "kg", inputUnitLabel: "kg", expectedUnitCost: "36000", catalogPrice: "46000", supplierDescriptions: [] },
    { id: "b", code: "legacy-rs-622", name: "Timun", inputUnitCode: "kg", inputUnitLabel: "kg", expectedUnitCost: "32000", catalogPrice: "43000", supplierDescriptions: [] },
  ]);
  assert.equal(result.confidence, "high");
  assert.equal(result.suggestedProductId, "a");
  assert.equal(result.candidates[0].totalMatches, true);
});

test("product aliases are first-class matching evidence", () => {
  const result = rankProductCandidates({ productNameRead: "Sosis Beef", qtyRead: 1, totalRead: 123500 }, [
    { id: "a", code: "beef-sausage", name: "Beef Sausage", aliases: ["Sosis Beef"], inputUnitCode: "pack", inputUnitLabel: "pack", expectedUnitCost: "123500", catalogPrice: "145000", supplierDescriptions: [] },
    { id: "b", code: "pork-sausage", name: "Pork Sausage", aliases: [], inputUnitCode: "pack", inputUnitLabel: "pack", expectedUnitCost: "123500", catalogPrice: "145000", supplierDescriptions: [] },
  ]);
  assert.equal(result.confidence, "high");
  assert.equal(result.suggestedProductId, "a");
  assert.equal(result.candidates[0].matchedOn, "alias");
  assert.equal(result.candidates[0].matchedText, "Sosis Beef");
});
