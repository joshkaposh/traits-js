import type { Node } from "oxc-parser";
import type { FileRegistry, Reference } from "./storage/registry";

export function todo<T>(..._args: any[]): T {
    return void 0 as T;
}

export const timestamp = (label: string, then: number) => `${label}: ${((performance.now() - then) / 1000)}`;

export const format = (label: string, message: string, prefix: string, suffix: string) => `${prefix}${label}${suffix}${message}`

export const print = (label: string, message: string, padding?: number) => console.log(typeof padding === 'number' ? `${'-'.padStart(padding + 1, ' ')}${format(label, message, '', ': ')}` : `${format(label, message, '[ ', ' ]: ')}`);

export const getCode = (code: string, start: number, end: number) => code.slice(start, end);

export const getImportCodePoints = (code: string, imports: Record<string, number[]>) => {
    return Object.fromEntries(Object.entries(imports).map(([moduleRequest, locations]) => [moduleRequest, getCodePoints(code, locations)]))
}

export const addTypeRef = (registry: FileRegistry, node: Node, references: Reference[]) => {
    const name = node.type === 'TSTypeReference' && node.typeName.type === 'Identifier' ? node.typeName.name :
        node.type === 'TSTypeQuery' && node.exprName.type === 'Identifier' ? node.exprName.name : null;

    if (name === null) {
        // error: ident name is not identifier
    } else {
        const ref = registry.getType(name)!
        if (!ref) {
            // error: ref should exist
        } else {
            references.push(ref);
        }

    }


    // if (node.type === 'TSTypeReference' && node.typeName.type === 'Identifier' && file.hasType(node.typeName.name)) {
    //     references.push(node.typeName.name)
    // } else if (node.type === 'TSTypeQuery' && node.exprName.type === 'Identifier' && file.hasType(node.exprName.name)) {
    //     // console.log('TYPE QUERY: ', node.exprName.name);
    //     references.push(node.exprName.name);
    // }
}

export function createExportOrImportName(name: string, isType: boolean) {
    return `${isType ? 'type ' : ''}${name}`
}

export function createFilteredExportOrImportNames(references: Reference[]) {
    const varNames = new Set();
    const duplicates = new Set();
    const names = [];
    for (let i = 0; i < references.length; i++) {
        const reference = references[i]!;
        if (!reference.isType) {
            varNames.add(reference.name);
        } else if (varNames.has(reference.name)) {
            continue;
        }
        if (!duplicates.has(reference.name)) {
            names.push(createExportOrImportName(reference.name, reference.isType));
        }
        duplicates.add(reference.name);

    }
    return names;
    // console.log(createImportDeclaration(file.path, names));
    // console.log([createImportDeclaration(file.path, references.exportRefs.map(r => r))]);
}

export function createImportDeclaration(moduleRequest: string, names: string[]) {
    return `import { ${names.join(', ')} } from ${moduleRequest}`;
}

// export const addTypeRef = (file: TraitFile, node: Node, references: string[]) => {
//     if (node.type === 'TSTypeReference' && node.typeName.type === 'Identifier' && file.hasType(node.typeName.name)) {
//         // console.log('TYPE REF: ', node.typeName.name);
//         references.push(node.typeName.name)
//     } else if (node.type === 'TSTypeQuery' && node.exprName.type === 'Identifier' && file.hasType(node.exprName.name)) {
//         // console.log('TYPE QUERY: ', node.exprName.name);
//         references.push(node.exprName.name);
//     }
// }


export const getCodePoints = (code: string, locations: number[]): string[] => {
    const codePoints = [];
    for (let start = 0; start < locations.length; start += 2) {
        const end = start + 1;
        codePoints.push(code.slice(locations[start], locations[end]))
        // console.log('BODY (local): ', code.slice(locations[start], locations[end]));
    }
    // for (let index = 0; index < locs.length; index += 2) {
    //     const end = index + 1;
    //     codePoints.push(code.slice(index, end));
    // }
    return codePoints;
}