import { BadRequestException } from '@nestjs/common';
import { ForecastBaseQueryDto } from 'src/tenant/dto/inventory/forecast/forecast-base.query.dto';
import {
  assertBusinessId,
  assertDateRange,
  resolveInventoryScope,
} from '../inventory-query.helper';
import { ForecastResolvedParams } from './forecast.types';

export function resolveForecastParams(
  businessId: string | undefined,
  dto: ForecastBaseQueryDto,
): ForecastResolvedParams {
  const scopedBusinessId = assertBusinessId(businessId);
  const { scope, warehouseId } = resolveInventoryScope(dto);
  assertDateRange(dto.startDate, dto.endDate);

  const analysisDays = Number(dto.analysisDays ?? 90);
  const end = dto.endDate ? new Date(dto.endDate) : new Date();
  if (Number.isNaN(end.getTime())) {
    throw new BadRequestException('Invalid endDate');
  }
  end.setUTCHours(23, 59, 59, 999);

  const start = dto.startDate
    ? new Date(dto.startDate)
    : new Date(end.getTime() - analysisDays * 86_400_000);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException('Invalid startDate');
  }
  start.setUTCHours(0, 0, 0, 0);

  if (start > end) {
    throw new BadRequestException('startDate must be on or before endDate');
  }

  const actualDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / 86_400_000),
  );

  return {
    businessId: scopedBusinessId,
    scope,
    warehouseId,
    startDate: start,
    endDate: end,
    leadDays: Number(dto.leadDays ?? 7),
    safetyFactor: Number(dto.safetyFactor ?? 2),
    analysisDays: actualDays,
    forecastDays: Number(dto.forecastDays ?? 30),
    slowMovingDaysCover: Number(dto.slowMovingDaysCover ?? 90),
  };
}
