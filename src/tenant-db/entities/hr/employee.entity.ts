import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from '../business.entity';
import { ChartOfAccount } from '../chart-of-account.entity';
import { User } from '../user.entity';
import { Department } from './department.entity';
import { Designation } from './designation.entity';
import {
  EmployeeStatusEnum,
  EmploymentTypeEnum,
  GenderEnum,
  MaritalStatusEnum,
  SalaryPaymentMethodEnum,
} from './hr.enums';
import { PayPolicy } from './pay-policy.entity';
import { EmployeeSalaryStructure } from './employee-salary-structure.entity';
import { EmployeeSalaryComponent } from './employee-salary-component.entity';

@Entity('employees')
@Index(['businessId', 'employeeCode'], { unique: true })
@Index('IDX_employees_business_cnic', ['businessId', 'cnic'], {
  unique: true,
  where: '"cnic" IS NOT NULL',
})
@Index('IDX_employees_business_email', ['businessId', 'email'], {
  unique: true,
  where: '"email" IS NOT NULL',
})
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, (business) => business.employees, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ type: 'uuid' })
  departmentId: string;

  @ManyToOne(() => Department, (department) => department.employees, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'departmentId' })
  department: Department;

  @Column({ type: 'uuid' })
  designationId: string;

  @ManyToOne(() => Designation, (designation) => designation.employees, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'designationId' })
  designation: Designation;

  @Column({ type: 'varchar', length: 50 })
  employeeCode: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  fatherName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cnic: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  emergencyContact: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({
    type: 'enum',
    enum: GenderEnum,
    nullable: true,
  })
  gender: GenderEnum | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({
    type: 'enum',
    enum: MaritalStatusEnum,
    nullable: true,
  })
  maritalStatus: MaritalStatusEnum | null;

  @Column({ type: 'varchar', nullable: true })
  profileImage: string | null;

  @Column({ type: 'date' })
  joiningDate: Date;

  @Column({ type: 'date', nullable: true })
  leavingDate: Date | null;

  @Column({
    type: 'enum',
    enum: EmploymentTypeEnum,
    default: EmploymentTypeEnum.PERMANENT,
  })
  employmentType: EmploymentTypeEnum;

  @Column({
    type: 'enum',
    enum: EmployeeStatusEnum,
    default: EmployeeStatusEnum.ACTIVE,
  })
  employeeStatus: EmployeeStatusEnum;

  @Column({ type: 'uuid', nullable: true })
  reportingManagerId: string | null;

  @ManyToOne(() => Employee, (employee) => employee.subordinates, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'reportingManagerId' })
  reportingManager: Employee | null;

  @OneToMany(() => Employee, (employee) => employee.reportingManager)
  subordinates: Employee[];

  @Column({ type: 'uuid', nullable: true })
  shiftId: string | null;

  @Column({ type: 'uuid', nullable: true })
  attendancePolicyId: string | null;

  @Column({ type: 'uuid', nullable: true })
  leavePolicyId: string | null;

  @Column({ type: 'uuid', nullable: true })
  payPolicyId: string | null;

  @ManyToOne(() => PayPolicy, (payPolicy) => payPolicy.employees, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'payPolicyId' })
  payPolicy: PayPolicy | null;

  @Column({
    type: 'enum',
    enum: SalaryPaymentMethodEnum,
    nullable: true,
  })
  salaryPaymentMethod: SalaryPaymentMethodEnum | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  bankName: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  bankAccountTitle: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bankAccountNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  iban: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  taxNumber: string | null;

  @Column({ type: 'uuid', nullable: true })
  salaryAccountId: string | null;

  @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'salaryAccountId' })
  salaryAccount: ChartOfAccount | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updatedBy' })
  updatedByUser: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(
    () => EmployeeSalaryStructure,
    (structure) => structure.employee,
  )
  salaryStructures: EmployeeSalaryStructure[];

  @OneToMany(
    () => EmployeeSalaryComponent,
    (component) => component.employee,
  )
  salaryComponents: EmployeeSalaryComponent[];
}
