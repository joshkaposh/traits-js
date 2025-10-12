import { type CallExpression, type Function, type IdentifierReference, type ObjectExpression, type ObjectProperty, type TSLiteral, type TSTupleType, type TSTypeAliasDeclaration, type TSTypeLiteral, type TSTypeParameterInstantiation, type TSTypeQuery, type TSTypeReference, type VariableDeclaration, type VariableDeclarator } from 'oxc-parser';

export type TypeDeclaration = TSTypeAliasDeclaration | TSTypeLiteral;


export interface TraitAliasDeclaration extends TSTypeAliasDeclaration {
    typeAnnotation: TSTypeLiteral;
}

export type BaseTypeArgument = TSTypeReference | TSTypeLiteral;

export interface DeriveTupleType extends TSTupleType {
    elementTypes: (TSTypeQuery | TSTypeReference)[];
}


export interface TypeArguments extends TSTypeParameterInstantiation {
    params: [BaseTypeArgument] | [DeriveTupleType, BaseTypeArgument];
}

export interface TraitObjectProperty extends ObjectProperty {
    key: IdentifierReference;
    value: Function | TSLiteral | ObjectExpression;
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
