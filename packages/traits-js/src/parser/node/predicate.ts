import type { Declaration, Node } from "oxc-parser";
import type { ConstVariableDeclaration, ImplDeclaration, ImplStatement } from "./types";

export function constDeclaration(node: Node): node is ConstVariableDeclaration {
    return node.type === 'VariableDeclaration'
        && node.kind === 'const'
}

export function constVariableDeclaration(node: Node): node is ConstVariableDeclaration {
    return constDeclaration(node) && node.declarations[0]?.id.type === 'Identifier'
}

export function implCallExpression(node: Node) {
    return node.type === 'CallExpression'
        && node.callee.type === 'Identifier'
        && node.callee.name === 'impl'

}

export function implStatement(node: Node): node is ImplStatement {
    return node.type === 'ExpressionStatement' && implCallExpression(node.expression)
}

export function implDeclaration(node: Node): node is ImplDeclaration {
    return constVariableDeclaration(node) && implCallExpression(node.declarations[0].init)
}

export function declaredInModule(parent: Node | null | undefined, node: Node): node is Declaration {
    return (
        parent?.type === 'Program'
        || parent?.type === 'ExportNamedDeclaration'
        || parent?.type === 'ExportDefaultDeclaration'
    ) && declaration(node);
}

export function declaration(node: Node): node is Declaration {
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