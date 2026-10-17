/* Acrobat-compatible JavaScript. Embedded in each calculated field by the PDF builder. */
function aviFlightValue(doc, fieldName) {
  function raw(name) {
    var field = doc.getField(name);
    return field && field.value !== null && typeof field.value !== "undefined" ? String(field.value) : "";
  }
  function amount(name) {
    var value = parseFloat(raw(name).replace(/[$,\s]/g, ""));
    return isFinite(value) ? value : 0;
  }
  function quantity(name) {
    var value = raw(name).replace(/^\s+|\s+$/g, "").toLowerCase();
    if (/^\d+$/.test(value)) return Math.min(99, parseInt(value, 10));
    return /^(x|yes|y|on|true|checked)$/.test(value) ? 1 : 0;
  }
  function count(names) {
    var total = 0;
    for (var i = 0; i < names.length; i++) total += quantity(names[i]);
    return total;
  }
  function money(value) {
    return (Math.round((value + 0.000000001) * 100) / 100).toFixed(2);
  }
  var packages = [
    { field: "package_brewery_social", rate: 32, apps: 2, entrees: 2, sides: 2, salads: 0 },
    { field: "package_aviator_feast", rate: 38, apps: 3, entrees: 2, sides: 2, salads: 1 },
    { field: "package_ready_room_dinner", rate: 44, apps: 3, entrees: 2, sides: 2, salads: 1 }
  ];
  var pkg = null;
  for (var p = 0; p < packages.length; p++) if (quantity(packages[p].field)) pkg = packages[p];
  var guests = Math.max(0, Math.floor(amount("guest_count")));
  var apps = count(["app_hush_puppies", "app_tater_tots", "app_chips_salsa", "app_caprese_skewers", "app_brewer_fries", "app_sweet_potato_fries", "premium_app_shrimp_cocktail", "premium_app_brisket_crostini"]);
  var pizza = Math.max(quantity("entree_pizza_bar"), quantity("pizza_included_entree") + quantity("pizza_extra_entree"));
  var regularEntrees = pizza + count(["entree_pulled_pork", "entree_country_chicken", "entree_meatloaf", "entree_tenders", "entree_wings"]);
  var premiumEntrees = count(["premium_flat_iron", "premium_brisket", "premium_herb_chicken", "premium_bourbon_chicken"]);
  var entrees = regularEntrees + premiumEntrees;
  var sides = count(["side_mac_and_cheese", "side_collard_greens", "side_broccoli_salad", "side_tomato_cucumber_salad", "side_potato_salad", "side_french_fries", "side_tater_tots"]);
  var salads = count(["salad_caesar_salad", "salad_greek_salad", "salad_spinach_caprese_salad", "salad_chicken_cobb_salad"]);
  /* Page 3 specifies TOTAL extras, so marking an automatically counted extra again does not double-charge it. */
  var extraApps = pkg ? Math.max(0, apps - pkg.apps, quantity("extra_app")) : 0;
  var extraEntrees = pkg ? Math.max(0, entrees - pkg.entrees, quantity("extra_entree"), quantity("pizza_extra_entree")) : 0;
  var extraSides = pkg ? Math.max(0, sides - pkg.sides, quantity("extra_side")) : 0;
  var extraSalads = pkg ? Math.max(0, salads - pkg.salads, quantity("extra_salad")) : 0;
  var pizzaExtras = Math.min(extraEntrees, quantity("pizza_extra_entree"));
  var premiumApps = count(["premium_app_shrimp_cocktail", "premium_app_brisket_crostini"]);
  /* Regular choices occupy included slots first. Page 3 can specify how many premium choices are extras. */
  var automaticPremiumExtras = pkg ? Math.max(0, premiumEntrees - Math.max(0, pkg.entrees - regularEntrees)) : 0;
  var premiumExtras = raw("extra_premium_entree").replace(/\s/g, "") === "" ? automaticPremiumExtras : quantity("extra_premium_entree");
  premiumExtras = Math.min(premiumEntrees, extraEntrees, premiumExtras);
  var premiumReplacements = pkg && pkg.field !== "package_ready_room_dinner" ? premiumEntrees - premiumExtras : 0;
  var premiumUpgrades = premiumReplacements + premiumExtras;
  var foodPerGuest = extraApps * 3 + (extraEntrees - pizzaExtras) * 5 + extraSides * 3 + extraSalads * 3 + premiumApps * 3 + premiumUpgrades * 2 + quantity("extra_dessert") * 6 + quantity("extra_coffee") * 3;
  var selectedFoodPerGuest = extraApps * 3 + extraEntrees * 5 + extraSides * 3 + extraSalads * 3 + premiumApps * 3 + premiumUpgrades * 2;
  var ready = pkg && guests > 0;
  if (fieldName === "summary_selection_extras") {
    return pkg ? "Extras: " + extraApps + " app, " + extraEntrees + " entree, " + extraSides + " side, " + extraSalads + " salad | Premium app " + premiumApps + " x $3; entree " + premiumUpgrades + " x $2 | +$" + money(selectedFoodPerGuest) + " / guest" : "Choose a package to calculate extra food selections.";
  }
  if (fieldName === "summary_guests") return guests > 0 ? String(guests) : "";
  if (fieldName === "summary_package_rate") return pkg ? money(pkg.rate) : "";
  if (fieldName === "summary_package_subtotal") return ready ? money(guests * pkg.rate) : "";
  if (fieldName === "summary_specialty_pizza") return ready ? money(guests * pizzaExtras * 5) : "";
  if (fieldName === "summary_food_extras") return ready ? money(guests * foodPerGuest) : "";
  if (fieldName === "summary_event_hours") return money(quantity("extra_hour") * 100);
  var subtotal = amount("summary_package_subtotal") + amount("summary_specialty_pizza") + amount("summary_food_extras") + amount("summary_event_hours") + amount("summary_bar") + amount("summary_other");
  if (fieldName === "summary_subtotal") return subtotal ? money(subtotal) : "";
  if (fieldName === "summary_tax") return subtotal ? money(subtotal * 0.0725) : "";
  if (fieldName === "summary_pfb_tax") return subtotal ? money(subtotal * 0.01) : "";
  if (fieldName === "summary_balance") return subtotal ? money(subtotal + amount("summary_tax") + amount("summary_pfb_tax") - amount("summary_deposit")) : "";
  return "";
}
