import { compareSavedQueries } from './saved-query.js';
console.log(JSON.stringify(await compareSavedQueries(16, 80), null, 2));
