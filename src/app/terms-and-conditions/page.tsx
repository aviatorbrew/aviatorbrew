import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and Conditions | Aviator Brewing Company",
  description: "Terms and Conditions for using Aviator Brewing Company website, Flight Log, Flight Crew, shop, events, coupons, and SMS communications.",
};

const updated = "August 1, 2026";

export default function TermsAndConditionsPage() {
  return <>
    <section className="page-hero legal-hero">
      <div className="content-wrap">
        <p className="eyebrow">Aviator Brewing Company</p>
        <h1>Terms and Conditions</h1>
        <p>Rules for using the Aviator Brewing Company website, Flight Log, Flight Crew, shop, event tools, coupon tools, and messaging programs.</p>
      </div>
    </section>

    <section className="section legal-section">
      <div className="content-wrap legal-content">
        <p className="legal-updated"><strong>Last updated:</strong> {updated}</p>

        <h2>Acceptance Of Terms</h2>
        <p>By using aviatorbrew.com, creating a Flight Log or Flight Crew account, placing an order, submitting a form, claiming a coupon, or opting in to communications, you agree to these Terms and Conditions and our <Link href="/privacy-policy">Privacy Policy</Link>.</p>

        <h2>Brand And Program</h2>
        <p>The website and messaging programs are operated by Aviator Brewing Company. Messaging programs may include Aviator Flight Crew, Aviator Flight Log, shop and order updates, event updates, beer release alerts, friend invitations, coupons, and customer support communications.</p>

        <h2>Eligibility</h2>
        <p>You must provide accurate information when using forms, accounts, ordering tools, and messaging features. Alcohol, THC, and other age-restricted products or content are available only to customers who meet applicable legal age requirements.</p>

        <h2>Accounts And Community Features</h2>
        <p>You are responsible for keeping your login information secure and for activity under your account. Flight Log community features must be used respectfully. Aviator Brewing Company may moderate, remove, archive, or restrict posts, comments, profiles, uploads, or accounts that violate community standards, law, safety requirements, or these terms.</p>

        <h2>Orders, Pricing, And Availability</h2>
        <p>Shop products, beverage sales, event availability, coupons, and prices may change without notice. Product images and descriptions are provided for convenience. We may cancel or refuse orders or requests when inventory is unavailable, information is incorrect, payment fails, fraud is suspected, or fulfillment is not possible.</p>

        <h2>Coupons And Promotions</h2>
        <p>Coupons, specials, discounts, and promotions may have limits, blackout dates, expiration dates, location restrictions, purchase requirements, and other terms shown with the offer. Offers are not redeemable for cash unless required by law.</p>

        <h2>SMS Terms</h2>
        <p>By providing your mobile number and separately opting in, you agree to receive text messages from Aviator Brewing Company. Messages may include Flight Crew updates, Flight Log account activity, friend invitations, event updates, beer releases, shop or order updates, coupons, customer support, and related Aviator announcements.</p>
        <p>Message frequency varies. Marketing messages are generally limited to up to 4 messages per month, while transactional or account-related messages may be sent as needed. Message and data rates may apply.</p>
        <p><strong>Reply HELP for help. Reply STOP to cancel and opt out of SMS messages.</strong></p>
        <p>After you send STOP, you may receive one confirmation message, and then no further SMS messages will be sent unless you opt in again. For help, contact <a href="mailto:info@aviatorbrew.com">info@aviatorbrew.com</a> or call <a href="tel:+19195672337">919-567-BEER</a>.</p>
        <p>Carriers are not liable for delayed or undelivered messages. SMS delivery is subject to carrier network availability and filtering.</p>

        <h2>Email Communications</h2>
        <p>You may unsubscribe from marketing email where unsubscribe links are provided. Transactional or account-related emails may still be sent when needed to operate services you request.</p>

        <h2>User Content</h2>
        <p>If you upload or post content, you represent that you have the right to share it. You grant Aviator Brewing Company permission to display, store, process, moderate, and use that content in connection with website, Flight Log, event, marketing, and customer experience features.</p>

        <h2>Prohibited Uses</h2>
        <p>You may not use the website or services to violate law, harass others, impersonate another person, interfere with website security, upload malicious code, scrape protected systems, submit false information, infringe intellectual property rights, or abuse promotions, coupons, accounts, or messaging systems.</p>

        <h2>Third-Party Services</h2>
        <p>The website may use third-party services for payments, email, SMS, shipping, maps, ordering, analytics, hosting, ticketing, and other operations. Your use of those services may also be governed by their terms and policies.</p>

        <h2>Disclaimers</h2>
        <p>The website and services are provided on an as-is and as-available basis. Aviator Brewing Company does not guarantee that the website will be uninterrupted, error-free, or free from harmful components.</p>

        <h2>Limitation Of Liability</h2>
        <p>To the fullest extent allowed by law, Aviator Brewing Company will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of the website, services, communications, events, orders, or community features.</p>

        <h2>Changes To Terms</h2>
        <p>We may update these Terms and Conditions from time to time. The updated version will be posted on this page with a new last-updated date.</p>

        <h2>Contact</h2>
        <p>Questions about these Terms and Conditions can be sent to <a href="mailto:info@aviatorbrew.com">info@aviatorbrew.com</a> or by calling <a href="tel:+19195672337">919-567-BEER</a>.</p>
        <p><Link className="section-link" href="/privacy-policy">View Privacy Policy</Link></p>
      </div>
    </section>
  </>;
}
