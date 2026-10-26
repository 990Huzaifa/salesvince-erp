import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Business } from '../entities/business.entity';
import { Party, PartyType } from '../entities/party.entity';
import { seedDefaultChartOfAccountsForBusiness } from '../helpers/chart-of-account-bootstrap.helper';
import { createChartOfAccountsForParty } from '../helpers/party-chart-of-account.helper';

/** Stable code so the seeder is idempotent across business re-seeds. */
export const WALKIN_CUSTOMER_CODE = 'CUS-WALKIN';
export const WALKIN_CUSTOMER_NAME = 'Walkin Customer';

type TenantDb = DataSource | EntityManager;

async function ensureReceivableAccount(
  manager: EntityManager,
  businessId: string,
  party: Party,
): Promise<Party> {
  const partyRepo = manager.getRepository(Party);

  if (party.receivableAccountId) {
    return partyRepo.findOneOrFail({
      where: { id: party.id },
      relations: { receivableAccount: true },
    });
  }

  await seedDefaultChartOfAccountsForBusiness(manager, businessId);
  const { receivableAccount } = await createChartOfAccountsForParty(
    manager,
    party,
  );
  party.receivableAccountId = receivableAccount?.id ?? null;
  await partyRepo.save(party);

  return partyRepo.findOneOrFail({
    where: { id: party.id },
    relations: { receivableAccount: true },
  });
}

async function ensureWalkinCustomerInManager(
  manager: EntityManager,
  businessId: string,
): Promise<Party> {
  const partyRepo = manager.getRepository(Party);

  // 1) Exact code — unique on (businessId, code), including soft-deleted.
  //    Never generate a new walkin if this code already exists.
  const byCode = await partyRepo.findOne({
    where: { businessId, code: WALKIN_CUSTOMER_CODE },
    withDeleted: true,
  });

  if (byCode) {
    if (byCode.deletedAt) {
      await partyRepo.recover(byCode);
      byCode.deletedAt = null;
    }
    if (byCode.name !== WALKIN_CUSTOMER_NAME) {
      byCode.name = WALKIN_CUSTOMER_NAME;
      await partyRepo.save(byCode);
    }
    return ensureReceivableAccount(manager, businessId, byCode);
  }

  // 2) Reuse an active customer that already has the Walkin name (legacy rows
  //    created with an auto code). Do not insert another party.
  const byName = await partyRepo.findOne({
    where: {
      businessId,
      name: WALKIN_CUSTOMER_NAME,
      type: PartyType.CUSTOMER,
      deletedAt: IsNull(),
    },
  });

  if (byName) {
    return ensureReceivableAccount(manager, businessId, byName);
  }

  // 3) Create once with the fixed code — never an auto-generated CUS-#####.
  await seedDefaultChartOfAccountsForBusiness(manager, businessId);

  let party = await partyRepo.save(
    partyRepo.create({
      businessId,
      code: WALKIN_CUSTOMER_CODE,
      name: WALKIN_CUSTOMER_NAME,
      type: PartyType.CUSTOMER,
      partyClass: null,
      creditLimit: null,
      payableOpeningBalance: 0,
      receivableOpeningBalance: 0,
      email: null,
      phone: null,
      whatsAppNumber: null,
      alternatePhone: null,
      ntnNumber: null,
      strnNumber: null,
      cnic: null,
      countryId: null,
      stateId: null,
      cityId: null,
      taxNumber: null,
      address: null,
    }),
  );

  const { receivableAccount } = await createChartOfAccountsForParty(
    manager,
    party,
  );

  party.receivableAccountId = receivableAccount?.id ?? null;
  party.payableAccountId = null;
  party = await partyRepo.save(party);

  return partyRepo.findOneOrFail({
    where: { id: party.id },
    relations: { receivableAccount: true },
  });
}

/**
 * Ensures a default Walkin Customer exists for a business, with a postable
 * receivable COA (same path as a normal customer create).
 *
 * Idempotent: if `CUS-WALKIN` already exists (even soft-deleted), it is reused
 * / restored — a new party is never generated for that code.
 *
 * Safe inside an outer transaction (EntityManager) or as a standalone call (DataSource).
 */
export async function seedWalkinCustomerForBusiness(
  tenantDb: TenantDb,
  businessId: string,
): Promise<Party> {
  if (tenantDb instanceof DataSource) {
    return tenantDb.transaction((manager) =>
      ensureWalkinCustomerInManager(manager, businessId),
    );
  }
  return ensureWalkinCustomerInManager(tenantDb, businessId);
}

/**
 * Seeds Walkin Customer for every business in the tenant DB (idempotent).
 * Used from tenant seeders so re-runs cover existing businesses.
 */
export async function seedWalkinCustomersForAllBusinesses(
  dataSource: DataSource,
): Promise<void> {
  console.log('🌱 Seeding Walkin Customer for businesses...');

  const businesses = await dataSource.getRepository(Business).find({
    where: { deletedAt: IsNull() },
    select: ['id', 'code', 'name'],
  });

  if (!businesses.length) {
    console.log(
      '⏭ No businesses yet — Walkin Customer will be created on business create.\n',
    );
    return;
  }

  for (const business of businesses) {
    const party = await seedWalkinCustomerForBusiness(dataSource, business.id);
    console.log(
      `✅ Walkin Customer ready for business ${business.code}: ${party.code}`,
    );
  }

  console.log('🌱 Walkin Customer seeding completed.\n');
}
