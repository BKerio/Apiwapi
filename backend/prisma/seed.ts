import 'dotenv/config';
import { Role } from '../src/generated/prisma/index.js';
import { createPrismaClient } from '../src/lib/prisma.js';
import bcrypt from 'bcrypt';

const prisma = createPrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ── 1. Super Admin ────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@123!', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash,
      name: 'System Administrator',
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // ── 2. A couple of sample operators ─────────────────────────────────────────
  const staffHash = await bcrypt.hash('Staff@123!', 10);
  const operator = await prisma.user.upsert({
    where: { email: 'ops.manager@example.com' },
    update: {},
    create: {
      email: 'ops.manager@example.com',
      passwordHash: staffHash,
      name: 'Ops Manager',
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`✅ Admin: ${operator.email}`);

  // ── 3. Sample groups ──────────────────────────────────────────────────────
  const groupNames = ['Customers', 'Newsletter Subscribers', 'VIP'];
  const groups = [];
  for (const name of groupNames) {
    const group = await prisma.group.upsert({ where: { name }, update: {}, create: { name } });
    groups.push(group);
  }
  console.log(`✅ Groups: ${groups.length} created`);

  // ── 4. Sample members ────────────────────────────────────────────────────
  const sampleMembers = [
    { name: 'Clinton Kiptoo', phone: '254712000001', email: 'clinton@example.com', groups: [groups[0], groups[1]] },
    { name: 'Frank Tito', phone: '254712000002', email: 'frank@example.com', groups: [groups[0]] },
    { name: 'Sheila Muonja', phone: '254712000003', email: 'sheila@example.com', groups: [groups[1], groups[2]] },
    { name: 'Eliud Mugu', phone: '254712000004', groups: [groups[2]] },
  ];

  for (const m of sampleMembers) {
    await prisma.member.upsert({
      where: { phone: m.phone },
      update: {},
      create: {
        name: m.name, phone: m.phone, email: m.email, createdById: superAdmin.id,
        groupMemberships: { create: m.groups.map((g) => ({ groupId: g.id })) },
      },
    });
  }
  console.log(`✅ Members: ${sampleMembers.length} created`);

  console.log('\n🎉 Seed complete!');
  console.log('─────────────────────────────────────');
  console.log('Super Admin credentials:');
  console.log('  Email:    admin@example.com');
  console.log('  Password: Admin@123!');
  console.log('Sample admin account uses password: Staff@123!');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
