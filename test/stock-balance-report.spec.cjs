const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { join } = require('node:path');
const { DataSource } = require('typeorm');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { GetStockBalanceDto } = require('../dist/src/tenant/dto/inventory/get-stock-balance.dto');
const { InventoryBalanceService } = require('../dist/src/tenant/service/inventory/inventory-balance.service');
const { ReportPdfService } = require('../dist/src/tenant/service/report/report-pdf.service');
const { DocumentTemplateRendererService } = require('../dist/src/tenant/service/document-template-renderer.service');
const { resolvePrintThemeColors } = require('../dist/src/common/pdf/print-theme-colors');
const { Business } = require('../dist/src/tenant-db/entities/business.entity');
const { BusinessSettings } = require('../dist/src/tenant-db/entities/business-settings.entity');
const { User } = require('../dist/src/tenant-db/entities/user.entity');

let db;
before(async () => {
  db = new DataSource({
    type: 'postgres',
    entities: [
      join(__dirname, '../dist/src/tenant-db/entities/**/*.entity.js'),
      join(__dirname, '../dist/src/master-db/entities/**/*.entity.js'),
    ],
  });
  await db.buildMetadatas();
});

const stockRows = (count) => Array.from({ length: count }, (_, index) => ({
  id: `balance-${index}`, productId: `product-${index}`, productName: `Product & ${index}`,
  productSkuCode: `SKU-${index}`, warehouseId: 'warehouse-id', warehouseName: 'Main Warehouse',
  uomId: 'uom-id', uomName: 'PCS', quantityAvailable: '12', quantityOnHand: '15',
  quantityReserved: '2', quantityDamaged: '1', updatedAt: new Date('2026-11-19T09:00:00Z'),
}));

// Run real TypeORM query builders, replacing only database I/O.
function queryDatabase(rows) {
  const queries = [];
  const originalCreateRunner = db.createQueryRunner.bind(db);
  const originalGetRepository = db.getRepository.bind(db);
  const connection = Object.create(db);
  connection.createQueryRunner = (...args) => {
    const runner = originalCreateRunner(...args);
    runner.query = async (sql, parameters) => {
      queries.push({ sql, parameters });
      let records;
      if (/^SELECT COUNT/.test(sql)) {
        records = [{ total: String(rows.length) }];
      } else if (sql.includes('FROM "stock_balances" "balance"')) {
        const offset = Number(sql.match(/ OFFSET (\d+)/)?.[1] || 0);
        const limit = Number(sql.match(/ LIMIT (\d+)/)?.[1] || rows.length);
        records = rows.slice(offset, offset + limit);
      } else {
        records = rows.filter((row) => parameters.includes(row.productId))
          .map((row, index) => ({ ...row, quantity: String(index + 1) }));
      }
      return { records, raw: records };
    };
    return runner;
  };
  connection.getRepository = (entity) => {
    if (entity === Business) return { findOne: async () => ({ name: 'Eeman & Co', currency: 'PKR' }) };
    if (entity === User) return { findOne: async () => ({ name: 'Tester' }) };
    if (entity === BusinessSettings) return { findOne: async () => ({ defaultDocumentTemplateId: 'classic' }) };
    const repository = Object.create(originalGetRepository(entity));
    repository.manager = connection.manager;
    repository.createQueryBuilder = (alias) => connection.createQueryBuilder(entity, alias);
    return repository;
  };
  return { connection, queries };
}

test('stock balance accepts the screen filters and rejects malformed values', async () => {
  const uuid = 'a7a2855d-8261-4cac-8b3c-773baea93b9c';
  const valid = plainToInstance(GetStockBalanceDto, {
    scope: 'warehouse', warehouseId: uuid, brandId: uuid, partyId: uuid,
    fromDate: '2026-11-01', toDate: '2026-11-19', page: '2', limit: '50',
  });
  assert.deepEqual(await validate(valid, { whitelist: true, forbidNonWhitelisted: true }), []);
  for (const input of [{ brandId: 'invalid' }, { fromDate: 'invalid' }, { limit: 101 }]) {
    assert.ok((await validate(plainToInstance(GetStockBalanceDto, input))).length > 0);
  }
});

test('print/export includes every row while normal stock requests stay paginated', async () => {
  const { connection, queries } = queryDatabase(stockRows(205));
  const service = new InventoryBalanceService();
  const query = plainToInstance(GetStockBalanceDto, { page: 3, limit: 10 });
  const page = await service.list(connection, 'business-id', query);
  assert.equal(page.data.length, 10);
  assert.equal(page.data[0].productId, 'product-20');
  const report = await service.list(connection, 'business-id', query, true);
  assert.equal(report.data.length, 205);
  assert.equal(report.data.at(-1).productId, 'product-204');
  assert.ok(report.data.at(-1).lastPurchaseQty > 0);
  const stockSql = queries.filter(({ sql }) => sql.includes('FROM "stock_balances" "balance"') && !sql.startsWith('SELECT COUNT'));
  assert.match(stockSql[0].sql, /LIMIT 10 OFFSET 20/);
  assert.doesNotMatch(stockSql[1].sql, /\bLIMIT\b|\bOFFSET\b/);
  assert.ok(queries.every(({ parameters }) => parameters.length < 500));
});

test('all scopes keep tenant, vendor, brand, SKU and inclusive date filters for exports', async () => {
  for (const scope of ['all', 'warehouse', 'auto']) {
    const { connection, queries } = queryDatabase(stockRows(1));
    const query = plainToInstance(GetStockBalanceDto, {
      scope, warehouseId: scope === 'warehouse' ? 'warehouse-id' : undefined,
      brandId: 'brand-id', partyId: 'vendor-id', search: ' SKU-0 ',
      fromDate: '2026-11-19', toDate: '2026-11-19',
    });
    const report = await new InventoryBalanceService().list(connection, 'business-id', query, true);
    assert.equal(report.data.length, 1);
    for (const { sql, parameters } of queries.filter(({ sql }) => sql.includes('FROM "stock_balances" "balance"'))) {
      assert.match(sql, /"balance"\."businessId" = \$\d+/);
      assert.match(sql, /"product"\."brandId" = \$\d+/);
      assert.match(sql, /\("product"\."name" ILIKE \$\d+ OR "product"\."skuCode" ILIKE \$\d+\)/);
      assert.match(sql, /"balance"\."updatedAt" < CAST\(\$\d+ AS date\) \+ INTERVAL '1 day'/);
      assert.match(sql, /EXISTS .*"batchs"/);
      for (const value of ['business-id', 'brand-id', 'vendor-id', '%SKU-0%', '2026-11-19']) {
        assert.ok(parameters.includes(value));
      }
      if (scope === 'warehouse') assert.ok(parameters.includes('warehouse-id'));
    }
    if (scope === 'auto') {
      assert.equal(report.data[0].warehouseId, undefined);
      assert.ok(report.data[0].updatedAt);
    }
  }
});

test('export rejects missing business/warehouse context and reversed dates', async () => {
  const service = new InventoryBalanceService();
  await assert.rejects(service.list(null, undefined, {}, true), /Business context is required/);
  await assert.rejects(service.list(null, 'business-id', { scope: 'warehouse' }, true), /warehouseId is required/);
  await assert.rejects(service.list(null, 'business-id', { fromDate: '2026-11-20', toDate: '2026-11-19' }, true), /fromDate cannot be greater/);
});

function reportService(capture) {
  const templateRenderer = new DocumentTemplateRendererService(
    { findOne: async () => ({ code: 'classic', name: 'Classic', status: 'ACTIVE', items: [] }) },
    { resolveForTenant: async () => resolvePrintThemeColors() },
    { getTenantSettingsByTenantId: async () => ({ timezone: 'Asia/Karachi' }) },
  );
  return new ReportPdfService(null, null, null, null,
    { renderHtmlToPdf: async (options) => { capture.push(options); return Buffer.from('%PDF-test'); } },
    { fetchLogoDataUri: async () => null }, templateRenderer, new InventoryBalanceService());
}

test('Classic PDF renders all stock columns and rows using the same report as printing', async () => {
  const { connection } = queryDatabase(stockRows(205));
  const captured = [];
  const service = reportService(captured);
  const report = await service.getStockBalanceReport(connection, 'business-id', new GetStockBalanceDto());
  assert.equal(report.sections[0].rows.length, 205);
  assert.equal(report.sections[0].rows.at(-1).serial, 205);
  const pdf = await service.generateStockBalancePdf(connection, 'business-id', 'user-id', new GetStockBalanceDto(), 'tenant-id');
  assert.equal(pdf.filename, 'Stock-Balance-Report.pdf');
  assert.equal(captured[0].enforceSinglePage, false);
  assert.match(captured[0].html, /Product &amp; 204/);
  assert.match(captured[0].html, /Available Qty/);
  assert.match(captured[0].html, /Last Purchase Qty/);
  assert.match(captured[0].html, /Main Warehouse/);
  assert.match(captured[0].html, /Eeman &amp; Co/);
});

test('small stock reports include only populated rows without blank padding', async () => {
  const { connection } = queryDatabase(stockRows(8));
  const captured = [];
  await reportService(captured).generateStockBalancePdf(connection, 'business-id', 'user-id', new GetStockBalanceDto());
  assert.equal((captured[0].html.match(/<tr class="row-[ab]">/g) || []).length, 8);
  assert.doesNotMatch(captured[0].html, /<tr class="empty-row /);
});

test('empty stock reports remain printable and downloadable', async () => {
  const { connection } = queryDatabase([]);
  const captured = [];
  const service = reportService(captured);
  const report = await service.getStockBalanceReport(connection, 'business-id', new GetStockBalanceDto());
  assert.deepEqual(report.sections[0].rows, []);
  await service.generateStockBalancePdf(connection, 'business-id', 'user-id', new GetStockBalanceDto());
  assert.match(captured[0].html, /No stock balance records found/);
});
