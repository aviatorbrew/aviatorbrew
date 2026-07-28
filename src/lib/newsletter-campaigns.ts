import { promises as fs } from "node:fs";
import path from "node:path";

export type NewsletterCampaign = {
  id: string;
  subject: string;
  template: string;
  recipients: number;
  sentAt: string;
  sections: string[];
};

const file = () => process.env.NEWSLETTER_CAMPAIGNS_DATA_FILE || path.join(process.cwd(), "data", "newsletter-campaigns.json");

export async function getNewsletterCampaigns(): Promise<NewsletterCampaign[]> {
  try {
    const value = JSON.parse(await fs.readFile(file(), "utf8")) as unknown;
    return Array.isArray(value) ? value.filter((item): item is NewsletterCampaign => Boolean(item && typeof item === "object" && typeof (item as NewsletterCampaign).id === "string")).slice(0, 50) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function recordNewsletterCampaign(input: Omit<NewsletterCampaign, "id" | "sentAt">) {
  const items = await getNewsletterCampaigns();
  items.unshift({ ...input, id: "campaign_" + Date.now().toString(36), sentAt: new Date().toISOString() });
  const destination = file();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(items.slice(0, 50), null, 2) + "\n", "utf8");
  await fs.rename(temporary, destination);
}
