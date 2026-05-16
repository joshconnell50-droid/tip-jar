// netlify/functions/stripe-webhook.js
// Receives Stripe webhook events. When a payment succeeds, it updates the
// counter stored in Netlify Blobs. Stripe sends a signed request; we verify
// the signature using the STRIPE_WEBHOOK_SECRET env var before trusting it.

import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Stripe needs the raw body to verify the signature, not parsed JSON.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // We only care about completed checkouts. A Stripe payment link fires
  // checkout.session.completed when the customer pays successfully.
  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object;

  // Pull amount in cents, then convert to dollars.
  const amountCents = session.amount_total || 0;
  const amountDollars = amountCents / 100;

  // Country comes from the billing details on the payment method, which Stripe
  // collects automatically for payment links. May be missing on some methods.
  const country =
    session.customer_details?.address?.country ||
    session.payment_method_details?.card?.country ||
    null;

  const store = getStore("tipjar");

  // Read current stats, update, write back. This is fine for a tip jar where
  // events arrive seconds apart; for very high throughput you'd want a
  // proper atomic counter, but Stripe webhooks won't pound this.
  const current = (await store.get("stats", { type: "json" })) || {
    totalCents: 0,
    tipCount: 0,
    countries: [],
    lastTipAt: null,
    lastTipCountry: null,
  };

  current.totalCents += amountCents;
  current.tipCount += 1;
  current.lastTipAt = new Date().toISOString();
  current.lastTipCountry = country;

  if (country && !current.countries.includes(country)) {
    current.countries.push(country);
  }

  await store.setJSON("stats", current);

  console.log(
    `Tip recorded: $${amountDollars.toFixed(2)} from ${country || "unknown"}. ` +
      `Total: $${(current.totalCents / 100).toFixed(2)} across ${current.tipCount} tips.`
  );

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// Tell Netlify not to parse the body — Stripe needs it raw for signature verification.
export const config = {
  path: "/api/stripe-webhook",
};
