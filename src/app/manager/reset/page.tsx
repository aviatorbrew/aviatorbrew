import { ManagerPasswordReset } from "@/components/manager-password-reset";

export const dynamic = "force-dynamic";

export default async function ManagerResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const values = await searchParams;
  return <main className="coupon-validator manager-reset-page"><section><p className="eyebrow">Aviator operations</p><h1>Reset manager password</h1><p>Choose a new password with at least 12 characters. The reset link can only be used once.</p><ManagerPasswordReset token={values.token || ""} /></section></main>;
}
