export class Stack<D = any> {
    #stack: D[];
    #ids: Map<string, number>;
    constructor() {
        this.#stack = [];
        this.#ids = new Map();
    }

    get length() {
        return this.#stack.length;
    }

    get stack() {
        return this.#stack;
    }

    push(key: string, file: D): number {
        const id = this.#stack.length;
        this.#ids.set(key, id);
        this.#stack.push(file);
        return id;
    }

    pop(): D | undefined {
        return this.#stack.pop();
    }

    peek(): D | undefined {
        return this.#stack.at(-1);
    }

    visited(path: string): boolean {
        return this.#ids.has(path);
    }
}
