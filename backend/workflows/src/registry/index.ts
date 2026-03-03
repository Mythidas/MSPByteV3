import type { ActionDefinition, QueryDefinition, TicketTemplate } from '../types.js';

export const QUERY_REGISTRY = new Map<string, QueryDefinition>();
export const ACTION_REGISTRY = new Map<string, ActionDefinition>();
export const TEMPLATE_REGISTRY = new Map<string, TicketTemplate>();

export { executeFilterNode } from './internal/filter.js';
export { executeAlertNode } from './internal/alerts.js';
export { executeTagNode } from './internal/tags.js';
