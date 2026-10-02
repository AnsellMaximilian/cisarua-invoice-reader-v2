function wholeRupiah(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative whole Rupiah amount.`);
  return String(number);
}

function positiveQuantity(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
  return String(Number(number));
}

export function buildSupplierDirectReview({ source, supplier, customer, date, supplierReference, note = "", lines, supplierDeliveryFee = 0, customerDeliveryCharge = supplierDeliveryFee }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must use YYYY-MM-DD.");
  if (!lines.length) throw new Error("At least one product line is required.");
  const warnings = [];
  const draftLines = lines.map((line, index) => {
    const quantity = positiveQuantity(line.quantity, `Line ${index + 1} quantity`);
    const totalAmount = wholeRupiah(line.totalRead, `Line ${index + 1} total`);
    if (!line.product.inputUnitCode) throw new Error(`Line ${index + 1} has no usable V2 input unit.`);
    if (line.product.catalogPrice === null) warnings.push(`${line.product.name}: no active catalog price was found for ${line.product.inputUnitLabel}.`);
    if (line.product.expectedUnitCost === null) warnings.push(`${line.product.name}: no effective expected supplier cost was found.`);
    const expected = line.product.expectedUnitCost === null ? null : Math.round(Number(quantity) * Number(line.product.expectedUnitCost));
    const differs = expected !== null && expected !== Number(totalAmount);
    if (differs) warnings.push(`${line.product.name}: handwritten supplier total Rp${totalAmount} differs from expected Rp${expected}.`);
    return {
      clientLineKey: line.lineId || `slip-line-${index + 1}`,
      productId: line.product.id,
      productName: line.product.name,
      inputUnitCode: line.product.inputUnitCode,
      quantity,
      supplierDescription: line.productNameRead,
      supplierCost: {
        status: "provisional",
        totalAmount,
        ...(differs ? { overrideReason: "Handwritten supplier slip total differs from the current expected cost; admin review required." } : {}),
      },
      customerPricing: { source: "catalog" },
    };
  });
  const reference = supplierReference || `${source.imageFile}#${source.slipIndex}`;
  const supplierFee = wholeRupiah(supplierDeliveryFee, "Supplier delivery fee");
  const customerCharge = wholeRupiah(customerDeliveryCharge, "Customer delivery charge");
  const supplierDirectDraft = {
    schemaVersion: 1,
    supplierId: supplier.id,
    supplierName: supplier.name,
    customerId: customer.id,
    customerName: customer.name,
    occurred: { date, precision: "date" },
    supplierReference: reference,
    ...(note.trim() ? { note: note.trim() } : {}),
    lines: draftLines,
    supplierDeliveryFee: { status: "provisional", amount: supplierFee, note: "Imported from reviewed supplier slip; confirm during supplier reconciliation." },
    customerDeliveryCharge: customerCharge,
    customerDeliveryDescription: "Biaya pengantaran supplier langsung",
  };
  const supplierProductSubtotal = draftLines.reduce((sum, line) => sum + Number(line.supplierCost.totalAmount), 0);
  return {
    schemaVersion: "rumah-sehat-v2-slip-review-v1",
    readyToImport: warnings.every((warning) => !warning.includes("no active catalog price") && !warning.includes("no usable V2 input unit")),
    source,
    extracted: {
      customerNameRead: customer.nameRead,
      lines: lines.map((line) => ({ lineId: line.lineId ?? null, productNameRead: line.productNameRead, quantityRead: Number(line.quantity), totalRead: Number(line.totalRead) })),
    },
    resolved: { supplier, customer },
    warnings,
    calculations: {
      supplierProductSubtotal,
      supplierDeliveryFee: Number(supplierFee),
      supplierTotal: supplierProductSubtotal + Number(supplierFee),
      customerDeliveryCharge: Number(customerCharge),
    },
    proposedDraft: { supplierDirectDraft },
    supplierDirectDraft,
  };
}
