import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import pc from 'picocolors';
import type { NapiResolveOptions, ResolverFactory } from "oxc-resolver";
import { parseSync } from 'oxc-parser';
import type { ParseResult } from "oxc-parser";
import { CONFIG_NAMES, DEFAULT_INDEX_FILTER, DEFAULT_TRAIT_FILTER } from './constants';
import type { TraitConfig } from '../lib/config';

export type ParseFileResultResult = {
    result: ParseResult;
    path: string;
    directory: string;
    packageJson: string | undefined,
    name: string;
    originalCode: string;
};

export type ParseFileResult = ParseFileResultResult | string[];


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

export function resolverOptions(resolverOptions?: NapiResolveOptions) {
    if (!resolverOptions) {
        resolverOptions = Object.create(null) as NapiResolveOptions;
    }

    resolverOptions.preferAbsolute = true;
    resolverOptions.extensions = Array.from(new Set(resolverOptions.extensions ?? []).union(new Set(['.ts'])))
    return resolverOptions;
}




const configErrorMessage = (type: string, path: string, message: string) => `${pc.red(`ConfigError - ${type}:`)}\n${formatPath(path)}${message}\n`;

function formatPath(path: string, useFileName?: boolean) {
    if (useFileName) {
        let index = path.length - 1;
        while (index > 0) {
            const char = path.at(index)!;
            if (char === '/' || char === '\\') {
                index += 1;
                break;
            }
            index -= 1;
        }

        path = path.slice(index);
    }

    return `[ ${path} ]`;
}

export async function parseConfig(cwd: string): Promise<Required<TraitConfig> | string> {
    let path;

    for (let i = 0; i < CONFIG_NAMES.length; i++) {
        const p = join(cwd, CONFIG_NAMES[i]!);
        if (existsSync(p)) {
            path = p;
            break;
        }
    }

    if (!path) {
        return configErrorMessage('NoConfigFile', cwd, '\ndirectory has no {trait,traits}.config.{ts,js} file');
    }

    const module = await import(path);
    const config = module.default as unknown;
    const parsed: Partial<TraitConfig> = {
        cwd: cwd,
    };

    let errors = '';
    if (config) {
        if (typeof config === 'object') {
            parsed.indexFileNameFilter = 'indexFileNameFilter' in config && typeof config.indexFileNameFilter === 'string' ?
                config.indexFileNameFilter :
                DEFAULT_INDEX_FILTER;

            parsed.traitFileNameFilter = 'traitFileNameFilter' in config && typeof config.traitFileNameFilter === 'string' ?
                config.traitFileNameFilter :
                DEFAULT_TRAIT_FILTER;

            if ('traits' in config) {
                if (typeof config.traits === 'string') {
                    const path = join(cwd, config.traits);
                    if (existsSync(path)) {
                        parsed.traits = path;
                        return parsed as Required<TraitConfig>;
                    } else {
                        errors += configErrorMessage('FileNotFound', path, `\n${pc.yellow('...has a trait entry path')} ${formatPath(path)}\n${pc.yellow('...but no file exists at that path.')}`);
                    }
                } else {
                    errors += configErrorMessage('TraitsFieldTypeNotEqualString', path, `\n${pc.yellow('...')}expected typeof config.traits to equal "string", but was "${typeof config.traits}"`);
                }

            } else {
                errors += configErrorMessage('NoTraitsField', path, '\n...expected config.traits field to exist');
            }

        } else {
            errors += configErrorMessage('DefaultExportInvalidType', path, `\n...expected default export to be type "object", but was ${typeof config}`);
        }
    } else {
        errors += configErrorMessage('NoDefaultExport', path, '\n...expected a default export.');
    }

    if (errors.length) {
        return errors
    } else {
        return parsed as Required<TraitConfig>;
    }

}

export async function getConfig(root: string) {
    const entryOrError = await parseConfig(root);
    if (typeof entryOrError === 'string') {
        console.log(entryOrError);
        process.exit(1);
    }
    return entryOrError;
}

