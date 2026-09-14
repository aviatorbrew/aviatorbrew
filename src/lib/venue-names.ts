// Preserve saved manager copy while updating the venue's former display names.
// Apply only to display text; existing slugs, asset paths, and links stay valid.
export function updateLegacyVenueName(value: string): string {
  return value.replace(/\b(?:the\s+)?(?:aviator\s+)?speakeasy(?:\s+liquor\s+lounge)?\b/gi, "The Whiskey Bar");
}
