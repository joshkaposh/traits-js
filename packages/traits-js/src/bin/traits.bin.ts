import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { Project } from '../parser/project';
import { timestamp } from '../parser/helpers';

const { values, positionals: _ } = parseArgs({
    options: {
        register: {
            type: 'string'
        },
    },
});

const cwd = process.cwd();
const root = values.register ? join(cwd, values.register) : cwd;

const project = new Project({
    cwd: root,
});

let then = performance.now();

console.log('Starting traits register...\n');
const stack = await project.createStack();
console.log(timestamp('resolve-entry', then));

then = performance.now();

await project.register(stack);

console.log(timestamp('register', then));

then = performance.now();
project.initialize();
console.log(timestamp('initialize', then));

process.exit(0);