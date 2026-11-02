const Stripe = require('stripe');
// Replace with your actual Stripe secret API key (or use process.env.STRIPE_SECRET_KEY)
const stripe = Stripe('sk_test_YOUR_SECRET_KEY');

async function bulkUpdatePrices() {
  try {
    // 1. List all active products
    const products = await stripe.products.list({ active: true, limit: 100 });

    for (const product of products.data) {
      console.log(`Processing product: ${product.name} (${product.id})`);

      // 2. Find the current default price for the product
      if (product.default_price) {
        const oldPrice = await stripe.prices.retrieve(product.default_price);
        
        // Example logic: Create a new price that is 20% lower (rounded to cents)
        // Or you can map from a custom data source/dictionary
        const oldAmount = oldPrice.unit_amount;
        const newAmount = Math.round(oldAmount * 0.80); // 20% discount example

        console.log(` - Creating new price: ${newAmount} ${oldPrice.currency.toUpperCase()}`);

        // 3. Create the new Price object
        const newPriceParams = {
          product: product.id,
          unit_amount: newAmount,
          currency: oldPrice.currency,
        };

        // Preserve recurring interval if it's a subscription product
        if (oldPrice.recurring) {
          newPriceParams.recurring = { interval: oldPrice.recurring.interval };
        }

        const newPrice = await stripe.prices.create(newPriceParams);

        // 4. Update the product's default price to the new one
        await stripe.products.update(product.id, {
          default_price: newPrice.id,
        });

        // 5. Archive the old price so it can no longer be purchased
        await stripe.prices.update(oldPrice.id, {
          active: false,
        });

        console.log(` ✔ Successfully migrated to new price ID: ${newPrice.id}\n`);
      } else {
        console.log(` ⚠ Skipped: No default price found for ${product.name}\n`);
      }
    }

    console.log('Bulk price update complete!');
  } catch (error) {
    console.error('Error updating prices:', error);
  }
}

bulkUpdatePrices();
