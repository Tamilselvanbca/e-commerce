# Admin Panel Guide

A guide to running the store day to day. The admin panel works on a computer and on a phone.

## Logging in

1. Go to `https://yourstore.com/login` and enter your mobile number.
2. Enter the 6-digit code you receive by SMS.
3. Open `https://yourstore.com/admin`, or use **Admin panel** under *My account*.

Only numbers given admin access can open the admin panel. To give a colleague access, ask them to log in
once on the store, then open **Customers → their name → Make admin**.

## Dashboard

Choose **7, 30 or 90 days** at the top right. Every figure covers that period and compares it with the period before.

| Tile / chart | Meaning |
| --- | --- |
| Revenue | Total of **paid** orders (cancelled-and-refunded orders excluded) |
| Paid orders / Avg. order value | Number of paid orders and their average value |
| New customers | People who signed in for the first time |
| Pending fulfilment | Paid orders not shipped yet. Click it to see them. |
| Revenue by day | Daily paid revenue. Hover over or tap a day for details, or use **Show table**. |
| Orders by status, Payment gateways | How orders are spread across statuses, and Razorpay vs Stripe |
| Top products, Low stock | Best sellers by revenue, and sizes/colours about to run out (5 or fewer) |

## Orders

### How an order moves

```
Awaiting payment ─► Confirmed ─► Processing ─► Shipped ─► Delivered
        │               │             │
        └───────────────┴─────────────┴──► Cancelled
```

- **Awaiting payment**: the customer started checkout but hasn't paid. Stock is held for 30 minutes; if they
  don't pay, the order is cancelled automatically and the stock is released. You don't need to do anything.
- **Confirmed**: payment received. You and the customer both get an email.
- **Processing**: you're packing it (optional step).
- **Shipped**: handed to the courier. The customer is emailed the courier name and tracking number.
- **Delivered**: the customer is emailed.

### Shipping an order

Open the order from **Orders**, then in the **Fulfilment** panel either:

- **Add shipment**: type the courier (e.g. Delhivery) and the AWB/tracking number, plus an optional tracking
  link, then **Save and mark shipped**. Or
- **Ship with Shiprocket** (if your store uses Shiprocket): enter the parcel weight and size, or leave them
  blank for the defaults. Shiprocket creates the shipment and picks a courier. Then schedule the pickup in
  your Shiprocket panel as usual.

When it arrives, use **Mark as delivered**.

### International orders

Orders with a delivery address outside India show the country in the shipping address and are charged the
international shipping rate. Shiprocket only ships within India, so book these with your international
courier (DHL, FedEx, Aramex…) and enter the courier and tracking number with **Add shipment**. Pack only
shelf-stable items for international orders, and include any customs paperwork the courier needs.

### Cancellations and refunds

1. Open the order and choose **Cancel order**. Add a reason; it's included in the customer's email.
   The items go back into stock automatically.
2. If the customer had paid, refund them in the **Razorpay** (or **Stripe**) dashboard. The admin panel
   doesn't move money.
3. Back on the order, choose **Mark refunded** so your records match.

Any amount paid with a **gift card** goes back on the card automatically when the order is cancelled, so
you only refund the part paid online (shown as **Paid online** on the order). Orders paid entirely by gift
card need no refund at all.

### Finding orders

Use the status tabs, the payment filter, the date range, or search by order number, customer name or phone.

## Products

### Adding a product

**Products → New product**, then fill in:

- **Name** and **Description**. Line breaks are kept on the product page. The URL slug fills itself in from the name.
- **Category**, plus **Visibility**:
  - *Active*: shown in the store
  - *Draft*: hidden while you work on it
  - *Archived*: hidden and kept for records
- **Featured on the home page**: shows the product in the home page's *Featured* row.
- **Images**: drag photos onto the upload tile or click it (JPEG, PNG, WebP; up to 5 MB each).
  - The **first image is the cover** shown in listings. Use the arrows to reorder.
  - Add a short description in **Alt text** for screen readers and search engines.
- **Variants**: one row per sellable **pack size** / **flavour** combination, each with its own **SKU**,
  **Price**, optional **Compare-at** price (the "MRP" shown struck through, which must be higher than the
  price), **Stock** and **Active** switch.
  - **Generate variants from pack sizes and flavours…** builds every combination at once, e.g. pack sizes
    `250 g, 500 g, 1 kg` × flavours `Classic, Kesar` gives six rows. Pack sizes sort by weight automatically.
  - Most products only need pack sizes; leave **Flavour** empty. The small colour dot next to a flavour is
    optional and only decorates the flavour button.
- **Description**: start with a short line about the product, then add `Ingredients:`, `Shelf life:` and
  whether it ships abroad (milk-based sweets usually shouldn't). Line breaks are kept.

Prices are entered in rupees. Click **Create product** / **Save changes**. If something needs fixing, the
field is highlighted with a message.

### Updating stock and prices

Open the product, change **Stock** or **Price** in the variants table, and **Save changes**. Stock goes down
automatically when customers pay, and comes back when unpaid orders expire or orders are cancelled.

Removing a variant that was sold before keeps it in old orders but hides it from the store.

### Taking a product off the store

Set **Visibility** to *Draft*, or use **Archive**. Archived products disappear from the store and from
the default product list (filter by *Archived* to see them again).

## Categories

**Categories → New category**: give it a name and optionally a **Parent** (e.g. *Kurtas* under *Women*),
a **Sort order** (lower numbers appear first in menus), an image and a description. Untick **Active** to
hide a category without deleting it. Deleting a category leaves its products uncategorised; it doesn't delete them.

## Customers

Search by name, phone or email. A customer's page shows their orders, total spent and saved addresses.

- **Block customer**: signs them out everywhere and stops them logging in. Use **Unblock** to reverse it.
- **Make admin / Remove admin**: gives or removes access to this admin panel. You can't remove your own access.

## Bulk enquiries (WhatsApp orders)

Customers can ask for bulk pricing from any product page, the cart, or the *Bulk orders* page. Each enquiry
shows their contact details, the products and quantities, and their message. You also get an email alert
(and a WhatsApp alert if WATI is set up).

1. Click **Chat on WhatsApp** to reply from your WhatsApp Business app with the details pre-filled.
2. Set the **Status** as you go: *New* → *Contacted* → *Converted* (they ordered) or *Closed*.
3. Use **Admin notes** for quotes, follow-up dates or delivery terms, then **Save notes**.

## Reviews

Customers can review a product once they have a paid order containing it; each review shows a
**Verified purchase** badge, the customer's first name and initial, and their city. Reviews go live
immediately, and the star rating on product cards and pages updates automatically.

Under **Reviews** you can filter by status or rating and search by text, customer or product.

- **Hide**: removes the review from the store but keeps it, and **Publish** brings it back. Use this for
  off-topic or abusive content.
- **Delete**: removes the review permanently.
- Please don't hide honest negative reviews; reply to the customer directly instead. Genuine mixed reviews
  build trust.

## Discounts

Under **Discounts → New discount** choose how customers get it:

- **Discount code**: customers type the code (e.g. `DIWALI10`) at checkout. Codes aren't case sensitive.
- **Automatic offer**: applies by itself when the cart qualifies, e.g. "₹100 off orders above ₹1,999".
  Customers close to an offer see "Add ₹X more to get …" at checkout.

Then set the value (a percentage with an optional cap, a fixed amount, or free shipping) and any
conditions: minimum order, India-only or international-only, total uses, uses per customer, first order
only, and start/end dates.

- Only **one discount applies per order**. If a code and an automatic offer both qualify, the customer
  gets whichever saves more, and checkout explains why.
- A discount counts as used once an order with it is placed. If that order is cancelled or never paid,
  the use is given back.
- Use the switch in the list to pause a discount. A discount that has been used can't be deleted (it's
  part of the order history), but it can be switched off.

## Gift cards

**Gift cards → Issue gift card**: pick an amount, the recipient's name and email, an optional "From" name,
message and expiry date (one year by default). With **Send by email** ticked, the recipient gets a branded
email with the 16-character code, such as `K7QM-2XPA-9RTW-4HNE`.

- Customers enter the code at checkout under **Gift card**. It can pay for part of an order (the rest is
  paid online) or all of it, and works together with a discount code. Unused balance stays on the card.
- Anyone can check a balance on the store's **Gift cards** page (linked in the footer).
- On a card's page you can **Copy code**, **Email again**, **Adjust balance** (add or remove, with a
  reason), edit the recipient or expiry, or **Disable** it. The **History** lists every use with its order.
- The header of the list shows the total unspent balance across active cards.

**Selling gift cards online:** customers buy them on the **Gift cards** page (₹100 to ₹50,000, paid with
Razorpay or Stripe). Once paid, the card is created and emailed to the recipient automatically, valid for a
year, and the order appears under **Orders** as already delivered, with a link to the card. To refund one,
disable the card first, then refund the payment in the Razorpay/Stripe dashboard.

For corporate or bulk gifting, take the order on WhatsApp or the enquiry form, collect payment, then issue
the cards here.

## Settings

**Settings** holds the store's configuration: store details and FSSAI number, delivery charges and
Shiprocket, the login OTP sender (Twilio Verify, Twilio SMS or MSG91) and order SMS, Razorpay and Stripe
keys, email (SMTP) and new-order alerts, image storage, and WhatsApp.

- Each section has its own **Save changes** button. Changes apply to the live store immediately.
- Each setting shows where its value comes from: **Saved here**, **From .env** (the server file) or
  **Default**. **Use .env value** removes the saved value.
- Keys and passwords (secrets) are stored encrypted and never shown again; you only see the last four
  characters. Use **Replace** to enter a new one or **Remove** to clear it.
- **Login OTP & SMS → Choose from my Twilio templates** lists your Twilio Verify message templates so you
  can pick the wording of the login SMS.
- **Email → Send a test email** checks the saved SMTP settings.
- Double-check before saving the OTP or Twilio settings: if they're wrong, nobody (including you) can
  receive a login code. If that happens, your developer can fix the value on the server.

## Good habits

- Check **Pending fulfilment** on the dashboard every morning.
- Keep an eye on **Low stock** and restock before items sell out.
- Add a tracking number to every shipment; customers can then track the order themselves and contact you less.
- Glance at new reviews each week; they're the quickest way to spot packing or freshness issues.
