import { promises as fs } from "node:fs";
import path from "node:path";
import { databaseConfigured, withDatabase } from "@/lib/database";

export type NewsletterCampaign = {
  id: string;
  subject: string;
  template: string;
  recipients: number;
  sentAt: string;
  sections: string[];
};

const file = () => process.env.NEWSLETTER_CAMPAIGNS_DATA_FILE || path.join(process.cwd(), "data", "newsletter-campaigns.json");

async function getFileCampaigns(): Promise<NewsletterCampaign[]> {
  try {
    const value = JSON.parse(await fs.readFile(file(), "utf8")) as unknown;
    return Array.isArray(value) ? value.filter((item): item is NewsletterCampaign => Boolean(item && typeof item === "object" && typeof (item as NewsletterCampaign).id === "string")).slice(0, 50) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
async function getDatabaseCampaigns(): Promise<NewsletterCampaign[] | null> {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query("SELECT id,subject,template,recipients,sections,sent_at FROM website.newsletter_campaigns ORDER BY sent_at DESC LIMIT 50");
    return result.rows.map((row): NewsletterCampaign => ({ id: row.id, subject: row.subject, template: row.template, recipients: Number(row.recipients) || 0, sections: Array.isArray(row.sections) ? row.sections : [], sentAt: row.sent_at instanceof Date ? row.sent_at.toISOString() : String(row.sent_at || "") }));
  });
}
export async function getNewsletterCampaigns(): Promise<NewsletterCampaign[]> {
  const fileItems = await getFileCampaigns();
  try {
    const dbItems = await getDatabaseCampaigns();
    if (!dbItems) return fileItems;
    const byId = new Map(fileItems.map((item) => [item.id, item]));
    for (const item of dbItems) byId.set(item.id, item);
    return [...byId.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 50);
  } catch { return fileItems; }
}

export async function recordNewsletterCampaign(input: Omit<NewsletterCampaign, "id" | "sentAt">) {
  const campaign = { ...input, id: "campaign_" + Date.now().toString(36), sentAt: new Date().toISOString() };
  if (databaseConfigured()) await withDatabase(async (client) => { await client.query("INSERT INTO website.newsletter_campaigns (id,subject,template,recipients,sections,sent_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)", [campaign.id, campaign.subject, campaign.template, campaign.recipients, JSON.stringify(campaign.sections), campaign.sentAt]); });
  else {
    const items = await getNewsletterCampaigns();
    items.unshift(campaign);
    const destination = file();
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temporary = destination + ".tmp";
    await fs.writeFile(temporary, JSON.stringify(items.slice(0, 50), null, 2) + "\\n", "utf8");
    await fs.rename(temporary, destination);
  }
}
