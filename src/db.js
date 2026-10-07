import pg from "pg";

const { Pool } = pg;

export class RumahSehatV2Database {
  constructor(connectionString) {
    if (!connectionString) throw new Error("DATABASE_URL is required in the Invoice Reader V2 .env file.");
    this.pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 10_000 });
  }

  async close() { await this.pool.end(); }
  async databaseName() { const result = await this.pool.query("select current_database() as name"); return result.rows[0].name; }

  async findSupplier({ supplierId, supplierName }, effectiveOn) {
    const values = supplierId ? [supplierId, effectiveOn] : [supplierName, effectiveOn];
    const predicate = supplierId ? "party.id = $1::uuid" : "lower(party.display_name) = lower($1)";
    const result = await this.pool.query(`
      select party.id, party.display_name as name
      from app.parties party join app.party_roles role on role.party_id = party.id
      where ${predicate} and party.active and role.role_code = 'supplier'
        and role.effective_from <= $2::date and (role.effective_until is null or role.effective_until >= $2::date)
      order by role.effective_from desc limit 1`, values);
    return result.rows[0] ?? null;
  }

  async getImportContext({ supplierName, effectiveOn }) {
    const supplier = await this.findSupplier({ supplierName }, effectiveOn);
    if (!supplier) throw new Error(`Active supplier not found on ${effectiveOn}: ${supplierName}`);
    const counts = await this.pool.query(`
      select count(distinct product.id)::integer as products,
             count(distinct case when price.id is not null then product.id end)::integer as priced_products,
             count(distinct alias.id)::integer as product_aliases
      from app.supplier_product_terms term
      join app.products product on product.id = term.product_id and product.active
      left join app.product_price_versions price on price.product_id = product.id
        and price.version_state = 'active' and price.price_scope = 'general' and price.effective_from <= $2::date
      left join app.product_aliases alias on alias.product_id = product.id and alias.active
      where term.supplier_id = $1::uuid and term.effective_from <= $2::date
        and (term.effective_through is null or term.effective_through >= $2::date)`, [supplier.id, effectiveOn]);
    return { database: await this.databaseName(), effectiveOn, supplier, counts: { activeSupplierProducts: counts.rows[0].products, productsWithCatalogPrice: counts.rows[0].priced_products, supplierProductAliases: counts.rows[0].product_aliases }, capabilities: { readOnly: true, productAliases: true, productAliasWrites: false, supplierDirectDraftV1: true } };
  }

  async fetchCustomers(effectiveOn) {
    const result = await this.pool.query(`
      select party.id, party.display_name as name,
             external.external_id as legacy_customer_id,
             coalesce(alias_list.aliases, '{}') as aliases,
             coalesce(address_list.addresses, '{}') as addresses
      from app.parties party
      join app.party_roles role on role.party_id = party.id and role.role_code = 'customer'
      left join app.party_external_references external on external.party_id = party.id
        and external.source_system = 'legacy-rs' and external.entity_type = 'customer'
      left join lateral (select array_agg(alias.alias order by alias.alias) as aliases from app.party_aliases alias where alias.party_id = party.id and alias.active) alias_list on true
      left join lateral (select array_agg(address.address_text order by address.is_primary desc, address.created_at) as addresses from app.party_addresses address where address.party_id = party.id and address.active) address_list on true
      where party.active and role.effective_from <= $1::date
        and (role.effective_until is null or role.effective_until >= $1::date)
      order by party.display_name`, [effectiveOn]);
    return result.rows.map((row) => ({ id: row.id, name: row.name, legacyCustomerId: row.legacy_customer_id ? Number(row.legacy_customer_id) : null, aliases: row.aliases, addresses: row.addresses }));
  }

  async fetchProductsForSupplier(supplierId, effectiveOn, customerId = null) {
    const result = await this.pool.query(`
      select product.id, product.code, product.display_name as name,
             coalesce(alias_list.aliases, '{}') as aliases,
             product.stock_tracking_enabled as stock_tracked,
             option.option_code, option.display_label as option_label,
             term.expected_unit_cost::text as expected_unit_cost,
             term.supplier_description,
             price.unit_price::text as catalog_price
      from app.supplier_product_terms term
      join app.products product on product.id = term.product_id and product.active
      join app.product_input_options option on option.id = coalesce(term.input_option_id, (
        select candidate.id from app.product_input_options candidate where candidate.product_id = product.id
          and candidate.is_default and candidate.effective_from <= $2::date
          and (candidate.effective_through is null or candidate.effective_through >= $2::date)
        order by candidate.effective_from desc limit 1))
      left join lateral (
        select version.unit_price from app.product_price_versions version
        where version.product_id = product.id and version.input_option_id = option.id
          and version.version_state = 'active'
          and (version.price_scope = 'general' or (version.price_scope = 'customer' and version.customer_id = $3::uuid))
          and version.effective_from <= $2::date
        order by case when version.price_scope = 'customer' then 0 else 1 end,
                 version.effective_from desc, version.recorded_at desc limit 1
      ) price on true
      left join lateral (
        select array_agg(alias.alias order by alias.alias) as aliases
        from app.product_aliases alias where alias.product_id = product.id and alias.active
      ) alias_list on true
      where term.supplier_id = $1::uuid and term.effective_from <= $2::date
        and (term.effective_through is null or term.effective_through >= $2::date)
        and option.effective_from <= $2::date and (option.effective_through is null or option.effective_through >= $2::date)
      order by product.display_name`, [supplierId, effectiveOn, customerId]);
    return result.rows.map((row) => ({ id: row.id, code: row.code, name: row.name, aliases: row.aliases, stockTracked: row.stock_tracked, inputUnitCode: row.option_code, inputUnitLabel: row.option_label, expectedUnitCost: row.expected_unit_cost, catalogPrice: row.catalog_price, supplierDescriptions: row.supplier_description ? [row.supplier_description] : [] }));
  }

  async findCustomer(customerId, effectiveOn) {
    const customers = await this.fetchCustomers(effectiveOn);
    return customers.find((customer) => customer.id === customerId) ?? null;
  }

  async findProductsByIds(supplierId, productIds, effectiveOn, customerId) {
    const products = await this.fetchProductsForSupplier(supplierId, effectiveOn, customerId);
    const byId = new Map(products.map((product) => [product.id, product]));
    return productIds.map((id) => byId.get(id) ?? null);
  }
}
