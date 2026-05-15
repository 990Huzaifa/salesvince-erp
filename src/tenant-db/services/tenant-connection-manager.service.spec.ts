import { NotFoundException } from '@nestjs/common';
import { createTenantDataSource } from '../tenant-datasource.factory';
import { TenantConnectionManager } from './tenant-connection-manager.service';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';

jest.mock('../tenant-datasource.factory', () => ({
  createTenantDataSource: jest.fn(),
}));

type MockRepo = {
  findOne: jest.Mock;
};

const mockedFactory = createTenantDataSource as jest.MockedFunction<
  typeof createTenantDataSource
>;

describe('TenantConnectionManager', () => {
  const tenantId = '9696f8a5-1e2f-4695-8a1f-7f094a036fef';
  let repo: MockRepo;
  let service: TenantConnectionManager;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
    };
    service = new TenantConnectionManager(repo as never);
    mockedFactory.mockReset();
  });

  it('reuses same pool for same tenant', async () => {
    repo.findOne.mockResolvedValue({
      host: 'localhost',
      port: 5432,
      username: 'u',
      password: 'p',
      database: 'db',
      tenant: { id: tenantId },
    } as TenantDbConfig);

    const initializedConnection = {
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      isInitialized: true,
    };
    mockedFactory.mockReturnValue(initializedConnection as never);

    const first = await service.getConnection(tenantId);
    const second = await service.getConnection(tenantId);

    expect(first).toBe(second);
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    expect(mockedFactory).toHaveBeenCalledTimes(1);
  });

  it('creates different pools for different tenants', async () => {
    repo.findOne
      .mockResolvedValueOnce({
        host: 'localhost',
        port: 5432,
        username: 'u1',
        password: 'p1',
        database: 'db1',
        tenant: { id: 't-1' },
      } as TenantDbConfig)
      .mockResolvedValueOnce({
        host: 'localhost',
        port: 5432,
        username: 'u2',
        password: 'p2',
        database: 'db2',
        tenant: { id: 't-2' },
      } as TenantDbConfig);

    const connOne = {
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      isInitialized: true,
    };
    const connTwo = {
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      isInitialized: true,
    };
    mockedFactory.mockReturnValueOnce(connOne as never).mockReturnValueOnce(
      connTwo as never,
    );

    const first = await service.getConnection('t-1');
    const second = await service.getConnection('t-2');

    expect(first).not.toBe(second);
    expect(repo.findOne).toHaveBeenCalledTimes(2);
    expect(mockedFactory).toHaveBeenCalledTimes(2);
  });

  it('removes failed initialization cache and allows retry', async () => {
    repo.findOne.mockResolvedValue({
      host: 'localhost',
      port: 5432,
      username: 'u',
      password: 'p',
      database: 'db',
      tenant: { id: tenantId },
    } as TenantDbConfig);

    const badConnection = {
      initialize: jest.fn().mockRejectedValue(new Error('init failed')),
      destroy: jest.fn().mockResolvedValue(undefined),
      isInitialized: false,
    };
    const goodConnection = {
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      isInitialized: true,
    };
    mockedFactory
      .mockReturnValueOnce(badConnection as never)
      .mockReturnValueOnce(goodConnection as never);

    await expect(service.getConnection(tenantId)).rejects.toThrow('init failed');

    const recovered = await service.getConnection(tenantId);
    expect(recovered).toBe(goodConnection);
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('throws when tenant config is missing', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.getConnection('missing-tenant')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
