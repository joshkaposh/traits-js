class DefaultMethod {


}

export class DefaultMethods {
    #methods: Record<string, {
        start: number;
        end: number;
    }>;

    constructor() {
        this.#methods = Object.create(null);
    }

    add(
        name: string,
        start: number,
        end: number,
    ) {
        this.#methods[name] = {
            start,
            end,
        };
    }

    get(name: string) {
        return this.#methods[name];
    }

    serialize() {
    }

    deserialize() { }
}