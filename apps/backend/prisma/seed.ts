import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: 'CUSTOMER' },
      update: {},
      create: { name: 'CUSTOMER', description: 'Customer access' },
    }),
    prisma.role.upsert({
      where: { name: 'DRIVER' },
      update: {},
      create: { name: 'DRIVER', description: 'Driver access' },
    }),
    prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', description: 'Platform admin access' },
    }),
  ]);

  const permissions = await Promise.all([
    prisma.permission.upsert({
      where: { name: 'booking.read' },
      update: {},
      create: { name: 'booking.read', description: 'Read bookings' },
    }),
    prisma.permission.upsert({
      where: { name: 'booking.write' },
      update: {},
      create: { name: 'booking.write', description: 'Create or update bookings' },
    }),
    prisma.permission.upsert({
      where: { name: 'driver.manage' },
      update: {},
      create: { name: 'driver.manage', description: 'Manage drivers' },
    }),
    prisma.permission.upsert({
      where: { name: 'system.admin' },
      update: {},
      create: { name: 'system.admin', description: 'Administrative system access' },
    }),
  ]);

  for (const role of roles) {
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  await prisma.vehicleCategory.upsert({
    where: { slug: 'mini' },
    update: {},
    create: {
      name: 'Mini',
      slug: 'mini',
      description: 'Compact city rides for short trips',
      baseFare: 120,
    },
  });

  for (const serviceType of [
    { code: 'AUTO', name: 'Auto', description: 'Auto ride request' },
    { code: 'CAB', name: 'Cab', description: 'Cab ride request' },
    {
      code: 'TWO_WHEELER',
      name: 'Two-wheeler',
      description: 'Two-wheeler ride request',
    },
  ]) {
    await prisma.serviceType.upsert({
      where: { code: serviceType.code },
      update: {
        name: serviceType.name,
        description: serviceType.description,
        active: true,
      },
      create: serviceType,
    });
  }

  const existingServiceArea = await prisma.serviceArea.findFirst({
    where: { name: 'Hyderabad Central' },
  });

  if (!existingServiceArea) {
    await prisma.serviceArea.create({
      data: {
        name: 'Hyderabad Central',
        state: 'Telangana',
        city: 'Hyderabad',
        description: 'Core urban service area for Hyderabad and nearby corridors',
        isActive: true,
      },
    });
  }

  await prisma.appSetting.upsert({
    where: { key: 'platform.name' },
    update: { value: 'RAVERO' },
    create: {
      key: 'platform.name',
      value: 'RAVERO',
      description: 'Platform display name',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
