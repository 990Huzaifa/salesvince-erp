export enum GenderEnum {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum MaritalStatusEnum {
  SINGLE = 'single',
  MARRIED = 'married',
  DIVORCED = 'divorced',
  WIDOWED = 'widowed',
}

export enum EmploymentTypeEnum {
  PERMANENT = 'permanent',
  CONTRACT = 'contract',
  INTERN = 'intern',
  PART_TIME = 'part_time',
  DAILY_WAGE = 'daily_wage',
}

export enum EmployeeStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  RESIGNED = 'resigned',
  TERMINATED = 'terminated',
  ON_LEAVE = 'on_leave',
}

export enum SalaryPaymentMethodEnum {
  CASH = 'cash',
  BANK = 'bank',
  CHEQUE = 'cheque',
  ONLINE = 'online',
}

export enum PayrollTypeEnum {
  MONTHLY = 'monthly',
  WEEKLY = 'weekly',
  DAILY = 'daily',
  HOURLY = 'hourly',
}

export enum PayCycleEnum {
  MONTHLY = 'monthly',
  WEEKLY = 'weekly',
  BI_WEEKLY = 'bi_weekly',
  DAILY = 'daily',
}

export enum SalaryCalculationTypeEnum {
  FIXED = 'fixed',
  HOURLY = 'hourly',
  DAILY = 'daily',
}

export enum WorkingDaysTypeEnum {
  CALENDAR_DAYS = 'calendar_days',
  FIXED_DAYS = 'fixed_days',
  ATTENDANCE_BASED = 'attendance_based',
}

export enum OvertimeRateTypeEnum {
  FIXED = 'fixed',
  MULTIPLIER = 'multiplier',
}

export enum ComponentTypeEnum {
  EARNING = 'earning',
  DEDUCTION = 'deduction',
}

export enum ComponentCalculationTypeEnum {
  FIXED = 'fixed',
  PERCENTAGE = 'percentage',
  FORMULA = 'formula',
  MANUAL = 'manual',
}

export enum SalaryStructureStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  REVISED = 'revised',
}

export enum PayrollRunStatusEnum {
  DRAFT = 'draft',
  GENERATED = 'generated',
  CLOSED = 'closed',
}

export enum PayslipStatusEnum {
  DRAFT = 'draft',
  APPROVED = 'approved',
  CANCELLED = 'cancelled',
}
