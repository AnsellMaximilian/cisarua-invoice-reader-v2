import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { RumahSehatV2Database } from "./db.js";
import { buildSupplierDirectReview } from "./draft.js";
import { loadLocalEnv } from "./env.js";
import { rankCustomerCandidates, rankProductCandidates } from "./matching.js";

loadLocalEnv();
const database = new RumahSehatV2Database(process.env.DATABASE_URL);
const server = new McpServer({ name: "RumahSehatInvoiceReaderV2", version: "0.1.0" });
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();
const money = z.union([z.number().int().nonnegative(), z.string().regex(/^(?:0|[1-9]\d*)$/)]).transform(Number);
const quantity = z.union([z.number().positive(), z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)]).transform(Number).refine((value) => value > 0);
const response = (payload) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload });

server.registerTool("get_import_context", {
  title: "Get V2 supplier-slip import context",
  description: "Resolves an active V2 supplier and reports read-only product and price coverage for a business date.",
  inputSchema: z.object({ supplierName: z.string().min(1).default("Cisarua"), effectiveOn: date }).strict(), annotations,
}, async (input) => response(await database.getImportContext(input)));

server.registerTool("resolve_customer", {
  title: "Resolve a V2 customer",
  description: "Ranks active V2 customers using canonical names, aliases, optional address evidence, and legacy references without writing anything.",
  inputSchema: z.object({ nameRead: z.string().min(1).max(255), addressRead: z.string().min(1).max(500).optional(), effectiveOn: date, limit: z.number().int().min(1).max(10).default(5) }).strict(), annotations,
}, async (input) => response(rankCustomerCandidates(input, await database.fetchCustomers(input.effectiveOn), input.limit)));

const extractedLine = z.object({ lineId: z.string().min(1).max(100).optional(), productNameRead: z.string().min(1).max(255), qtyRead: quantity, totalRead: money }).strict();
server.registerTool("match_product_lines", {
  title: "Match V2 supplier product lines",
  description: "Ranks products active for one supplier and date using names, supplier descriptions, and handwritten cost arithmetic.",
  inputSchema: z.object({ supplierId: uuid.optional(), supplierName: z.string().min(1).optional(), effectiveOn: date, lines: z.array(extractedLine).min(1).max(200), candidateLimit: z.number().int().min(1).max(10).default(5) }).strict(), annotations,
}, async (input) => {
  const supplier = await database.findSupplier(input, input.effectiveOn);
  if (!supplier) throw new Error("The selected supplier is not active on this date.");
  const products = await database.fetchProductsForSupplier(supplier.id, input.effectiveOn);
  const lines = input.lines.map((line) => rankProductCandidates(line, products, input.candidateLimit));
  return response({ supplier, effectiveOn: input.effectiveOn, lines, summary: { totalLines: lines.length, highConfidence: lines.filter((line) => line.confidence === "high").length, needsReview: lines.filter((line) => line.confidence !== "high").length } });
});

const selectedLine = z.object({ lineId: z.string().min(1).max(100).optional(), productNameRead: z.string().min(1).max(255), productId: uuid, quantity, totalRead: money }).strict();
server.registerTool("build_supplier_direct_review", {
  title: "Build a reviewed V2 supplier-direct draft",
  description: "Validates selected V2 identities and creates a form-fill-only supplierDirectDraft. It never posts a receipt, fulfillment, invoice, or bill.",
  inputSchema: z.object({
    sourceImage: z.string().min(1).max(500), slipIndex: z.number().int().min(1), sourceFingerprint: z.string().min(8).max(200).optional(),
    supplierId: uuid, customerId: uuid, customerNameRead: z.string().min(1).max(255), date,
    supplierReference: z.string().min(1).max(300).optional(), note: z.string().max(2000).default(""),
    supplierDeliveryFee: money.default(0), customerDeliveryCharge: money.optional(),
    lines: z.array(selectedLine).min(1).max(200),
  }).strict(), annotations,
}, async (input) => {
  const supplier = await database.findSupplier({ supplierId: input.supplierId }, input.date);
  if (!supplier) throw new Error("The selected supplier is not active on this date.");
  const customer = await database.findCustomer(input.customerId, input.date);
  if (!customer) throw new Error("The selected customer is not active on this date.");
  const products = await database.findProductsByIds(supplier.id, input.lines.map((line) => line.productId), input.date, customer.id);
  const missing = products.findIndex((product) => !product);
  if (missing >= 0) throw new Error(`Line ${missing + 1}: product is not active for ${supplier.name} on ${input.date}.`);
  return response(buildSupplierDirectReview({
    source: { imageFile: input.sourceImage, slipIndex: input.slipIndex, ...(input.sourceFingerprint ? { fingerprint: input.sourceFingerprint } : {}) },
    supplier, customer: { ...customer, nameRead: input.customerNameRead }, date: input.date,
    supplierReference: input.supplierReference, note: input.note,
    supplierDeliveryFee: input.supplierDeliveryFee,
    customerDeliveryCharge: input.customerDeliveryCharge ?? input.supplierDeliveryFee,
    lines: input.lines.map((line, index) => ({ ...line, product: products[index] })),
  }));
});

const transport = new StdioServerTransport();
await server.connect(transport);

async function shutdown() { await database.close(); process.exit(0); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
