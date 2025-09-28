import type { MethodDefinition, Node, PropertyDefinition, TSType } from "oxc-parser";

// type IdentErrType = 0;
// type ConstErrType = 1;
// type MethodErrType = 2;

export type PARSE_ERR_TYPE = typeof PARSE_ERR_TYPE[keyof typeof PARSE_ERR_TYPE];
export const PARSE_ERR_TYPE = {
    Ident: 0,
    Const: 1,
    Method: 2,
    TypeDef: 3,
} as const;

export type IDENT_ERR = typeof IDENT_ERR[keyof typeof IDENT_ERR];
export const IDENT_ERR = {
    IsAnonymous: 0,
    HasKeySignature: 1,
    NeLiteral: 2,
} as const;

export type CONST_ERR = typeof CONST_ERR[keyof typeof CONST_ERR];
export const CONST_ERR = {
    NeStatic: 0,
    NoAnnotation: 1,
    HasAssignment: 2,
    NameNeUppercase: 3,
    AnnotationInvalid: 4,
} as const;


export type METHOD_ERR = typeof METHOD_ERR[keyof typeof METHOD_ERR];
export const METHOD_ERR = {
    RequiredDefined: 0,
} as const;


export type TYPE_DEF_ERR = typeof TYPE_DEF_ERR[keyof typeof TYPE_DEF_ERR];
export const TYPE_DEF_ERR = {
    Invalid: 0,
} as const;


// interface ErrorData {
//     type: PARSE_ERR_TYPE;
//     kind: number;
// }

// interface IdentErrorData extends ErrorData {
//     type: IdentErrType;
// }

// interface ConstErrorData extends ErrorData {
//     type: ConstErrType;
// }

// interface MethodErrorData extends ErrorData {
//     type: MethodErrType;
// }

export class TraitDefinitionError<const Data extends { type: PARSE_ERR_TYPE; kind: number } = any> extends Error {
    #data: Data;
    constructor(message: string, data: Data) {
        super(message);
        this.#data = data;
    }

    get type() {
        return this.#data.type
    }

    get kind() {
        return this.#data.kind;
    }

    get data() {
        return this.#data;
    }
}


export type ParseError = {
    [K in keyof typeof ParseError]: ReturnType<typeof ParseError[K]>;
}[keyof typeof ParseError];
export const ParseError = {
    TraitIsAnonymous(node: Node) {
        return new TraitDefinitionError(`cannot be anonymous`, { type: PARSE_ERR_TYPE.Ident, kind: IDENT_ERR.IsAnonymous, node });
    },
    TraitHasKeySignature(node: Node) {
        return new TraitDefinitionError('cannot have key signatures\n', { type: PARSE_ERR_TYPE.Ident, kind: IDENT_ERR.HasKeySignature, name: '', node });
    },
    IdentifierNeLiteral(node: PropertyDefinition | MethodDefinition) {
        return new TraitDefinitionError(`identifier (${node.type}) must be a literal`, { type: PARSE_ERR_TYPE.Ident, kind: IDENT_ERR.NeLiteral, node, name: `` });
    },
    ConstantAnnotationInvalid(node: Node, name: string, type: NonNullable<TSType['type']>) {
        return new TraitDefinitionError(`property ${name}'s type annotation must either be a method or a literal`, {
            type: PARSE_ERR_TYPE.Const,
            kind: CONST_ERR.AnnotationInvalid,
            name,
            node
        });
    },
    ConstantNeStatic(node: Node, name: string) {
        return new TraitDefinitionError('must be static', {
            name,
            node,
            type: PARSE_ERR_TYPE.Const,
            kind: CONST_ERR.NeStatic,
        });
    },
    ConstantNoAnnotation(node: Node, name: string) {
        return new TraitDefinitionError(`has no type annotaion`, { type: PARSE_ERR_TYPE.Const, kind: CONST_ERR.NoAnnotation, name, node });
    },
    ConstantHasAssignment(node: Node, name: string) {
        return new TraitDefinitionError(`has an assignment (constants must be type annotations)`, { type: PARSE_ERR_TYPE.Const, kind: CONST_ERR.HasAssignment, name, node });
    },
    ConstantNameNeUppercase(node: Node, name: string) {
        return new TraitDefinitionError('must be all uppercase', { type: PARSE_ERR_TYPE.Const, kind: CONST_ERR.NameNeUppercase, name, node });
    },
    RequiredMethodHasDefinition(name: string) {
        return new TraitDefinitionError('required method cannot be defined', { type: PARSE_ERR_TYPE.Method, kind: METHOD_ERR.RequiredDefined, name })
    }
} as const;


export type DeriveError = {
    [K in keyof typeof DeriveError]: ReturnType<typeof DeriveError[K]>;
}[keyof typeof DeriveError];
export const DeriveError = {
    RefNotFound(file: string, name: string) {
        return new TraitDefinitionError(`SyntaxError: could not resolve ${name} in [ ${file} ]\nIf this was a variable, it will throw at runtime`, { type: PARSE_ERR_TYPE.TypeDef, kind: 0 });
    },
    InvalidDeriveType(file: string, name: string, code: string) {
        return new TraitDefinitionError(`DeriveError: ${name} in [ ${file} ] has an invalid derive (used Derive<[Foo], Bar>, but the type arguments were incorrect)`, { type: PARSE_ERR_TYPE.TypeDef, kind: 0 });
    },
} as const;