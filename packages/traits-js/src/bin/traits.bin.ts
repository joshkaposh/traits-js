import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { Project } from '../parser/project';
import { ResolverFactory } from 'oxc-resolver';
import { resolverOptions } from '../parser/resolve';

const { values, positionals: _ } = parseArgs({
    options: {
        register: {
            type: 'string'
        },
    },
});

const cwd = process.cwd();
const root = values.register ? join(cwd, values.register) : cwd;


const project = await Project.new(root);

console.log('Starting traits register...\n');
await project.init();

process.exit(0);