export type ProvisioningDatabaseConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim() !== '');
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required for database provisioning`);
  }

  return value;
}

/**
 * Provisioning has its own variables, but older deployments only provide the
 * master/tenant connection variables. Keep those deployments working while
 * allowing PROVISION_DB_* to take precedence when configured.
 */
export function getProvisioningDatabaseConfig(): ProvisioningDatabaseConfig {
  const host = required(
    'PROVISION_DB_HOST (or MASTER_DB_HOST/TENANT_DB_HOST)',
    firstDefined(
      process.env.PROVISION_DB_HOST,
      process.env.TENANT_DB_HOST,
      process.env.MASTER_DB_HOST,
    ),
  );
  const portValue = required(
    'PROVISION_DB_PORT (or TENANT_DB_PORT/MASTER_DB_PORT)',
    firstDefined(
      process.env.PROVISION_DB_PORT,
      process.env.TENANT_DB_PORT,
      process.env.MASTER_DB_PORT,
    ),
  );
  const username = required(
    'PROVISION_DB_USER (or MASTER_DB_USER)',
    firstDefined(process.env.PROVISION_DB_USER, process.env.MASTER_DB_USER),
  );
  const password = required(
    'PROVISION_DB_PASS (or MASTER_DB_PASS)',
    firstDefined(process.env.PROVISION_DB_PASS, process.env.MASTER_DB_PASS),
  );
  const database = required(
    'PROVISION_DB_NAME (or MASTER_DB_NAME)',
    firstDefined(process.env.PROVISION_DB_NAME, process.env.MASTER_DB_NAME),
  );
  const port = Number(portValue);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid database port: ${portValue}`);
  }

  return { host, port, username, password, database };
}

export function getTenantDatabaseLocation(): Pick<
  ProvisioningDatabaseConfig,
  'host' | 'port'
> {
  const config = getProvisioningDatabaseConfig();
  return { host: config.host, port: config.port };
}
