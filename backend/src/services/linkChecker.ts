import { prisma } from "../lib/prisma";

// Several Saudi government sites sit behind a WAF that blocks requests with
// no User-Agent (or an obviously non-browser one) - the request never
// reaches the actual application, so a perfectly healthy site gets flagged
// BROKEN just because the checker looks like a bot instead of a browser.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ar,en;q=0.8",
};

async function checkOne(link: { id: string; url: string }): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(link.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
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
