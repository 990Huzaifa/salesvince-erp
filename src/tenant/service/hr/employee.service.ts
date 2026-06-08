import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import {
  Department,
  Designation,
  Employee,
  PayPolicy,
} from 'src/tenant-db/entities/hr';
import { CreateEmployeeDto } from '../../dto/hr/employee/create-employee.dto';
import { UpdateEmployeeDto } from '../../dto/hr/employee/update-employee.dto';
import { createChartOfAccountsForEmployee } from 'src/tenant-db/helpers/employee-chart-of-account.helper';
import { seedDefaultChartOfAccountsForBusiness } from 'src/tenant-db/helpers/chart-of-account-bootstrap.helper';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  buildFullName,
  generateSequentialCode,
  IsNull,
  parseDate,
} from './hr-common.util';

const EMPLOYEE_CODE_PREFIX = 'EMP';

@Injectable()
export class EmployeeService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private mapEmployee(employee: Employee) {
    return {
      id: employee.id,
      businessId: employee.businessId,
      departmentId: employee.departmentId,
      designationId: employee.designationId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      fullName: employee.fullName,
      fatherName: employee.fatherName,
      cnic: employee.cnic,
      email: employee.email,
      phone: employee.phone,
      emergencyContact: employee.emergencyContact,
      address: employee.address,
      gender: employee.gender,
      dateOfBirth: employee.dateOfBirth,
      maritalStatus: employee.maritalStatus,
      profileImage: employee.profileImage,
      joiningDate: employee.joiningDate,
      leavingDate: employee.leavingDate,
      employmentType: employee.employmentType,
      employeeStatus: employee.employeeStatus,
      shiftId: employee.shiftId,
      attendancePolicyId: employee.attendancePolicyId,
      leavePolicyId: employee.leavePolicyId,
      payPolicyId: employee.payPolicyId,
      salaryPaymentMethod: employee.salaryPaymentMethod,
      bankName: employee.bankName,
      bankAccountTitle: employee.bankAccountTitle,
      bankAccountNumber: employee.bankAccountNumber,
      iban: employee.iban,
      taxNumber: employee.taxNumber,
      salaryAccountId: employee.salaryAccountId,
      department: employee.department
        ? {
            id: employee.department.id,
            name: employee.department.name,
          }
        : null,
      designation: employee.designation
        ? {
            id: employee.designation.id,
            name: employee.designation.name,
          }
        : null,
      payPolicy: employee.payPolicy
        ? {
            id: employee.payPolicy.id,
            name: employee.payPolicy.name,
            code: employee.payPolicy.code,
          }
        : null,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  }

  private employeeRelations = {
    department: true,
    designation: true,
    payPolicy: true,
  };

  private async findForBusiness(
    tenantDb: DataSource,
    businessId: string,
    id: string,
  ): Promise<Employee> {
    const row = await tenantDb.getRepository(Employee).findOne({
      where: { id, businessId, deletedAt: IsNull() },
      relations: this.employeeRelations,
    });
    if (!row) {
      throw new NotFoundException('Employee not found');
    }
    return row;
  }

  private async assertDepartment(
    tenantDb: DataSource,
    businessId: string,
    departmentId: string,
  ): Promise<void> {
    const row = await tenantDb.getRepository(Department).findOne({
      where: { id: departmentId, businessId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Department not found');
    }
  }

  private async assertDesignation(
    tenantDb: DataSource,
    businessId: string,
    designationId: string,
  ): Promise<void> {
    const row = await tenantDb.getRepository(Designation).findOne({
      where: { id: designationId, businessId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Designation not found');
    }
  }

  private async assertPayPolicy(
    tenantDb: DataSource,
    businessId: string,
    payPolicyId?: string | null,
  ): Promise<void> {
    if (!payPolicyId) return;
    const row = await tenantDb.getRepository(PayPolicy).findOne({
      where: { id: payPolicyId, businessId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Pay policy not found');
    }
  }

  private async assertSalaryAccount(
    tenantDb: DataSource,
    businessId: string,
    accountId?: string | null,
  ): Promise<void> {
    if (!accountId) return;
    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: { id: accountId, businessId, deletedAt: IsNull() },
    });
    if (!account) {
      throw new NotFoundException('Salary account not found');
    }
  }

  private async assertUniqueEmployeeField(
    tenantDb: DataSource,
    businessId: string,
    field: 'employeeCode' | 'cnic' | 'email',
    value: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = tenantDb
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.businessId = :businessId', { businessId })
      .andWhere(`e.${field} = :value`, { value })
      .andWhere('e.deletedAt IS NULL');

    if (excludeId) {
      qb.andWhere('e.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(`Employee with this ${field} already exists`);
    }
  }

  private async resolveEmployeeCode(
    tenantDb: DataSource,
    businessId: string,
    employeeCode?: string,
    excludeId?: string,
  ): Promise<string> {
    const resolved =
      employeeCode?.trim() ||
      (await generateSequentialCode(
        tenantDb,
        Employee,
        'e',
        'employeeCode',
        EMPLOYEE_CODE_PREFIX,
      ));

    await this.assertUniqueEmployeeField(
      tenantDb,
      businessId,
      'employeeCode',
      resolved,
      excludeId,
    );
    return resolved;
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateEmployeeDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const firstName = dto.firstName.trim();
    if (!firstName) {
      throw new BadRequestException('First name is required');
    }

    await this.assertDepartment(tenantDb, scopedBusinessId, dto.departmentId);
    await this.assertDesignation(tenantDb, scopedBusinessId, dto.designationId);
    await this.assertPayPolicy(tenantDb, scopedBusinessId, dto.payPolicyId);
    await this.assertSalaryAccount(
      tenantDb,
      scopedBusinessId,
      dto.salaryAccountId,
    );

    const employeeCode = await this.resolveEmployeeCode(
      tenantDb,
      scopedBusinessId,
      dto.employeeCode,
    );

    if (dto.cnic?.trim()) {
      await this.assertUniqueEmployeeField(
        tenantDb,
        scopedBusinessId,
        'cnic',
        dto.cnic.trim(),
      );
    }
    if (dto.email?.trim()) {
      await this.assertUniqueEmployeeField(
        tenantDb,
        scopedBusinessId,
        'email',
        dto.email.trim().toLowerCase(),
      );
    }

    const fullName = buildFullName(firstName, dto.lastName);
    const joiningDate = parseDate(dto.joiningDate, 'joiningDate');
    const leavingDate = dto.leavingDate
      ? parseDate(dto.leavingDate, 'leavingDate')
      : null;
    if (leavingDate && leavingDate < joiningDate) {
      throw new BadRequestException(
        'leavingDate must be on or after joiningDate',
      );
    }

    await seedDefaultChartOfAccountsForBusiness(tenantDb, scopedBusinessId);

    const created = await tenantDb.transaction(async (manager) => {
      let employee = await manager.save(
        manager.create(Employee, {
          businessId: scopedBusinessId,
          departmentId: dto.departmentId,
          designationId: dto.designationId,
          employeeCode,
          firstName,
          lastName: dto.lastName?.trim() ?? null,
          fullName,
          fatherName: dto.fatherName?.trim() ?? null,
          cnic: dto.cnic?.trim() ?? null,
          email: dto.email?.trim().toLowerCase() ?? null,
          phone: dto.phone?.trim() ?? null,
          emergencyContact: dto.emergencyContact?.trim() ?? null,
          address: dto.address?.trim() ?? null,
          gender: dto.gender ?? null,
          dateOfBirth: dto.dateOfBirth
            ? parseDate(dto.dateOfBirth, 'dateOfBirth')
            : null,
          maritalStatus: dto.maritalStatus ?? null,
          profileImage: dto.profileImage ?? null,
          joiningDate,
          leavingDate,
          employmentType: dto.employmentType,
          employeeStatus: dto.employeeStatus,
          payPolicyId: dto.payPolicyId ?? null,
          salaryPaymentMethod: dto.salaryPaymentMethod ?? null,
          bankName: dto.bankName?.trim() ?? null,
          bankAccountTitle: dto.bankAccountTitle?.trim() ?? null,
          bankAccountNumber: dto.bankAccountNumber?.trim() ?? null,
          iban: dto.iban?.trim() ?? null,
          taxNumber: dto.taxNumber?.trim() ?? null,
          salaryAccountId: dto.salaryAccountId ?? null,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        }),
      );

      if (!employee.salaryAccountId) {
        const { salaryPayableAccount } = await createChartOfAccountsForEmployee(
          manager,
          employee,
        );
        employee.salaryAccountId = salaryPayableAccount.id;
        employee = await manager.save(employee);
      }

      return employee;
    });

    const full = await this.findForBusiness(
      tenantDb,
      scopedBusinessId,
      created.id,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'EMPLOYEE_CREATED',
      description: `Employee ${full.fullName} created`,
      metadata: { employeeId: full.id, employeeCode: full.employeeCode },
    });

    return { data: this.mapEmployee(full) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      departmentId?: string;
      designationId?: string;
      employeeStatus?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);

    const qb = tenantDb
      .getRepository(Employee)
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.department', 'department')
      .leftJoinAndSelect('e.designation', 'designation')
      .where('e.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('e.deletedAt IS NULL');

    if (options.departmentId) {
      qb.andWhere('e.departmentId = :departmentId', {
        departmentId: options.departmentId,
      });
    }
    if (options.designationId) {
      qb.andWhere('e.designationId = :designationId', {
        designationId: options.designationId,
      });
    }
    if (options.employeeStatus) {
      qb.andWhere('e.employeeStatus = :employeeStatus', {
        employeeStatus: options.employeeStatus,
      });
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('e.fullName ILIKE :search', { search })
            .orWhere('e.employeeCode ILIKE :search', { search })
            .orWhere('e.email ILIKE :search', { search })
            .orWhere('e.phone ILIKE :search', { search })
            .orWhere('e.cnic ILIKE :search', { search });
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('e.fullName', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'EMPLOYEE_LISTED',
      description: 'Employees listed',
      metadata: { total, page, limit },
    });

    return {
      data: rows.map((row) => this.mapEmployee(row)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const row = await this.findForBusiness(tenantDb, scopedBusinessId, id);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'EMPLOYEE_VIEWED',
      description: `Employee ${row.fullName} viewed`,
      metadata: { employeeId: row.id },
    });

    return { data: this.mapEmployee(row) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: UpdateEmployeeDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const row = await this.findForBusiness(tenantDb, scopedBusinessId, id);

    if (dto.departmentId !== undefined) {
      await this.assertDepartment(tenantDb, scopedBusinessId, dto.departmentId);
      row.departmentId = dto.departmentId;
    }
    if (dto.designationId !== undefined) {
      await this.assertDesignation(
        tenantDb,
        scopedBusinessId,
        dto.designationId,
      );
      row.designationId = dto.designationId;
    }
    if (dto.payPolicyId !== undefined) {
      await this.assertPayPolicy(tenantDb, scopedBusinessId, dto.payPolicyId);
      row.payPolicyId = dto.payPolicyId;
    }
    if (dto.salaryAccountId !== undefined) {
      await this.assertSalaryAccount(
        tenantDb,
        scopedBusinessId,
        dto.salaryAccountId,
      );
      row.salaryAccountId = dto.salaryAccountId;
    }

    if (dto.employeeCode !== undefined) {
      const nextCode = dto.employeeCode.trim();
      if (!nextCode) {
        throw new BadRequestException('Employee code cannot be empty');
      }
      if (nextCode !== row.employeeCode) {
        await this.assertUniqueEmployeeField(
          tenantDb,
          scopedBusinessId,
          'employeeCode',
          nextCode,
          row.id,
        );
        row.employeeCode = nextCode;
      }
    }

    if (dto.cnic !== undefined) {
      const nextCnic = dto.cnic?.trim() ?? null;
      if (nextCnic && nextCnic !== row.cnic) {
        await this.assertUniqueEmployeeField(
          tenantDb,
          scopedBusinessId,
          'cnic',
          nextCnic,
          row.id,
        );
      }
      row.cnic = nextCnic;
    }

    if (dto.email !== undefined) {
      const nextEmail = dto.email?.trim().toLowerCase() ?? null;
      if (nextEmail && nextEmail !== row.email) {
        await this.assertUniqueEmployeeField(
          tenantDb,
          scopedBusinessId,
          'email',
          nextEmail,
          row.id,
        );
      }
      row.email = nextEmail;
    }

    if (dto.firstName !== undefined) {
      const nextFirst = dto.firstName.trim();
      if (!nextFirst) {
        throw new BadRequestException('First name cannot be empty');
      }
      row.firstName = nextFirst;
    }
    if (dto.lastName !== undefined) {
      row.lastName = dto.lastName?.trim() ?? null;
    }
    row.fullName = buildFullName(row.firstName, row.lastName);

    if (dto.fatherName !== undefined) {
      row.fatherName = dto.fatherName?.trim() ?? null;
    }
    if (dto.phone !== undefined) row.phone = dto.phone?.trim() ?? null;
    if (dto.emergencyContact !== undefined) {
      row.emergencyContact = dto.emergencyContact?.trim() ?? null;
    }
    if (dto.address !== undefined) row.address = dto.address?.trim() ?? null;
    if (dto.gender !== undefined) row.gender = dto.gender;
    if (dto.dateOfBirth !== undefined) {
      row.dateOfBirth = dto.dateOfBirth
        ? parseDate(dto.dateOfBirth, 'dateOfBirth')
        : null;
    }
    if (dto.maritalStatus !== undefined) row.maritalStatus = dto.maritalStatus;
    if (dto.profileImage !== undefined) row.profileImage = dto.profileImage;
    if (dto.employmentType !== undefined) {
      row.employmentType = dto.employmentType;
    }
    if (dto.employeeStatus !== undefined) {
      row.employeeStatus = dto.employeeStatus;
    }
    if (dto.salaryPaymentMethod !== undefined) {
      row.salaryPaymentMethod = dto.salaryPaymentMethod;
    }
    if (dto.bankName !== undefined) {
      row.bankName = dto.bankName?.trim() ?? null;
    }
    if (dto.bankAccountTitle !== undefined) {
      row.bankAccountTitle = dto.bankAccountTitle?.trim() ?? null;
    }
    if (dto.bankAccountNumber !== undefined) {
      row.bankAccountNumber = dto.bankAccountNumber?.trim() ?? null;
    }
    if (dto.iban !== undefined) row.iban = dto.iban?.trim() ?? null;
    if (dto.taxNumber !== undefined) {
      row.taxNumber = dto.taxNumber?.trim() ?? null;
    }

    if (dto.joiningDate !== undefined) {
      row.joiningDate = parseDate(dto.joiningDate, 'joiningDate');
    }
    if (dto.leavingDate !== undefined) {
      row.leavingDate = dto.leavingDate
        ? parseDate(dto.leavingDate, 'leavingDate')
        : null;
    }
    if (row.leavingDate && row.leavingDate < row.joiningDate) {
      throw new BadRequestException(
        'leavingDate must be on or after joiningDate',
      );
    }

    row.updatedBy = actorUserId;
    await tenantDb.getRepository(Employee).save(row);

    const full = await this.findForBusiness(tenantDb, scopedBusinessId, row.id);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'EMPLOYEE_UPDATED',
      description: `Employee ${full.fullName} updated`,
      metadata: { employeeId: full.id },
    });

    return { data: this.mapEmployee(full) };
  }
}
