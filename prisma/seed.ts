import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    const managerPassword = await bcrypt.hash('manager123', 12);
    const employeePassword = await bcrypt.hash('employee123', 12);

    await prisma.user.upsert({
        where: { username: 'manager' },
        update: {},
        create: {
            username: 'manager',
            password: managerPassword,
            role: 'manager',
        },
    });

    await prisma.user.upsert({
        where: { username: 'employee' },
        update: {},
        create: {
            username: 'employee',
            password: employeePassword,
            role: 'employee',
        },
    });

    console.log('Seeded users: manager, employee');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
