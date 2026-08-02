import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Aviator Brewing Company",
  description: "Privacy Policy for Aviator Brewing Company website, Flight Log, Flight Crew, shop, events, and SMS communications.",
};

const updated = "August 1, 2026";

export default function PrivacyPolicyPage() {
  return <>
    <section className="page-hero legal-hero">
      <div className="content-wrap">
        <p className="eyebrow">Aviator Brewing Company</p>
        <h1>Privacy Policy</h1>
        <p>How Aviator Brewing Company collects, uses, protects, and handles customer information across our website, Flight Log, Flight Crew, shop, events, and messaging programs.</p>
      </div>
    </section>

    <section className="section legal-section">
      <div className="content-wrap legal-content">
        <p className="legal-updated"><strong>Last updated:</strong> {updated}</p>

        <h2>Who We Are</h2>
        <p>Aviator Brewing Company operates the Aviator website, Flight Log community features, Flight Crew customer club, online shop, event tools, coupon tools, and related customer communications. Our main brewery campus is located at 688 Brewing Drive, Fuquay-Varina, NC 27526.</p>

        <h2>Information We Collect</h2>
        <p>We may collect information you provide directly, including your name, email address, phone number, mailing address, billing and shipping details, account username or callsign, profile information, event inquiries, coupon activity, shop orders, check-ins, uploaded photos or videos, comments, messages, and other information submitted through website forms.</p>
        <p>We may also collect technical information such as IP address, browser type, device information, pages visited, timestamps, referring pages, and basic analytics or security logs.</p>

        <h2>How We Use Information</h2>
        <p>We use information to operate the website, manage customer accounts, provide Flight Log and Flight Crew features, process shop orders, respond to inquiries, manage events and bookings, send account verification or password reset messages, provide customer support, prevent fraud or abuse, improve services, and send updates when you have opted in.</p>

        <h2>SMS And Mobile Messaging</h2>
        <p>If you provide a mobile number and separately consent to receive text messages from Aviator Brewing Company, we may send SMS messages related to Flight Crew updates, Flight Log account activity, friend invitations, event updates, beer releases, shop or order updates, coupons, customer support, and related Aviator announcements.</p>
        <p>Message frequency varies. Marketing messages are generally limited to up to 4 messages per month, while transactional or account-related messages may be sent as needed. Message and data rates may apply.</p>
        <p><strong>Mobile information and text messaging opt-in consent will not be shared with third parties or affiliates for marketing or promotional purposes.</strong></p>
        <p><strong>Text messaging originator opt-in data and consent are excluded from any data sharing described in this policy and will not be sold, rented, shared, or purchased.</strong></p>

        <h2>How We Share Information</h2>
        <p>We may share information with service providers that help operate the website and business, such as payment processors, email providers, SMS providers, hosting providers, shipping providers, analytics tools, fraud prevention services, and customer support tools. These providers are allowed to use information only as needed to provide services to Aviator Brewing Company.</p>
        <p>We may also disclose information when required by law, to protect rights or safety, to prevent fraud or abuse, or in connection with a business transfer.</p>

        <h2>Payments</h2>
        <p>Payment information is processed by third-party payment processors such as Stripe. Aviator Brewing Company does not store full credit card numbers on our website servers.</p>

        <h2>Cookies And Analytics</h2>
        <p>The website may use cookies, local storage, session storage, analytics, and similar technologies to keep users signed in, remember preferences, understand website traffic, improve performance, and protect against abuse.</p>

        <h2>User Content</h2>
        <p>Information you post publicly in Flight Log or other public areas of the website may be visible to other users and website visitors. Do not post private information that you do not want made public.</p>

        <h2>Data Security</h2>
        <p>We use reasonable administrative, technical, and physical safeguards designed to protect customer information. No website, network, database, or communication system can be guaranteed to be completely secure.</p>

        <h2>Your Choices</h2>
        <p>You may unsubscribe from marketing emails using unsubscribe links where available. For SMS messages, reply <strong>STOP</strong> to opt out and <strong>HELP</strong> for help. You may also contact us to request updates or corrections to your account information.</p>

        <h2>Children</h2>
        <p>Our website and services are not directed to children under 13. Alcohol, THC, and age-restricted products or content are intended only for customers of legal age.</p>

        <h2>Updates</h2>
        <p>We may update this Privacy Policy from time to time. The updated version will be posted on this page with a new last-updated date.</p>

        <h2>Contact</h2>
        <p>Questions about this Privacy Policy can be sent to <a href="mailto:info@aviatorbrew.com">info@aviatorbrew.com</a> or by calling <a href="tel:+19195672337">919-567-BEER</a>.</p>
        <p><Link className="section-link" href="/terms-and-conditions">View Terms and Conditions</Link></p>
      </div>
    </section>
  </>;
}
