import { NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../entities/chart-of-account.entity';
import { Party, PartyType } from '../entities/party.entity';
import { COA_PARENT_CODES } from '../chart-of-accounts/constants/coa-parent-codes';
import {
  nextChildAccountCode,
  parseAccountCodeLevels,
} from './chart-of-account-bootstrap.helper';

async function createPartyLinkedAccount(
  manager: EntityManager,
  params: {
    businessId: string;
    partyId: string;
    partyName: string;
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
      partyId: params.partyId,
      accountKind: params.accountKind,
      code,
      parentCode: params.parentCode,
      name: `${params.partyName} - ${params.label}`,
      isPostable: true,
      ...levels,
    }),
  );
}

export type PartyChartOfAccountsResult = {
  receivableAccount: ChartOfAccount | null;
  payableAccount: ChartOfAccount | null;
};

/**
 * Creates postable COA leaf accounts for a party based on party type.
 */
export async function createChartOfAccountsForParty(
  manager: EntityManager,
  party: Party,
): Promise<PartyChartOfAccountsResult> {
  const needsReceivable =
    party.type === PartyType.CUSTOMER || party.type === PartyType.BOTH;
  const needsPayable =
    party.type === PartyType.VENDOR || party.type === PartyType.BOTH;

  let receivableAccount: ChartOfAccount | null = null;
  let payableAccount: ChartOfAccount | null = null;

  if (needsReceivable) {
    receivableAccount = await createPartyLinkedAccount(manager, {
      businessId: party.businessId,
      partyId: party.id,
      partyName: party.name,
      parentCode: COA_PARENT_CODES.CUSTOMER_RECEIVABLES,
      accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
      label: 'Receivable',
    });
  }

  if (needsPayable) {
    payableAccount = await createPartyLinkedAccount(manager, {
      businessId: party.businessId,
      partyId: party.id,
      partyName: party.name,
      parentCode: COA_PARENT_CODES.VENDOR_PAYABLES,
      accountKind: ChartOfAccountKind.PARTY_PAYABLE,
      label: 'Payable',
    });
  }

  return { receivableAccount, payableAccount };
}

export async function softDeletePartyChartOfAccounts(
  manager: EntityManager,
  partyId: string,
): Promise<void> {
  const coaRepo = manager.getRepository(ChartOfAccount);
  const accounts = await coaRepo.find({
    where: { partyId, deletedAt: IsNull() },
  });
  const now = new Date();
  for (const account of accounts) {
    account.deletedAt = now;
  }
  if (accounts.length > 0) {
    await coaRepo.save(accounts);
  }
}
