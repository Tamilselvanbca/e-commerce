-- How a payment was made, for order pages: { method: card|upi|netbanking|wallet|emi|…,
-- network, cardType, last4, issuer, bank, wallet, vpa (masked) }. Taken from the
-- gateway (Razorpay payment / Stripe charge); never full card numbers.
ALTER TABLE payments
  ADD COLUMN method_details JSON NULL AFTER error;
