import { parseArgs } from 'node:util';
import { register } from '../parser';
import { join } from 'node:path';

const { values, positionals } = parseArgs({
    options: {
        register: {
            type: 'string'
        },
    },
});

const cwd = process.cwd();
const root = values.register ? join(cwd, values.register) : cwd;
await register(root);