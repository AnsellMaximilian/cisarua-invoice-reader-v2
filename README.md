# Rumah Sehat Invoice Reader V2

A separate, review-first local Codex workspace for turning photographed supplier slips into JSON drafts accepted by Rumah Sehat V2. It supports both supplier-direct customer slips and receipts delivered to the house.

This project does not modify or depend on the original `invoice_reader` checkout. Its MCP reads the V2 database and exposes no mutation tools.

## Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the intended Rumah Sehat V2 database.
3. Open this directory as a trusted Codex workspace and restart Codex after changing `.codex/config.toml`.
4. Put supplier images under `incoming/`.
5. Ask Codex: `Process the new Cisarua customer-direct slips into Rumah Sehat V2 review JSON.`
6. Review files under `output/`, then paste an approved complete JSON file into **Dropship Baru → Import JSON**.

Loading JSON only fills the V2 form. The admin must review it and click **Posting dropship** before any business facts are created.

## MCP tools

- `get_import_context`: resolves a supplier and reports current matching coverage.
- `resolve_customer`: ranks active customers using canonical names, aliases, addresses, and legacy references.
- `match_product_lines`: ranks products active for the supplier using canonical names, v2 product aliases, supplier descriptions, quantities, and handwritten totals.
- `build_supplier_direct_review`: validates selected V2 identities and returns the review envelope and `supplierDirectDraft` consumed by the V2 form.
- `build_supplier_receipt_review`: builds a house-receipt draft. It defaults tracked products to owned stock, untracked products to business/household use, and permits explicit customer allocations for `titip` lines.

## Commands

```powershell
npm test
npm start
```

All generated JSON is review-only. It never posts receipts, stock, allocations, fulfillments, invoices, or supplier bills.
