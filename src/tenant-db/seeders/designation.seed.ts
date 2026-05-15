import { DataSource } from 'typeorm';
import { Designation } from '../entities/user.entity';

export const TENANT_DESIGNATIONS = [
  {
    name: 'CEO',
    slug: 'ceo',
    description: 'CEO of the tenant',
  },
];

export async function seedTenantDesignations(dataSource: DataSource) {
  const designationRepo = dataSource.getRepository(Designation);

  console.log('🌱 Seeding tenant designations...');

  for (const designationData of TENANT_DESIGNATIONS) {
    const slug = designationData.slug.trim().toLowerCase();
    const name = designationData.name.trim();
    if (!slug || !name) {
      continue;
    }

    const existing = await designationRepo.findOne({
      where: { slug },
    });

    if (!existing) {
      const designation = designationRepo.create({
        name,
        slug,
        description: designationData.description,
        isActive: true,
      });
      await designationRepo.save(designation);
      console.log(`✅ Designation created: ${slug}`);
    } else {
      let shouldUpdate = false;
      if (existing.name !== name) {
        existing.name = name;
        shouldUpdate = true;
      }
      if (existing.description !== designationData.description) {
        existing.description = designationData.description;
        shouldUpdate = true;
      }
      if (!existing.isActive) {
        existing.isActive = true;
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        await designationRepo.save(existing);
      }
      console.log(`⏭ Designation already exists: ${slug}`);
    }
  }

  console.log('🌱 Tenant designation seeding completed.\n');
}
