import { timestamp } from './helpers';
import { Project } from './project';

export type { ProjectOptions } from './project';

// export async function register(filePath: string) {
//     const project = new Project({
//         cwd: filePath,
//     });

//     let then = performance.now();

//     console.log('Starting traits register...\n');
//     const stack = await project.createStack();
//     console.log(timestamp('resolve-entry', then));

//     then = performance.now();

//     console.log('-'.repeat(32));

//     await project.register(stack);

//     console.log(timestamp('scan', then));

//     then = performance.now();
//     project.initialize();
//     console.log(timestamp('initialize', then));

//     process.exit(0);
// }
