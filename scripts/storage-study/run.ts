import { storageStudy } from './profile.js';

const dimensions = process.argv.slice(2);
const compareCodecs = dimensions.at(-1) === '--compare-codecs';
if (compareCodecs) dimensions.pop();
const [modules = '16', functions = '80'] = dimensions;
if (dimensions.length > 2 || ![modules, functions].every(value => /^[1-9]\d*$/.test(value) && Number(value) <= 200)) {
  throw Error('Usage: pnpm benchmark:storage [modules 1..200] [functions 1..200] [--compare-codecs]');
}
console.log(JSON.stringify(await storageStudy(Number(modules), Number(functions), compareCodecs), null, 2));
