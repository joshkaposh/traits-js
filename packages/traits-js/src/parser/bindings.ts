import { type Declaration, type ExportNamedDeclaration, type TSTypeAliasDeclaration } from 'oxc-parser';
import type { TraitDeclaration } from './node';

interface BindingBase<D> {
    name: string;
    data: D;
}

export type BindingInfo = {
    parent: ExportNamedDeclaration;
    name: string;
} & (
        {
            isType: true;
            node: TSTypeAliasDeclaration;
        } | {
            isType: false;
            node: TraitDeclaration;
        }
    );

export class Binding {
    #id: number;
    #info: BindingInfo;
    constructor(id: number, info: BindingInfo) {
        this.#id = id;
        this.#info = info;
    }

    initialize(dict: LookupDict, imports: LookupRecord) {
        const id = this.#id,
            info = this.#info,
            name = info.name,
            isType = info.isType

        let entry = dict[name];
        if (entry) {
            if (isType) {
                entry.type = id;
            } else {
                entry.variable = id;
            }
        } else {
            dict[name] = {
                type: isType ? id : null,
                variable: !isType ? id : null
            };
        }
    }

    get name() {
        return this.#info.name;
    }

    get isType() {
        return this.#info.isType;
    }

    get parent() {
        return this.#info.parent;
    }

    get node() {
        return this.#info.node;
    }

}

type LookupDict = Record<string, { type: number | null, variable: number | null }>;
type LookupRecord = Record<string, number>;

export class Bindings {
    #bindings: Binding[]
    #lookup: LookupDict;
    #imports: LookupRecord;
    #variables: LookupRecord;
    #types: LookupRecord;

    constructor(
        all: Binding[] = [],
        lookup: LookupDict = {},
        imports: LookupRecord = {},
        variables: LookupRecord = {},
        types: LookupRecord = {},
    ) {
        this.#bindings = all;
        this.#lookup = lookup
        this.#imports = imports;
        this.#variables = variables;
        this.#types = types;
    }

    initialize() {
        const bindings = this.#bindings;
        const indices = this.#lookup;
        const imports = this.#imports;

        for (let i = 0; i < bindings.length; i++) {
            bindings[i]!.initialize(indices, imports);
        }
    }

    queue(info: BindingInfo) {
        const bindings = this.#bindings;
        const id = bindings.length;

        bindings.push(new Binding(id, info));

        return id;

    }

    has(name: string) {
        return (this.#variables[name] ?? this.#types[name]) != null;
    }

    get(name: string): [null | Binding, null | Binding] | void {
        const indices = this.#lookup[name];
        if (indices != null) {
            const b = this.#bindings;
            const type = indices.type;
            const variable = indices.variable;
            return [
                variable == null ? null : b[variable]!,
                type == null ? null : b[type]!
            ];
        }
    }

}
