import { EntityManager, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../entities/chart-of-account.entity';
import { Service } from '../entities/service.entity';
import { COA_PARENT_CODES } from '../chart-of-accounts/constants/coa-parent-codes';
import {
  ensureDefaultChartOfAccountNodes,
  nextChildAccountCode,
  parseAccountCodeLevels,
  seedDefaultChartOfAccountsForBusiness,
} from './chart-of-account-bootstrap.helper';

/**
 * Creates (or returns the existing) postable account for a service under the
 * "Services" group (1-1-5), and links it both ways:
 * `service.chartOfAccountId` and `chartOfAccount.serviceId`.
 */
export async function createChartOfAccountForService(
  manager: EntityManager,
  service: Service,
): Promise<ChartOfAccount> {
  const coaRepo = manager.getRepository(ChartOfAccount);
  const serviceRepo = manager.getRepository(Service);

  const existing = await coaRepo.findOne({
    where: {
      businessId: service.businessId,
      serviceId: service.id,
      accountKind: ChartOfAccountKind.SERVICE,
      deletedAt: IsNull(),
    },
  });
  if (existing) {
    await serviceRepo.update(service.id, { chartOfAccountId: existing.id });
    service.chartOfAccountId = existing.id;
    return existing;
  }

  await seedDefaultChartOfAccountsForBusiness(manager, service.businessId);
  // Older businesses may not have the 1-1-5 group yet.
  await ensureDefaultChartOfAccountNodes(manager, service.businessId);

  const parentCode = COA_PARENT_CODES.SERVICES;
  const code = await nextChildAccountCode(
    coaRepo,
    service.businessId,
    parentCode,
  );

  const account = await coaRepo.save(
    coaRepo.create({
      businessId: service.businessId,
      partyId: null,
      employeeId: null,
      productCategoryId: null,
      productSubCategoryId: null,
      productId: null,
      serviceId: service.id,
      accountKind: ChartOfAccountKind.SERVICE,
      code,
      parentCode,
      name: `${service.name} (${service.code})`,
      isPostable: true,
      ...parseAccountCodeLevels(code),
    }),
  );

  await serviceRepo.update(service.id, { chartOfAccountId: account.id });
  service.chartOfAccountId = account.id;
  return account;
}
