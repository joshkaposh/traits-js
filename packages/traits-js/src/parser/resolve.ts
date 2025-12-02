import { existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { ResolverFactory } from "oxc-resolver";
import type { ParseFileResult, ParseFileResultResult } from "./types";
import { parseSync } from 'oxc-parser';

export function checkParseResult(result: ParseFileResult, path: string): asserts result is ParseFileResultResult {
    if (Array.isArray(result)) {
        console.error(`(traits-js) - Encountered errors in config file: ${path}`);
        console.log(result.join('\n'));
        process.exit(1);
    }
}


export async function resolve(
    resolver: ResolverFactory,
    /**
    * can be a path to a file or a directory
    */
    path: string,
    indexFileNameFilter: string
): Promise<ParseFileResult> {
    const errors: string[] = [];
    // console.log('RESOLVE: ', path);

    if (existsSync(path)) {
        // console.log('RESOLVE: path exists!');
        const file = Bun.file(path);
        const stats = await file.stat();
        let result!: ParseFileResultResult;
        const resolved = resolver.sync(path, './');
        // console.log('RESOLVER: ', resolved);


        if (stats.isDirectory()) {
            // console.log('RESOLVE: path is directory!');
            if (resolved.path) {
                const absolutePath = resolved.path;
                // console.log('found final path: ', absolutePath);

                const file = Bun.file(absolutePath);
                const name = basename(path);
                const code = await file.text();
                // TODO: figure out why parseSync doesnt add range
                // TODO: `collectBindings` replaces every node with itself and a range property
                result = {
                    name: name,
                    packageJson: resolved.packageJsonPath,
                    directory: path,
                    path: absolutePath,
                    originalCode: code,
                    result: parseSync(name, code, {
                        astType: 'ts',
                        lang: 'ts',
                        sourceType: 'module',
                        range: true,
                    })
                };
            } else {
                errors.push(`Project has no index file (tried finding ${indexFileNameFilter} in directory ${path})`);
            }

        } else {

            const name = basename(path);
            const code = await file.text();
            const resolved = resolver.sync(path, './');

            result = {
                name: name,
                path: path,
                packageJson: resolved.packageJsonPath,
                directory: dirname(path),
                originalCode: code,
                result: parseSync(name, code, {
                    astType: 'ts',
                })
            };
        }

        return errors.length ? errors : result;

    } else {
        return [`invalid path: ${path}`];
    }

}
