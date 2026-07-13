import "dotenv/config";
import { seedDatabase } from "../src/services/seedData";
import { prisma } from "../src/lib/prisma";

seedDatabase()
  .then((result) => {
    console.log(`مالك المنصة: ${result.ownerEmail}`);
    console.log(`تم إضافة/تحديث ${result.servicesUpserted} خدمة حكومية`);
    console.log(`تم إضافة ${result.linksCreated} رابط حكومي جديد`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
