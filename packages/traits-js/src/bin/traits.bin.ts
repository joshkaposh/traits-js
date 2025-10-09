import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { Project } from '../parser/project';

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

console.log('Starting traits register...\n');
await project.addSourceFiles(await project.createStack());

process.exit(0);