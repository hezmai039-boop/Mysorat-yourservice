import { prisma } from "../lib/prisma";

async function checkOne(link: { id: string; url: string }): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(link.url, { method: "GET", redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);

    const isOk = response.status < 400;
    await prisma.governmentLink.update({
      where: { id: link.id },
      data: {
        status: isOk ? "ACTIVE" : "BROKEN",
        lastCheckedAt: new Date(),
        lastError: isOk ? null : `HTTP ${response.status}`,
      },
    });
    return isOk;
  } catch (err) {
    await prisma.governmentLink.update({
      where: { id: link.id },
      data: { status: "BROKEN", lastCheckedAt: new Date(), lastError: (err as Error).message },
    });
    return false;
  }
}

export async function checkAllLinks() {
  const links = await prisma.governmentLink.findMany();
  const results = await Promise.all(links.map(checkOne));
  const active = results.filter(Boolean).length;
  return { checked: links.length, active, broken: results.length - active };
}
