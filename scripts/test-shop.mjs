const baseUrl = process.env.SHOP_TEST_BASE_URL || "http://localhost:4174";
const variantId = Number(process.env.SHOP_TEST_VARIANT_ID || 43);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = await fetch(baseUrl + "/shop-new");
assert(page.ok, "ShopNew page did not load.");
const html = await page.text();
assert(html.includes("Beer Is My Friend T-Shirt"), "Imported Shopify product is missing.");
assert(html.includes("Add to cart"), "Add-to-cart controls are missing.");

async function cart(quantity) {
  const response = await fetch(baseUrl + "/api/shop/cart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ variantId, quantity }] }),
  });
  const body = await response.json();
  assert(response.ok, body.error || "Cart validation failed.");
  return body;
}

const thresholdCart = await cart(3);
assert(thresholdCart.subtotalCents === 6000, "Expected three test shirts to total $60.");
assert(thresholdCart.bonusItem === null, "The bonus must require more than $75.");

const bonusCart = await cart(4);
assert(bonusCart.subtotalCents === 8000, "Multi-quantity cart total is wrong.");
assert(bonusCart.bonusItem?.unitPriceCents === 0, "The free bonus was not applied.");
assert(bonusCart.items.length === 2, "The merchandise and bonus lines were not returned.");
assert(!("orderNotificationEmail" in bonusCart.settings), "Internal shop settings must not be exposed by the cart API.");

const invalid = await fetch(baseUrl + "/api/shop/cart", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ items: [{ variantId, quantity: 100 }] }),
});
assert(invalid.status === 400, "Invalid cart quantities must be rejected.");

console.log("shop.tests_passed", { baseUrl, thresholdCents: 7500, bonus: bonusCart.bonusItem.productName });
