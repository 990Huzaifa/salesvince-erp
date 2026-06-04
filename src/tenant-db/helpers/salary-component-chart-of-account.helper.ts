import { NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../entities/chart-of-account.entity';
import { SalaryComponent } from '../entities/hr/salary-component.entity';
import {
  ComponentTypeEnum,
} from '../entities/hr/hr.enums';
import { COA_PARENT_CODES } from '../chart-of-accounts/constants/coa-parent-codes';
import {
  ensureDefaultChartOfAccountNodes,
  nextChildAccountCode,
  parseAccountCodeLevels,
} from './chart-of-account-bootstrap.helper';

const PF_CODE_HINTS = ['pf', 'provident', 'eobi', 'ss', 'social'];
const TAX_CODE_HINTS = ['tax', 'income', 'withholding', 'wht'];

function resolveDeductionParentCode(code: string, isTaxable: boolean): string {
  const normalized = code.toLowerCase();
  if (TAX_CODE_HINTS.some((hint) => normalized.includes(hint)) || isTaxable) {
    return COA_PARENT_CODES.TAX_PAYABLE;
  }
  if (PF_CODE_HINTS.some((hint) => normalized.includes(hint))) {
    return COA_PARENT_CODES.PROVIDENT_FUND_PAYABLE;
  }
  return COA_PARENT_CODES.PROVIDENT_FUND_PAYABLE;
}

export async function createChartOfAccountForSalaryComponent(
  manager: EntityManager,
  component: Pick<SalaryComponent, 'businessId' | 'name' | 'code' | 'componentType' | 'isTaxable'>,
): Promise<ChartOfAccount> {
  await ensureDefaultChartOfAccountNodes(manager, component.businessId);

  const parentCode =
    component.componentType === ComponentTypeEnum.EARNING
      ? COA_PARENT_CODES.BUSINESS_EXPENSE
      : resolveDeductionParentCode(component.code, component.isTaxable);

  const label =
    component.componentType === ComponentTypeEnum.EARNING ? 'Expense' : 'Payable';

  const coaRepo = manager.getRepository(ChartOfAccount);
  const parent = await coaRepo.findOne({
    where: {
      businessId: component.businessId,
      code: parentCode,
      deletedAt: IsNull(),
    },
  });
  if (!parent) {
    throw new NotFoundException(
      `Parent chart of account "${parentCode}" not found. Seed default COA first.`,
    );
  }

  const accountCode = await nextChildAccountCode(
    coaRepo,
    component.businessId,
    parentCode,
  );
  const levels = parseAccountCodeLevels(accountCode);

  return coaRepo.save(
    coaRepo.create({
      businessId: component.businessId,
      code: accountCode,
      parentCode,
      name: `${component.name} - ${label}`,
      isPostable: true,
      accountKind: ChartOfAccountKind.BUSINESS,
      partyId: null,
      employeeId: null,
      ...levels,
    }),
  );
}
