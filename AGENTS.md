# Rumah Sehat Invoice Reader V2

This project converts supplier-slip photographs into reviewable JSON drafts for Rumah Sehat V2.

## Safety boundary

- Database access is read-only. Never insert, update, delete, post, issue, reconcile, or pay business records.
- Never call Rumah Sehat V2 mutation endpoints.
- Do not invent UUIDs. Resolve suppliers, customers, products, units, prices, and expected costs through the MCP.
- Save review files under `output/`. A staff member must review and paste an approved draft into Rumah Sehat V2.
- A JSON draft is not evidence that the corresponding receipt or fulfillment was posted.

## First-pass workflow: supplier direct to customer

1. Inspect every requested image at full resolution and split it into logical customer slips.
2. Read the customer name, address when visible, date, received quantity, supplier wording, and handwritten line total. Use received quantity rather than ordered quantity.
3. Call `get_import_context` for the supplier, normally `Cisarua`.
4. Resolve the customer with `resolve_customer`.
5. Match products with `match_product_lines`. Matching is limited to products active for that supplier and business date.
6. Ask for human confirmation whenever a customer or product is ambiguous. Never select a low-confidence match yourself.
7. Call `build_supplier_direct_review` only after every customer and product has been resolved.
8. Save one JSON file per logical customer slip. Preserve source filename, stable slip index, extracted handwriting, candidate evidence, warnings, and the returned `supplierDirectDraft`.
9. Report totals and all discrepancies. The supplier cost from a slip is provisional; later supplier-bill reconciliation remains separate.
10. Staff pastes the complete review JSON into Rumah Sehat V2's **Dropship Baru → Import JSON** dialog, reviews the populated form, and explicitly posts it.

## Matching rules

- Prefer exact canonical or supplier-description matches, then cost arithmetic.
- Use current V2 effective-dated product units, supplier terms, and catalog prices.
- Arithmetic is a clue, not authority. Reinspect handwriting before changing an extracted quantity.
- Do not silently use an inactive product, unit, customer, supplier term, or price.
- Customer and product names in the built payload are identity guards and must match the selected UUIDs.

## Out of scope for this first pass

- Supplier receipts sent to the house, `titip`, owned stock, and household-use drafts.
- Automatic posting.
- Supplier bill creation or customer invoice issuance.
- Alias writes or any other learning writes.

## Verification

Run `npm test` after changing matching, payload construction, or database behavior.
