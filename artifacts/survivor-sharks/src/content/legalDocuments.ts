import { LEGAL_ENTITY_NAME, SUPPORT_EMAIL } from "@/lib/siteLegal";

export type LegalSection = { heading: string; body: string[] };

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  intro?: string;
  sections: LegalSection[];
};

const lastUpdated = "October 13, 2026";

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  lastUpdated,
  intro:
    `${LEGAL_ENTITY_NAME} ("we," "us," or "our") provides a web application for running private sports pools among friends, coworkers, and leagues. By creating an account or using the service, you agree to these Terms.`,
  sections: [
    {
      heading: "1. What Survivor Sharks is",
      body: [
        "Survivor Sharks is a scoreboard and pool-management tool. Commissioners may track entry fees and prizes in the app for convenience, but Survivor Sharks does not process payments, hold funds, or pay out prizes. Any money changing hands between players and commissioners happens entirely off the platform and is solely between those parties.",
        "Survivor Sharks is not a sportsbook, casino, or gambling operator. We do not accept wagers or stakes on our platform.",
      ],
    },
    {
      heading: "2. Eligibility",
      body: [
        "You must be at least 18 years old (or the age of majority where you live, if higher) to create an account.",
        "You are responsible for ensuring that your participation in any pool complies with laws and workplace or school policies that apply to you.",
      ],
    },
    {
      heading: "3. Your account",
      body: [
        "Keep your login credentials confidential. You are responsible for activity under your account.",
        "Provide accurate registration information. Display names and real names may be visible to other members of pools you join.",
        "We may suspend or terminate accounts that violate these Terms or that we reasonably believe harm other users or the service.",
      ],
    },
    {
      heading: "4. Pools, picks, and commissioners",
      body: [
        "Pool rules, deadlines, and prizes are set by each pool's commissioner unless otherwise shown in the app. We do not guarantee that commissioners will run pools fairly or pay prizes.",
        "Game schedules, scores, spreads, and statistics are obtained from third-party sources (such as ESPN). They may be delayed, incomplete, or corrected after the fact. We grade picks based on the data available to our systems at the time of processing.",
        "We may change product features, supported sports, or pool types during beta or thereafter.",
      ],
    },
    {
      heading: "5. Acceptable use",
      body: [
        "Do not use the service to harass others, post unlawful content, attempt to break or overload the systems, scrape data at scale, or impersonate another person.",
        "Do not use the service for commercial gambling operations or public contests where prohibited by law.",
      ],
    },
    {
      heading: "6. Beta software",
      body: [
        "Parts of the service may be labeled or operated as a beta. Beta features may contain bugs, change without notice, or be withdrawn. You use beta features at your own risk.",
      ],
    },
    {
      heading: "7. Disclaimers",
      body: [
        'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.',
        "We do not warrant uninterrupted, secure, or error-free operation, or that results will be accurate or reliable.",
      ],
    },
    {
      heading: "8. Limitation of liability",
      body: [
        "To the fullest extent permitted by law, Survivor Sharks and its operators will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising from your use of the service.",
        "Our total liability for any claim relating to the service is limited to the greater of (a) fifty U.S. dollars or (b) the amount you paid us for the service in the twelve months before the claim. Because the service is currently offered without platform fees, this amount is often zero.",
      ],
    },
    {
      heading: "9. Indemnity",
      body: [
        "You agree to indemnify and hold harmless Survivor Sharks from claims arising out of your use of the service, your pools, or your violation of these Terms or applicable law.",
      ],
    },
    {
      heading: "10. Changes",
      body: [
        "We may update these Terms from time to time. We will post the revised Terms with a new \"Last updated\" date. Continued use after changes become effective constitutes acceptance of the revised Terms.",
      ],
    },
    {
      heading: "11. Contact",
      body: [
        `Questions about these Terms: ${SUPPORT_EMAIL}.`,
      ],
    },
  ],
};

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  lastUpdated,
  intro:
    `This Privacy Policy describes how ${LEGAL_ENTITY_NAME} collects, uses, and shares information when you use our website and applications.`,
  sections: [
    {
      heading: "1. Information we collect",
      body: [
        "Account information: email address, password (stored in hashed form), real name, display name, and account preferences (such as pick reminders).",
        "Pool activity: pools you create or join, picks, standings-related data, commissioner settings, and messages you send through in-app features (such as feedback or broadcast email initiated by commissioners).",
        "Technical data: IP address, browser type, device information, and logs needed to operate and secure the service.",
        "Cookies and local storage: we use session mechanisms and browser storage (for example, to keep you signed in and remember UI preferences).",
      ],
    },
    {
      heading: "2. How we use information",
      body: [
        "Provide and improve the service, including grading picks, showing leaderboards, and sending transactional email (verification, password reset, pick reminders, and commissioner broadcasts you opt into).",
        "Protect the service, investigate abuse, and comply with law.",
        "Communicate with you about support requests you send to us.",
      ],
    },
    {
      heading: "3. What others can see",
      body: [
        "Other members of a pool can see your display name, picks (according to pool visibility rules), and standings information for that pool.",
        "Commissioners can see membership and activity needed to run their pools.",
      ],
    },
    {
      heading: "4. Service providers",
      body: [
        "We use hosting and infrastructure providers (for example, Railway) to run the application.",
        "We use email delivery providers (for example, Resend) to send transactional email from addresses such as noreply@survivorsharks.com.",
        "These providers process data on our behalf under their own terms and privacy policies.",
      ],
    },
    {
      heading: "5. Retention",
      body: [
        "We retain account and pool data while your account is active and as needed to operate the service, resolve disputes, and meet legal obligations.",
        "You may request account deletion by contacting us; some data may be retained in backups or logs for a limited period.",
      ],
    },
    {
      heading: "6. Your choices",
      body: [
        "You can update profile fields in the app where available.",
        "You can disable pick reminders in profile settings if offered.",
        "You may opt out of non-essential email by contacting us; transactional email may still be required for security.",
      ],
    },
    {
      heading: "7. Children",
      body: [
        "The service is not directed to children under 13, and we do not knowingly collect personal information from children under 13. Contact us if you believe a child has provided information.",
      ],
    },
    {
      heading: "8. Security",
      body: [
        "We use reasonable administrative, technical, and organizational measures to protect information. No method of transmission or storage is completely secure.",
      ],
    },
    {
      heading: "9. Changes",
      body: [
        "We may update this Privacy Policy from time to time. We will post the revised policy with a new \"Last updated\" date.",
      ],
    },
    {
      heading: "10. Contact",
      body: [
        `Privacy questions or requests: ${SUPPORT_EMAIL}.`,
      ],
    },
  ],
};
