import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Role, RoleStatus } from 'src/tenant-db/entities/role.entity';
import { Permission } from 'src/tenant-db/entities/permission.entity';
import { User, UserStatus } from 'src/tenant-db/entities/user.entity';

@Injectable()
export class TenantUtilityService {
  private async getUsersByRoleCode(tenantDb: DataSource, roleCode: string) {
    const users = await tenantDb.getRepository(User).find({
      where: {
        status: UserStatus.ACTIVE,
      },
      relations: { userBusinesses: true },
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        userBusinesses: { role: { id: true, name: true } }
      },
      order: { name: 'ASC' },
    });

    return { result: users };
  }

  async getSalesmanUsers(tenantDb: DataSource) {
    return this.getUsersByRoleCode(tenantDb, 'SALESMAN');
  }

  async getMerchandiserUsers(tenantDb: DataSource) {
    return this.getUsersByRoleCode(tenantDb, 'MERCHANDISER');
  }

  async getRoles(tenantDb: DataSource) {
    const roles = await tenantDb.getRepository(Role).find({
      where: { status: RoleStatus.ACTIVE },
      select: {
        id: true,
        name: true,
      },
      order: { name: 'ASC' },
    });
    return { result: roles };
    }

  async getPermissions(tenantDb: DataSource) {
    const permissions = await tenantDb.getRepository(Permission).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });

    return { result: permissions };
  }

}
