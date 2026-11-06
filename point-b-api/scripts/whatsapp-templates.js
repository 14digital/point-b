// Prints the WhatsApp templates to submit in WhatsApp Manager (category Utility, language English), with sample values.
// Source of truth: src/common/whatsapp-templates.ts. Run `npm run build` first, then `npm run whatsapp:templates`.
const { WHATSAPP_TEMPLATES } = require('../dist/common/whatsapp-templates.js');

const out = ['# WhatsApp templates', '', 'Create each one in WhatsApp Manager → Message templates → Create template.', 'Category: **Utility**. Language: **English** (`en`). Paste the body exactly, then give the sample values in order.', ''];
for (const t of Object.values(WHATSAPP_TEMPLATES)) {
  out.push(`## ${t.name}`, '', '```', t.body, '```', '', '| Variable | Means | Sample |', '|---|---|---|');
  t.params.forEach((p, i) => out.push(`| {{${i + 1}}} | ${p} | ${t.sample[i]} |`));
  out.push('');
}
console.log(out.join('\n'));
