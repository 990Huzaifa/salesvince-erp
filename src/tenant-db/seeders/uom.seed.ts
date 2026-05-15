import { DataSource } from 'typeorm';
import { Uom } from '../entities/product.entity';

export const TENANT_UOMS = [
  {
    name: 'PCS',
    isBase: true,
  },
];

export async function seedTenantUoms(dataSource: DataSource) {
  const uomRepo = dataSource.getRepository(Uom);

  console.log('🌱 Seeding tenant UOMs...');

  for (const uomData of TENANT_UOMS) {
    const normalizedName = uomData.name.trim().toUpperCase();
    if (!normalizedName) {
      continue;
    }

    const existing = await uomRepo.findOne({
      where: { name: normalizedName },
    });

    if (!existing) {
      const uom = uomRepo.create({
        name: normalizedName,
        isBase: uomData.isBase ?? false,
      });
      await uomRepo.save(uom);
      console.log(`✅ UOM created: ${normalizedName}`);
      continue;
    }

    let shouldUpdate = false;
    if (existing.isBase !== (uomData.isBase ?? false)) {
      existing.isBase = uomData.isBase ?? false;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      await uomRepo.save(existing);
    }

    console.log(`⏭ UOM already exists: ${normalizedName}`);
  }

  console.log('🌱 Tenant UOM seeding completed.\n');
}
