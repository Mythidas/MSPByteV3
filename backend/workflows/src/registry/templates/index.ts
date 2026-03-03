import { TEMPLATE_REGISTRY } from '../index.js';
import { IdentityContainmentTemplate } from './identity-containment.js';

const templates = [IdentityContainmentTemplate];

for (const tmpl of templates) {
  TEMPLATE_REGISTRY.set(tmpl.key, tmpl);
}
