import type { PropertyKey, Span } from "oxc-parser";

type TRAIT_ERROR = typeof TRAIT_ERROR[keyof typeof TRAIT_ERROR];
const TRAIT_ERROR = {
    Ident: 'Ident',
    Const: 'Const',
    Method: 'Method',
    Derive: 'Derive',
    TypeDef: 'TypeDef',
} as const;

type IDENTIFIER = typeof IDENTIFIER[keyof typeof IDENTIFIER];
const IDENTIFIER = {
    IsAnonymous: 'IsAnonymous',
    HasKeySignature: 'HasKeySignature',
    NeLiteral: 'NeLiteral',
} as const;

type CONSTANT = typeof CONSTANT[keyof typeof CONSTANT];
const CONSTANT = {
    NeStatic: 'ConstError:NeStaticProperty',
    NoAnnotation: 'ConstError:NoAnnotation',
    HasAssignment: 'ConstError:HasAssignment',
    NameNeUppercase: 'ConstError:NameNeUppercase',
    AnnotationInvalid: 'ConstError:AnnotationInvalid',
} as const;

type METHOD = typeof METHOD[keyof typeof METHOD];
const METHOD = {
    RequiredDefined: 'MethodError:RequiredDefined',
} as const;

type DEFINITION = typeof DEFINITION[keyof typeof DEFINITION];

const DEFINITION = {
    InvalidInitializer: 'DefinitionError:InvalidInitializer',
    InvalidTraitCallArguments: 'DefinitionError:InvalidTraitCallArguments',
    EmptyTraitTypeArguments: 'DefinitionError:EmptyTraitTypeArguments',
    MultipleTraitTypeArguments: 'DefinitionError:EmptyTraitTypeArguments',
    FlagConstruction: 'DefinitionError:FlagConstruction',
    LetDeclaration: 'DefinitionError:LetDeclaration',
} as const;

type DERIVE = typeof DERIVE[keyof typeof DERIVE];
const DERIVE = {
    Invalid: 'DeriveError:Invalid',
    UnresolvedRef: 'DeriveError:UnresolvedReference',
    Intersection: 'DeriveError:Intersection',
} as const;

class TraitDefinitionError<const Data extends { type: string; kind: string; } = any> extends Error {
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
}

export type TraitError = {
    [K in keyof typeof TraitError]: ReturnType<typeof TraitError[K]>;
}[keyof typeof TraitError];
export const TraitError = {
    //* DECLARATION
    LetDeclaration() {
        return new TraitDefinitionError('trait variables must be `const`', { type: TRAIT_ERROR.TypeDef, kind: DEFINITION.LetDeclaration })
    },
    InvalidInitializer(initializerType: string) {
        return new TraitDefinitionError(`initializer must equal a call to \`trait\`, but is of type ${initializerType}`, { type: TRAIT_ERROR.TypeDef, kind: DEFINITION.InvalidInitializer })
    },
    InvalidTraitCallArguments() {
        return new TraitDefinitionError('trait arguments must only be an object literal', {
            type: TRAIT_ERROR.TypeDef,
            kind: DEFINITION.InvalidTraitCallArguments
        })
    },
    EmptyTraitTypeArguments() {
        return new TraitDefinitionError('trait type arguments must be explicit. If a tuple type was used, it cannot be empty', {
            type: TRAIT_ERROR.TypeDef,
            kind: DEFINITION.InvalidTraitCallArguments
        })
    },
    MultipleTraitTypeArguments() {
        return new TraitDefinitionError('trait type arguments can only have one parameter (e.g. `trait<{}>`, `trait<Foo>`, `trait<[Foo, {}]>` are all allowed, but trait<{}, {}> is not)', {
            type: TRAIT_ERROR.TypeDef,
            kind: DEFINITION.InvalidTraitCallArguments
        })
    },
    TraitHasKeySignature() {
        return new TraitDefinitionError('cannot have key signatures\n', { type: TRAIT_ERROR.Ident, kind: IDENTIFIER.HasKeySignature });
    },
    CannotConstructFlags() {
        return new TraitDefinitionError('cannot construct flags', {
            type: TRAIT_ERROR.TypeDef,
            kind: DEFINITION.FlagConstruction,
        });
    },
    //* DERIVE
    RefNotFound(file: string, name: string) {
        return new TraitDefinitionError(`could not resolve ${name} in [ ${file} ]\nIf this was a variable, it will throw a \`ReferenceError\` at runtime`, {
            type: TRAIT_ERROR.Derive,
            kind: DERIVE.UnresolvedRef
        });
    },
    DeriveIsIntersection() {
        return new TraitDefinitionError(`intersections are not allowed, use the \`Derive\` type helper instead`, {
            type: TRAIT_ERROR.TypeDef,
            kind: DERIVE.Intersection,
        })
    },
    InvalidDeriveType() {
        return new TraitDefinitionError(`has an invalid derive (used Derive<...>, but the type arguments were incorrect)`, {
            type: TRAIT_ERROR.TypeDef,
            kind: DERIVE.Invalid
        });
    },

    //* PROPERTY
    IdentifierNeLiteral(propertyKey: Span, code: string) {
        return new TraitDefinitionError(`identifier must be a literal but is ${code.slice(propertyKey.start, propertyKey.end)}`, {
            type: TRAIT_ERROR.Ident,
            kind: IDENTIFIER.NeLiteral
        });
    },
    //* CONST
    ConstantAnnotationInvalid(propertyName: string) {
        return new TraitDefinitionError(`property ${propertyName}'s type annotation must either be a method or a literal`, {
            type: TRAIT_ERROR.Const,
            kind: 'InvalidConstantAnnotationError',
        });
    },
    ConstantNeStatic() {
        return new TraitDefinitionError(`must be static`, {
            type: TRAIT_ERROR.Const,
            kind: 'ConstantNeStaticError',
        });
    },
    ConstantNoAnnotation(constantName: string) {
        return new TraitDefinitionError(`constant ${constantName} has no type annotaion`, {
            type: TRAIT_ERROR.Const,
            kind: CONSTANT.NoAnnotation,
        });
    },
    ConstantHasAssignment(constantName: string) {
        return new TraitDefinitionError(`constant ${constantName} has an assignment (constants must be type annotations)`, { type: TRAIT_ERROR.Const, kind: `${CONSTANT.HasAssignment}` });
    },
    ConstantNameNeUppercase(constantName: string) {
        return new TraitDefinitionError(`constant ${constantName} must be all uppercase`, { type: TRAIT_ERROR.Const, kind: 'NameNeUppercaseError' });
    },
    //* METHOD
    RequiredMethodHasDefinition(methodName: string) {
        return new TraitDefinitionError(`required method ${methodName} cannot be defined`, {
            type: TRAIT_ERROR.Method,
            kind: METHOD.RequiredDefined,
        })
    },

} as const;