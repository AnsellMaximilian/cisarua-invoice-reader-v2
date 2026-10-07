const NAME_PREFIXES = new Set(["ibu", "bu", "bapak", "bpk", "pak", "mr", "mrs"]);

export function normalizeText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " dan ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizePersonName(value) {
  return normalizeText(value).split(" ").filter((token) => token && !NAME_PREFIXES.has(token)).join(" ");
}

export function normalizeProductName(value) {
  return normalizeText(value).replace(/\borganic\b/g, "organik").replace(/\bbroccoli\b/g, "brokoli")
    .replace(/\bnegri\b/g, "negeri").replace(/\bkriting\b/g, "keriting")
    .replace(/\bpakchoy\b/g, "pakcoy").replace(/\blabusiam\b/g, "labu siam").replace(/\s+/g, " ").trim();
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);
  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + substitution);
    }
    for (let column = 0; column <= right.length; column += 1) previous[column] = current[column];
  }
  return previous[right.length];
}

function tokenJaccard(left, right) {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

export function textSimilarity(leftValue, rightValue, normalizer = normalizeText) {
  const left = normalizer(leftValue); const right = normalizer(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  const editScore = 1 - levenshtein(left, right) / longest;
  const tokenScore = tokenJaccard(left, right);
  const containmentScore = left.includes(right) || right.includes(left)
    ? 0.84 + 0.12 * (Math.min(left.length, right.length) / longest) : 0;
  return Math.max(editScore, tokenScore * 0.7 + editScore * 0.3, containmentScore);
}

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

export function rankCustomerCandidates({ nameRead, addressRead }, customers, limit = 5) {
  const ranked = customers.map((customer) => {
    const choices = [{ type: "canonical_name", value: customer.name }, ...(customer.aliases ?? []).map((value) => ({ type: "alias", value }))];
    const nameMatch = choices.map((choice) => ({ ...choice, score: textSimilarity(nameRead, choice.value, normalizePersonName) })).sort((a, b) => b.score - a.score)[0];
    const addressScore = addressRead ? Math.max(0, ...(customer.addresses ?? []).map((address) => textSimilarity(addressRead, address, normalizeText))) : 0;
    const score = addressRead ? nameMatch.score * 0.88 + addressScore * 0.12 : nameMatch.score;
    return { customerId: customer.id, legacyCustomerId: customer.legacyCustomerId, fullName: customer.name, aliases: customer.aliases ?? [], addresses: customer.addresses ?? [], matchedOn: nameMatch.type, matchedText: nameMatch.value, nameScore: round(nameMatch.score), addressScore: round(addressScore), score: round(score) };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
  const first = ranked[0]; const second = ranked[1]; const gap = first ? first.score - (second?.score ?? 0) : 0;
  const confidence = first && first.score >= 0.92 && gap >= 0.04 ? "high" : first && first.score >= 0.72 && gap >= 0.02 ? "medium" : "low";
  return { nameRead, addressRead: addressRead ?? null, confidence, suggestedCustomerId: confidence === "high" ? first.customerId : null, candidates: ranked, warnings: confidence === "high" ? [] : ["Customer was not auto-selected; review the ranked candidates."] };
}

export function rankProductCandidates(line, products, candidateLimit = 5) {
  const qty = Number(line.qtyRead); const total = Number(line.totalRead);
  const ranked = products.map((product) => {
    const choices = [{ type: "canonical_name", value: product.name }, ...(product.aliases ?? []).map((value) => ({ type: "alias", value })), ...(product.supplierDescriptions ?? []).map((value) => ({ type: "supplier_description", value }))];
    const textMatch = choices.map((choice) => ({ ...choice, score: textSimilarity(line.productNameRead, choice.value, normalizeProductName) })).sort((a, b) => b.score - a.score)[0];
    const expectedTotal = product.expectedUnitCost === null ? null : qty * Number(product.expectedUnitCost);
    const totalDelta = expectedTotal === null ? null : Math.abs(total - expectedTotal);
    const tolerance = expectedTotal === null ? 0 : Math.max(1, Math.round(Math.abs(expectedTotal) * 0.001));
    const totalMatches = totalDelta !== null && totalDelta <= tolerance;
    const costScore = expectedTotal === null || expectedTotal === 0 ? 0 : Math.max(0, 1 - totalDelta / Math.max(expectedTotal * 0.25, 1));
    const score = textMatch.score * 0.78 + costScore * 0.22;
    return { productId: product.id, productCode: product.code, name: product.name, inputUnitCode: product.inputUnitCode, inputUnitLabel: product.inputUnitLabel, expectedUnitCost: product.expectedUnitCost, catalogPrice: product.catalogPrice, matchedOn: textMatch.type, matchedText: textMatch.value, nameScore: round(textMatch.score), costScore: round(costScore), expectedTotal: expectedTotal === null ? null : round(expectedTotal, 2), totalDelta: totalDelta === null ? null : round(totalDelta, 2), totalMatches, score: round(score) };
  }).sort((a, b) => b.score - a.score || (a.totalDelta ?? Infinity) - (b.totalDelta ?? Infinity));
  const candidates = ranked.slice(0, candidateLimit); const first = candidates[0]; const second = candidates[1]; const gap = first ? first.score - (second?.score ?? 0) : 0;
  const confidence = first && first.score >= 0.9 && gap >= 0.04 ? "high" : first && first.score >= 0.72 && gap >= 0.02 ? "medium" : "low";
  const warnings = [];
  if (!first) warnings.push("No active product candidates were found for this supplier and date.");
  if (first && first.expectedTotal === null) warnings.push("The best candidate has no effective expected supplier cost.");
  if (first && first.expectedTotal !== null && !first.totalMatches) warnings.push("The best candidate does not reproduce the handwritten line total; reinspect the quantity and price.");
  if (first && second && gap < 0.04) warnings.push("Top product candidates are close; human review is required.");
  if (confidence !== "high") warnings.push("Product was not auto-selected.");
  return { lineId: line.lineId ?? null, productNameRead: line.productNameRead, qtyRead: qty, totalRead: total, confidence, suggestedProductId: confidence === "high" ? first.productId : null, candidates, warnings };
}
