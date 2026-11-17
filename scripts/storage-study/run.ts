import { storageStudy } from './profile.js';
const [modules = '16', functions = '80', ...extra] = process.argv.slice(2);
if (extra.length || ![modules, functions].every(value => /^[1-9]\d*$/.test(value) && Number(value) <= 200)) {
  throw Error('Usage: pnpm benchmark:storage [modules 1..200] [functions 1..200]');
}
console.log(JSON.stringify(await storageStudy(Number(modules), Number(functions)), null, 2));
