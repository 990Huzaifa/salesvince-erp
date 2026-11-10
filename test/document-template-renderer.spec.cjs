const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DocumentTemplateRendererService } = require('../dist/src/tenant/service/document-template-renderer.service');
const { resolvePrintThemeColors } = require('../dist/src/common/pdf/print-theme-colors');

const template = (id, overrides = {}) => ({
  id, code: id, name: id, status: 'ACTIVE',
  items: [{ documentType: 'REPORT', isActive: true, sourceType: 'INLINE', content: `<h1>${id}: {{companyInfo.name}}</h1>` }],
  ...overrides,
});

function setup({ selected = null, assigned = [], records = [], missingSettings = false } = {}) {
  const fallbackCalls = [];
  const renderer = new DocumentTemplateRendererService(
    { findOne: async ({ where }) => records.find((pack) => pack.id === where.id && pack.status === where.status) || null },
    { resolveForTenant: async () => resolvePrintThemeColors({ primaryColor: '#9786ee' }) },
    {
      getDocumentTemplatesByTenantId: async (tenantId) => { fallbackCalls.push(tenantId); return assigned; },
      getTenantSettingsByTenantId: async () => ({ timezone: 'Asia/Karachi' }),
    },
  );
  const db = { getRepository: () => ({ findOne: async () => missingSettings ? null : { defaultDocumentTemplateId: selected } }) };
  const render = (type = 'REPORT', data = { companyInfo: { name: 'Eeman & Co' } }) =>
    renderer.render(db, 'business-id', type, data, 'tenant-id');
  return { render, fallbackCalls };
}

test('PDF uses the assigned default when the business has no saved selection', async () => {
  const { render, fallbackCalls } = setup({
    assigned: [{ id: 'first' }, { id: 'preferred', isDefault: true }],
    records: [template('first'), template('preferred')],
  });
  const html = await render();
  assert.match(html, /preferred: Eeman &amp; Co/);
  assert.match(html, /#9786ee/);
  assert.deepEqual(fallbackCalls, ['tenant-id']);
});

test('an explicit business selection keeps precedence over the tenant default', async () => {
  const { render, fallbackCalls } = setup({
    selected: 'business-choice', assigned: [{ id: 'tenant-default', isDefault: true }],
    records: [template('business-choice'), template('tenant-default')],
  });
  assert.match(await render(), /business-choice: Eeman &amp; Co/);
  assert.deepEqual(fallbackCalls, []);
});

test('missing business settings uses the global default returned for the tenant', async () => {
  const { render } = setup({ missingSettings: true, assigned: [{ id: 'global-default' }], records: [template('global-default')] });
  assert.match(await render(), /global-default: Eeman &amp; Co/);
});

test('the first assigned pack is used when none is marked default', async () => {
  const { render } = setup({ assigned: [{ id: 'first' }, { id: 'second' }], records: [template('first'), template('second')] });
  assert.match(await render(), /first: Eeman &amp; Co/);
});

test('unconfigured businesses still receive a clear missing-template error', async () => {
  await assert.rejects(setup().render(), /No document template is selected/);
});

test('an inactive explicit selection is not silently replaced', async () => {
  const { render } = setup({ selected: 'inactive', assigned: [{ id: 'fallback' }], records: [template('inactive', { status: 'INACTIVE' }), template('fallback')] });
  await assert.rejects(render(), /selected document template is not active/);
});

test('Classic warehouse slips and reports render through the fallback without saved sub-templates', async () => {
  const { render } = setup({ assigned: [{ id: 'classic' }], records: [template('classic', { items: [] })] });
  const companyInfo = { name: 'Eeman Trader' };
  const slipHtml = await render('WAREHOUSE_SLIP', {
    companyInfo,
    slip: { documentNumber: 'OS-00002', documentDate: '2026-11-09', sourceType: 'OPENING_STOCK', items: [{ productName: 'Test Product', uom: 'PCS', quantity: 5 }] },
  });
  assert.match(slipHtml, /OS-00002/);
  assert.match(slipHtml, /Test Product/);
  const reportHtml = await render('REPORT', {
    companyInfo,
    report: { title: 'Customer Balance Report', layout: 'balance', business: companyInfo, preparedBy: 'Admin', filters: [], summary: [], sections: [{ columns: [{ key: 'name', label: 'Name' }, { key: 'currentBalance', label: 'Current Balance', format: 'amount' }], rows: [{ name: 'Test Customer', currentBalance: 13060 }] }] },
  });
  assert.match(reportHtml, /Customer Balance Report/);
  assert.match(reportHtml, /Test Customer/);
  assert.match(reportHtml, /13,060/);
});
