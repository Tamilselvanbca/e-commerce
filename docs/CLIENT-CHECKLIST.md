# Client Onboarding Checklist

Everything we need from you to launch your online store. Items marked **Required** block the launch;
the others can follow later. Please share passwords and API keys through a password manager or another
secure channel, never by plain email or chat.

## Business & content

| Item | Details | Status |
| --- | --- | --- |
| **Required:** Business name and logo | Logo as SVG or a high-resolution PNG with a transparent background | ☐ |
| **Required:** Contact details | Support email, support phone, business address (shown on the site and in emails) | ☐ |
| **Required:** Product data | For each sweet or snack: name, description, category, pack sizes (250 g, 500 g, 1 kg…) with price (and MRP if discounted) and stock for each, flavours if any, ingredients, shelf life, whether it can ship abroad, 3–6 photos. A spreadsheet works; we can provide a template. | ☐ |
| **Required:** Your story | A few paragraphs for the About us page (how you started, your kitchen, what makes your sweets special) and 2–4 photos of your kitchen or team | ☐ |
| **Required:** Store policies | Terms & conditions, privacy policy, refund/return policy, shipping policy. Razorpay requires these before activating your account. | ☐ |
| **Required:** Shipping rules | Domestic and international shipping fees and free-shipping thresholds, delivery areas and timelines, which products can ship abroad, pickup address | ☐ |
| **Required:** Domain name | e.g. `yourstore.com`, plus access to its DNS settings (or we can buy it on your behalf) | ☐ |

## Accounts to create (in the business's name)

| Service | Used for | What we need | Status |
| --- | --- | --- | --- |
| **Required:** Razorpay | Payments in India: UPI, cards, net banking, wallets | Account with completed KYC (PAN, GST if applicable, bank account details); team access or API keys | ☐ |
| Stripe | International card payments | Account able to accept payments from India (Stripe India onboarding is currently invite-only); API keys | ☐ |
| **Required:** AWS | Product image storage (S3) and optionally hosting | AWS account with billing set up; we create the bucket and access keys | ☐ |
| **Required:** SMS for OTP login: MSG91 *or* Twilio | Sending login codes | Account, plus **DLT registration** (entity ID, sender ID, approved OTP template), which is mandatory for SMS in India and takes a few days | ☐ |
| **Required:** Email: SendGrid (or another SMTP service) | Order confirmation and shipping emails | Account and access to your domain's DNS to verify the sending domain | ☐ |
| Shiprocket | Courier booking and tracking | Account with KYC, pickup address configured, an API user | ☐ |
| WhatsApp Business number | "Order on WhatsApp" and bulk enquiries | The number customers should message | ☐ |
| WATI (optional) | WhatsApp alerts to you for bulk enquiries | WATI account, API endpoint and token, approved message template | ☐ |
| International courier (for overseas orders) | Shipping sweets and snacks abroad | Account with DHL / FedEx / Aramex or an aggregator such as Shiprocket X | ☐ |

## Bank & compliance

- **FSSAI licence** (mandatory for selling food in India; its number is usually shown on the site and on packs)
- For international orders: an **Import Export Code (IEC)** and the courier's food-export requirements
  (labelling, ingredients list, shelf life); some countries restrict milk-based products

- Bank account in the business's name (linked in Razorpay for settlements)
- KYC documents for Razorpay (and Stripe, if used): PAN, GST certificate (if registered), business
  registration proof, address proof, cancelled cheque or bank statement
- GST details, if invoices should show GSTIN

## Before launch, we'll ask you to

1. Place a real test order with your own card or UPI and confirm you received the email and the payment in Razorpay.
2. Log in to the admin panel on your phone and update one product.
3. Confirm the admin mobile number(s) that should have access to the admin panel.
