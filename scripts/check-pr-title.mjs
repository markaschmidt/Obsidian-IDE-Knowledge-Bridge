import { titleAccepted, titleHint } from './release-policy.mjs';

const title = process.env.PR_TITLE ?? '';
const base = process.env.PR_BASE ?? '';
if (!titleAccepted(title, base)) {
  console.error(titleHint(base));
  console.error(`Received title: ${title}`);
  process.exit(1);
}
console.log('PR title accepted');
