const twilioAccountSid = () => process.env.TWILIO_ACCOUNT_SID?.trim() || "";
const twilioAuthToken = () => process.env.TWILIO_AUTH_TOKEN?.trim() || "";
const twilioFromNumber = () => process.env.TWILIO_FROM_NUMBER?.trim() || "";
const twilioMessagingServiceSid = () => process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || "";

function twilioAuthHeader() {
  const credentials = Buffer.from(`${twilioAccountSid()}:${twilioAuthToken()}`).toString("base64");
  return `Basic ${credentials}`;
}

export function twilioCredentialsConfigured() {
  return Boolean(twilioAccountSid() && twilioAuthToken());
}

export function twilioSmsConfigured() {
  return Boolean(twilioCredentialsConfigured() && (twilioFromNumber() || twilioMessagingServiceSid()));
}

export function twilioStatusCallbackUrl(request?: Request) {
  const explicit = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.APP_URL || (request ? new URL(request.url).origin : "");
  if (!base) return "";
  const secret = process.env.TWILIO_STATUS_CALLBACK_SECRET?.trim();
  const url = `${base.replace(/\/$/, "")}/api/twilio/status`;
  return secret ? `${url}?key=${encodeURIComponent(secret)}` : url;
}

export async function lookupTwilioPhoneNumber(phoneNumber: string) {
  if (!twilioCredentialsConfigured()) return { ok: false, phoneNumber, carrierName: "", status: "twilio_credentials_required" };
  const url = new URL(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`);
  url.searchParams.set("Fields", "line_type_intelligence");
  const response = await fetch(url, { headers: { authorization: twilioAuthHeader() }, cache: "no-store" });
  if (!response.ok) return { ok: false, phoneNumber, carrierName: "", status: `lookup_failed_${response.status}` };
  const body = await response.json() as { phone_number?: string; line_type_intelligence?: { carrier_name?: string } };
  return {
    ok: true,
    phoneNumber: body.phone_number || phoneNumber,
    carrierName: body.line_type_intelligence?.carrier_name || "",
    status: "lookup_ok",
  };
}

export async function sendTwilioSms(input: { to: string; body: string; statusCallbackUrl?: string }) {
  if (!twilioSmsConfigured()) throw new Error("Twilio SMS requires TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.");
  const form = new URLSearchParams();
  form.set("To", input.to);
  form.set("Body", input.body);
  if (twilioMessagingServiceSid()) form.set("MessagingServiceSid", twilioMessagingServiceSid());
  else form.set("From", twilioFromNumber());
  if (input.statusCallbackUrl) form.set("StatusCallback", input.statusCallbackUrl);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioAccountSid())}/Messages.json`, {
    method: "POST",
    headers: { authorization: twilioAuthHeader(), "content-type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as { sid?: string; status?: string; message?: string };
  if (!response.ok) throw new Error(body.message || `Twilio SMS failed with HTTP ${response.status}`);
  return { sid: body.sid || "", status: body.status || "queued" };
}
