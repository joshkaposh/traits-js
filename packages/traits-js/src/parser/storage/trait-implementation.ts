import type { Class } from "oxc-parser";
import type { TraitDefinition } from "./trait-definition";

export class TraitImplementation {
    #definition: TraitDefinition;
    #target: Class;

    constructor(
        definition: TraitDefinition,
        target: Class,
        // foreign: boolean
    ) {
        this.#definition = definition;
        this.#target = target;
    }

    static foreign() { }

    apply() {
        const targetStaticProps = this.#target.body.body.filter(el => 'static' in el && el.static);
        const targetInstanceProps = this.#target.body.body.filter(el => 'static' in el && !el.static);
    }
}