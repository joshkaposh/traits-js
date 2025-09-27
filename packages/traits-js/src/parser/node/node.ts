import { type Declaration, type Node, type TSInterfaceDeclaration, type TSTypeAliasDeclaration, type TSTypeLiteral, type VariableDeclaration } from 'oxc-parser';

export function typeDeclarationSignatures(node: TSInterfaceDeclaration | TSTypeAliasDeclaration | TSTypeLiteral) {
    if (node.type === 'TSInterfaceDeclaration') {
        return node.body.body;
    } else if (node.type === 'TSTypeLiteral') {
        return node.members;
    } else if (node.type === 'TSTypeAliasDeclaration' && node.typeAnnotation.type === 'TSTypeLiteral') {
        return node.typeAnnotation.members
    }
}

export function declarationName(node: Node): void | string {
    if (node.type === 'ExportNamedDeclaration') {
        const declaration = node.declaration;
        if (declaration?.type === 'VariableDeclaration') {
            return variableName(declaration);
        } else if (declaration?.type === 'TSInterfaceDeclaration' || declaration?.type === 'TSTypeAliasDeclaration') {
            return declaration.id.name;
        }
    } else if (node.type === 'VariableDeclaration') {
        return variableName(node);
    }
}

export function variableName(variable: VariableDeclaration) {
    const id = variable.declarations[0]?.id;
    if (id?.type === 'Identifier') {
        return id.name;
    }
}

export function isDeclaredInModule(parent: Node, node: Node): node is Declaration {
    return (
        parent?.type === 'Program'
        || parent?.type === 'ExportNamedDeclaration'
        || parent?.type === 'ExportDefaultDeclaration'
    ) && isDeclaration(parent, node);
}

export function isDeclaration(parent: Node | null, node: Node): node is Declaration {
    if (!parent) {
        return false;
    }

    if (!(parent.type === 'Program'
        || parent.type === 'ExportNamedDeclaration'
        || parent.type === 'ExportDefaultDeclaration')
    ) {
        return false;
    }

    const t = node.type;
    return (
        t === 'VariableDeclaration'
        || t === 'FunctionDeclaration'
        || t === 'ClassDeclaration'
        || t === 'TSTypeAliasDeclaration'
        || t === 'TSInterfaceDeclaration'
        || t === 'TSEnumDeclaration'
    );
}

// export function isTypeDeclaration(node: Node): node is TSInterfaceDeclaration | TSTypeAliasDeclaration {
//     return node.type === 'TSInterfaceDeclaration' || node.type === 'TSTypeAliasDeclaration';
// }





// export type ImportDeclarationInfo = {
//     type: 0;
//     node: ImportDeclaration;
// };

// export type ModuleDeclarationInfo = {
//     type: 1;
//     name: string;
//     parent: ExportNamedDeclaration | null;
//     node: Declaration;
//     variable: boolean;
// };

// export type TraitDeclarationInfo = {
//     type: 2;
//     name: string;
//     parent: ExportNamedDeclaration;
//     node: TraitDeclaration;
// };

// export type DeclarationInfo = ModuleDeclarationInfo | TraitDeclarationInfo | ImportDeclarationInfo;

// export function declarationInfo(node: Declaration | ExportNamedDeclaration | ImportDeclaration): void | DeclarationInfo {
//     const parent = node.type === 'ExportNamedDeclaration' ? node : null;
//     const declaration = (node.type === 'ExportNamedDeclaration' ? node.declaration : node);

//     if (!declaration) {
//         return;
//     }

//     if ((parent && (declaration?.type === 'VariableDeclaration'))) {
//         const declarator = declaration.declarations[0]!;
//         // const isTrait = (declaration.abstract ?? false) && declaration.decorators.findIndex(d => d.expression.type === 'Identifier' && d.expression.name === 'Trait') !== -1;
//         // return isTrait ? {
//         //     parent: parent,
//         //     node: declaration as TraitDeclaration,
//         //     type: BindingKind.Trait,
//         //     name: declaration.id.name,
//         // } : {
//         //     parent: parent,
//         //     node: declaration,
//         //     name: declaration.id.name,
//         //     type: BindingKind.Module,
//         //     variable: true,
//         // };

//     } else if (declaration.type === 'ImportDeclaration') {
//         return {
//             node: declaration,
//             type: BindingKind.Import,
//         }
//     } else {
//         const name = declarationName(declaration);
//         const variable = (declaration.type !== 'TSInterfaceDeclaration' && declaration.type !== 'TSTypeAliasDeclaration');
//         return name ? {
//             parent: parent,
//             node: declaration,
//             name: name,
//             type: 1,
//             variable: variable,
//         } : void 0;
//     }
// }