import { NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../entities/chart-of-account.entity';
import { Employee } from '../entities/hr/employee.entity';
import { COA_PARENT_CODES } from '../chart-of-accounts/constants/coa-parent-codes';
import {
  ensureDefaultChartOfAccountNodes,
  nextChildAccountCode,
  parseAccountCodeLevels,
} from './chart-of-account-bootstrap.helper';

async function createEmployeeLinkedAccount(
  manager: EntityManager,
  params: {
    businessId: string;
    employeeId: string;
    employeeName: string;
    parentCode: string;
    accountKind: ChartOfAccountKind;
    label: string;
  },
): Promise<ChartOfAccount> {
  const coaRepo = manager.getRepository(ChartOfAccount);

  const parent = await coaRepo.findOne({
    where: {
      businessId: params.businessId,
      code: params.parentCode,
      deletedAt: IsNull(),
    },
  });
  if (!parent) {
    throw new NotFoundException(
      `Parent chart of account "${params.parentCode}" not found. Seed default COA first.`,
    );
  }

  const code = await nextChildAccountCode(
    coaRepo,
    params.businessId,
    params.parentCode,
  );
  const levels = parseAccountCodeLevels(code);

  return coaRepo.save(
    coaRepo.create({
      businessId: params.businessId,
      employeeId: params.employeeId,
      accountKind: params.accountKind,
      code,
      parentCode: params.parentCode,
      name: `${params.employeeName} - ${params.label}`,
      isPostable: true,
      partyId: null,
      ...levels,
    }),
  );
}

export type EmployeeChartOfAccountsResult = {
  salaryPayableAccount: ChartOfAccount;
};

export async function createChartOfAccountsForEmployee(
  manager: EntityManager,
  employee: Employee,
): Promise<EmployeeChartOfAccountsResult> {
  await ensureDefaultChartOfAccountNodes(manager, employee.businessId);

  const salaryPayableAccount = await createEmployeeLinkedAccount(manager, {
    businessId: employee.businessId,
    employeeId: employee.id,
    employeeName: employee.fullName,
    parentCode: COA_PARENT_CODES.SALARIES_PAYABLE,
    accountKind: ChartOfAccountKind.EMPLOYEE_SALARY_PAYABLE,
    label: 'Salary Payable',
  });

  return { salaryPayableAccount };
}

export async function softDeleteEmployeeChartOfAccounts(
  manager: EntityManager,
  employeeId: string,
): Promise<void> {
  const coaRepo = manager.getRepository(ChartOfAccount);
  const accounts = await coaRepo.find({
    where: { employeeId, deletedAt: IsNull() },
  });
  const now = new Date();
  for (const account of accounts) {
    account.deletedAt = now;
  }
  if (accounts.length > 0) {
    await coaRepo.save(accounts);
  }
}
