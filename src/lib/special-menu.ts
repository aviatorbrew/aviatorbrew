// Menu headings stay editable in the existing event description: NAME | $17.76,
// followed by the meal description. Other paragraphs remain ordinary copy.
export function parseSpecialMenu(description: string) {
  return description.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map(block => {
    const text = block.trim();
    const meal = text.match(/^(.+?)\s*\|\s*(\$\d+(?:\.\d{2})?)\s*\n([\s\S]+)$/);
    return meal ? { kind: "meal" as const, name: meal[1].trim(), price: meal[2], description: meal[3].trim() } : { kind: "text" as const, text };
  }).filter(block => block.kind === "meal" || block.text);
}
