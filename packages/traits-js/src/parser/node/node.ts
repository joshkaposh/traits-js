import { type Node, type TSInterfaceDeclaration, type TSTypeAliasDeclaration, type TSTypeLiteral, type VariableDeclaration } from 'oxc-parser';

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
