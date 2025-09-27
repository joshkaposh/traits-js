import { type CallExpression, type Function, type IdentifierReference, type ObjectExpression, type ObjectProperty, type TSInterfaceDeclaration, type TSLiteral, type TSTypeAliasDeclaration, type TSTypeLiteral, type TSTypeParameterInstantiation, type TSTypeReference, type VariableDeclaration, type VariableDeclarator } from 'oxc-parser';

export type TypeDeclaration = TSTypeAliasDeclaration | TSInterfaceDeclaration | TSTypeLiteral;

export interface TypeArguments extends TSTypeParameterInstantiation {
    params: [TSTypeReference | TSTypeLiteral];
}

export interface TraitObjectProperty extends ObjectProperty {
    key: IdentifierReference;
    value: Function | TSLiteral;
}

export interface TraitObjectExpression extends ObjectExpression {
    properties: TraitObjectProperty[];
}

export interface TraitCallExpression extends CallExpression {
    callee: IdentifierReference;
    arguments: [TraitObjectExpression];
    typeArguments: TypeArguments;
}

export interface TraitVariableDeclarator extends VariableDeclarator {
    id: IdentifierReference;
    init: TraitCallExpression;
}

export interface TraitDeclaration extends VariableDeclaration {
    kind: 'const';
    declarations: [TraitVariableDeclarator];
}
