import type { StaticExport, StaticImport } from "oxc-parser";

export class DefaultMethods {
    #methods: Record<string, {
        start: number;
        end: number;
        // requiredImports: StaticImport;
        // requiredExports: StaticExport;
    }>;

    constructor() {
        this.#methods = Object.create(null);
    }

    add(
        name: string,
        start: number,
        end: number,
        // requiredImports: StaticImport,
        // requiredExports: StaticExport
    ) {
        this.#methods[name] = {
            start,
            end,
            // requiredImports,
            // requiredExports
        };
    }

    get(name: string) {
        return this.#methods[name];
    }

    serialize() {
    }

    deserialize() { }
}