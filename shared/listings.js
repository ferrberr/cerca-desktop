import {withinArea} from './geo.js';

const ANALYSIS_INPUTS = ['title', 'spec', 'description', 'price', 'condition', 'available', 'reserved'];
const ANALYSIS_FIELDS = ['accepted', 'match', 'reason', 'analysisQuery', 'decisionModel', 'decisionSource', 'decisionCategory', 'decisionConfidence', 'decisionChecks'];

// The city label is descriptive. Geographic limits are measured from the selected centre.
export function matchesFilters(item, filters = {}) {
  return Number.isFinite(item.price) && item.price >= (filters.minPrice ?? 0)
    && item.price <= (filters.maxPrice ?? Infinity)
    && item.available !== false && !item.reserved
    && (!filters.condition || filters.condition === 'Cualquiera' || item.condition === filters.condition)
    && (!filters.source || filters.source === 'Todos' || item.source === filters.source)
    && withinArea(item, {center: filters.center, radius: filters.radius ?? 500, zone: filters.zone});
}

// Raw source updates must not preserve an inference about different listing content.
// A new decision already refers to the incoming content and takes precedence.
export function mergeListing(previous = {}, incoming) {
  const merged = {...previous, ...incoming};
  const changed = ANALYSIS_INPUTS.some(key => Object.hasOwn(incoming, key) && incoming[key] !== previous[key]);
  const freshAnalysis = incoming.analyzed === true && typeof incoming.accepted === 'boolean';
  if (incoming.analyzed === false || changed && !freshAnalysis) {
    merged.analyzed = false;
    for (const key of ANALYSIS_FIELDS) delete merged[key];
  }
  return merged;
}
