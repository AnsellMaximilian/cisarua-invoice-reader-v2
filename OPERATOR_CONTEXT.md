# Operator-confirmed invoice context

This file records durable business conventions confirmed by Rumah Sehat staff. It replaces reliance on one chat's memory. It is not a cache of V2 UUIDs and does not override active/effective-date checks.

For every batch:

- Resolve the current active supplier, customer, product, unit, expected cost, and price through the V2 MCP.
- Use the mappings below as operator-confirmed interpretation evidence. If the current V2 candidate set conflicts with a mapping, stop and ask rather than forcing an old identity.
- Never copy legacy integer IDs into V2 payloads. Legacy IDs below are disambiguating evidence only; the MCP must return the current UUID.

## House versus customer slips

- `Ibu Chi-Chi` in the slip's customer/name field means the Rumah Sehat house, not a customer. Use `build_supplier_receipt_review` and do not resolve Chi-Chi as a customer.
- Chi-Chi receipt items are for house/business use unless the slip explicitly identifies a customer-specific `titip` allocation. Let the V2 receipt builder derive the default disposition from stock tracking as required by `AGENTS.md`.
- Classify each logical slip independently. A separately named slip is not house use merely because it appears in the same photograph as a Chi-Chi slip or mentions Chi-Chi in an address/note.
- A separately named customer's address may say `Ibu Chi-Chi`, `dititip di rumah Bu Chi-Chi`, or equivalent. That remains a customer-direct slip for the named customer; the wording means the order is left at the house and neither the supplier nor Rumah Sehat charges the usual delivery fee. Set both `supplierDeliveryFee` and `customerDeliveryCharge` to zero unless the slip or staff explicitly states otherwise.
- In the 2026-09-30 batch, the separate `Wei` slip is customer `Wei Wei`, delivered/titip at the house with no delivery fee; the product itself carried no house-use marker.
- For an ordinary supplier-direct customer slip, the confirmed default is a Rp10,000 supplier delivery fee and a Rp10,000 customer delivery charge. Use zero for both on a Chi-Chi house receipt or a named customer order explicitly delivered/titip at Chi-Chi, unless staff states a different amount.
- For supplier-direct drafts, set `customerDeliveryDescription` to `Biaya pengantaran langsung`. Do not use the older wording `Biaya pengantaran supplier langsung`.

## Recurring Cisarua product wording

These mappings were explicitly confirmed by staff on 2026-10-04:

| Supplier wording | V2 canonical product |
| --- | --- |
| Telur Kampung | Telur Ayam |
| Horenso | Spinach/Horenzo |
| Cabe Merah Keriting | Cabe Kriting |
| Pisang Raja | Pisang Raja Bulu |
| Buncis BV | Buncis Baby |
| Selada, with no subtype written | Selada Keriting |
| Sl keriting | Selada Keriting |
| Beras PW | Beras Pandan Wangi |
| Bayam baby | Bayam Hijau |
| D. Ketumbar | Wansui |
| Talas Benteng | Talas Belitung |

Still preserve the exact supplier wording in the review JSON. Reinspect quantities and totals independently; a confirmed name mapping does not make conflicting arithmetic correct.

## Recurring customer wording

These interpretations were explicitly confirmed by staff on 2026-10-04. Always resolve the current UUID through `resolve_customer`.

| Handwriting or short name | V2 canonical customer | Legacy evidence / note |
| --- | --- | --- |
| Ifony, even when poorly written | Ifony | legacy 192; Taman Golf No. 215 |
| Anita S | Anita Simin | legacy 179 |
| Kiky | Kiky | legacy 311; stored address spelling may be stale |
| Anas | Anas Citra | legacy 160 |
| Andrea | Andrea Anak Anas | legacy 654 |
| Sani | Sani | legacy 245; stored address may need updating |
| Aileen | Aileen | legacy 436; stored address may be stale |
| Ferlina | Ferlina | legacy 222; stored address may be stale |
| Wei | Wei Wei | legacy 47 |
| Hamid | Yung Hwa | legacy 99; canonical spacing is `Yung Hwa` |
| Dian or Dianita with Jalan Janur Hijau XIII To 2 No. 8 | Dian | legacy 31 |
| Yuliana at Cipinang Elmir | Yuliana (Nelly) | legacy 231 |
| Karina Lie | Liefung | legacy 76; Indonesian/English name; Alicante Timur 5 no. 6 |
| Natassya | Natasha - Nat | legacy 366; `Natassya` is an active customer alias |
| Isabella | Isabella - Lala | legacy 194 |
| Irene Cinere, with Jl. Lempuyang V no. E48-49 | Irene Natalia | legacy 223 |
| Pipi, when it is the poorly written no-address slip confirmed on 2026-10-17 | Fifi Kebon Jeruk | legacy 424 |
| Yuliana with Flamingo Timur 5 no. 17 | Yuliana (Nelly) | legacy 231 |

## Alias capability in V2

- Customer resolution reads active aliases from `app.party_aliases`.
- The current V2 MCP exposes no alias-write tool, and this repository's safety boundary forbids alias or other learning writes.
- Product matching reads active aliases from `app.product_aliases` in addition to canonical product names and effective supplier descriptions. The MCP reported zero active supplier-product aliases for the 2026-10-06 through 2026-10-09 Cisarua batch.
- The current V2 MCP does not expose a product-alias write path (`productAliasWrites: false`).
- If durable database aliases are desired, add them through an explicitly authorized V2 administrative workflow or a separately reviewed future MCP capability. Do not write them through ad hoc SQL from this workspace.
