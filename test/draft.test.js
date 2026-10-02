import assert from "node:assert/strict";
import test from "node:test";

import { buildSupplierDirectReview, buildSupplierReceiptReview } from "../src/draft.js";

const product = { id: "10000000-0000-4000-8000-000000000003", code: "legacy-rs-619", name: "Pakcoy", inputUnitCode: "kg", inputUnitLabel: "kg", expectedUnitCost: "36000", catalogPrice: "46000" };

test("builds a pasteable review without posting anything", () => {
  const result = buildSupplierDirectReview({
    source: { imageFile: "cisarua.jpg", slipIndex: 1, fingerprint: "sha256:example" },
    supplier: { id: "10000000-0000-4000-8000-000000000001", name: "Cisarua" },
    customer: { id: "10000000-0000-4000-8000-000000000002", name: "Marinee", nameRead: "Marinee 28" },
    date: "2026-09-26", lines: [{ lineId: "R01", productNameRead: "Pakchoy", product, quantity: 0.25, totalRead: 9000 }],
    supplierDeliveryFee: 10000, customerDeliveryCharge: 10000,
  });
  assert.equal(result.readyToImport, true);
  assert.equal(result.supplierDirectDraft.lines[0].quantity, "0.25");
  assert.equal(result.supplierDirectDraft.lines[0].supplierCost.totalAmount, "9000");
  assert.equal(result.supplierDirectDraft.customerDeliveryCharge, "10000");
  assert.equal(result.supplierDirectDraft.supplierReference, "cisarua.jpg#1");
});

test("keeps a cost discrepancy visible and explainable", () => {
  const result = buildSupplierDirectReview({
    source: { imageFile: "cisarua.jpg", slipIndex: 1 },
    supplier: { id: "s", name: "Cisarua" }, customer: { id: "c", name: "Marinee", nameRead: "Marinee" }, date: "2026-09-26",
    lines: [{ productNameRead: "Pakchoy", product, quantity: 0.25, totalRead: 9500 }],
  });
  assert.match(result.warnings[0], /differs from expected/);
  assert.match(result.supplierDirectDraft.lines[0].supplierCost.overrideReason, /admin review required/);
});

test("defaults tracked and untracked house receipts to different dispositions", () => {
  const result = buildSupplierReceiptReview({
    source: { imageFile: "cisarua-house.jpg", slipIndex: 1 },
    supplier: { id: "s", name: "Cisarua" }, date: "2026-09-26", supplierDeliveryFee: 10000,
    lines: [
      { productNameRead: "Sosis", product: { ...product, id: "tracked", name: "Sosis", stockTracked: true }, receivedQuantity: 2, totalRead: 20000, destination: { kind: "auto_by_stock_tracking" } },
      { productNameRead: "Pakcoy", product: { ...product, id: "untracked", stockTracked: false }, receivedQuantity: 0.25, totalRead: 9000, destination: { kind: "auto_by_stock_tracking" } },
    ],
  });
  assert.equal(result.supplierReceiptDraft.lines[0].dispositions[0].kind, "owned_stock");
  assert.equal(result.supplierReceiptDraft.lines[1].dispositions[0].kind, "business_or_household_use");
  assert.equal(result.supplierReceiptDraft.supplierDeliveryFee.amount, "10000");
});

test("allows an untracked titip line to remain a customer allocation", () => {
  const result = buildSupplierReceiptReview({
    source: { imageFile: "cisarua-house.jpg", slipIndex: 2 },
    supplier: { id: "s", name: "Cisarua" }, date: "2026-09-26",
    lines: [{
      productNameRead: "Pakcoy", product: { ...product, stockTracked: false }, receivedQuantity: 0.25, totalRead: 9000,
      destination: { kind: "customer_allocation", customer: { id: "c", name: "Wei-wei" } },
    }],
  });
  assert.deepEqual(result.supplierReceiptDraft.lines[0].dispositions[0], { kind: "customer_allocation", customerId: "c", customerName: "Wei-wei", quantity: "0.25" });
});

test("rejects owned stock for an untracked product", () => {
  assert.throws(() => buildSupplierReceiptReview({
    source: { imageFile: "cisarua-house.jpg", slipIndex: 3 },
    supplier: { id: "s", name: "Cisarua" }, date: "2026-09-26",
    lines: [{ productNameRead: "Pakcoy", product: { ...product, stockTracked: false }, receivedQuantity: 0.25, totalRead: 9000, destination: { kind: "owned_stock" } }],
  }), /does not track stock/);
});
