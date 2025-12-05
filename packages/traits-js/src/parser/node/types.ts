import { type ArrowFunctionExpression, type CallExpression, type Class, type Expression, type ExpressionStatement, type Function, type FunctionType, type IdentifierName, type IdentifierReference, type ObjectExpression, type ObjectProperty, type TSEnumDeclaration, type TSInterfaceDeclaration, type TSLiteral, type TSTupleType, type TSTypeAliasDeclaration, type TSTypeLiteral, type TSTypeParameterInstantiation, type TSTypeQuery, type TSTypeReference, type VariableDeclaration, type VariableDeclarator } from 'oxc-parser';

export type TypeDeclaration = TSTypeAliasDeclaration | TSInterfaceDeclaration;
export type VarDeclaration = Class | Function | TSEnumDeclaration | VariableDeclaration;

export interface ConstVariableDeclaration extends VariableDeclaration {
    kind: 'const';
    declarations: [VariableDeclarator & { id: IdentifierName; init: Expression }];
}

export interface TraitAliasDeclaration extends TSTypeAliasDeclaration {
    typeAnnotation: TSTypeLiteral;
}

export type BaseTypeArgument = TSTypeReference | TSTypeLiteral;

export interface DeriveTupleType extends TSTupleType {
    elementTypes: (TSTypeQuery | TSTypeReference)[];
}


export interface TypeArguments extends TSTypeParameterInstantiation {
    params: [BaseTypeArgument] | [BaseTypeArgument, DeriveTupleType];
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
export interface ImplCallExpression extends CallExpression {
    callee: IdentifierReference;
    arguments: [ArrowFunctionExpression | Function]
}

export interface ImplStatement extends ExpressionStatement {
    expression: ImplCallExpression;
}

export interface ImplDeclaration extends VariableDeclaration {
    declarations: [VariableDeclarator & { id: IdentifierName; init: ImplCallExpression }];
}


export interface TraitVariableDeclarator extends VariableDeclarator {
    id: IdentifierReference;
    init: TraitCallExpression;
}

export interface TraitDeclaration extends VariableDeclaration {
    kind: 'const';
    declarations: [TraitVariableDeclarator];
}


// export interface ImplStatement extends ExpressionStatement {
//     // expression:  IdentifierReference;
// }
