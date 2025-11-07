
export type QueueFn<T, K> = (key: K, data: T) => void;
export type VisitFn<T, K> = (frame: T, visited: Set<K>, add: QueueFn<T, K>) => Promise<void>;

export class Stack<D = any, K extends any = string> {
    #stack: D[];
    #ids: Set<K>;
    constructor();
    constructor(initialKey: K, initialData: D);
    constructor(initialKey?: K, initialData?: D) {
        this.#stack = initialData ? [initialData] : [];
        this.#ids = new Set(initialKey ? [initialKey] : []);
    }

    get length() {
        return this.#stack.length;
    }

    static async dfs<T, K>(
        stack: Stack<T, K>,
        visit: (
            frame: T,
            visited: Set<K>,
            add: (key: K, data: T) => void
        ) => Promise<void>
    ) {
        const ids = stack.#ids;
        const frames = stack.#stack;
        const queuedFrames: T[] = [];

        const add = (key: K, data: T) => {
            ids.add(key);
            queuedFrames.push(data);
        };

        while (frames.length) {
            const frame = frames.pop()!;
            await visit(frame, ids, add);
            for (let i = frames.length; i < queuedFrames.length; i++) {
                frames.push(queuedFrames[i]!);
            }
            queuedFrames.length = 0;
        }
    }

    peek(): D | undefined {
        return this.#stack.at(-1);
    }

    visited(key: K): boolean {
        return this.#ids.has(key);
    }
}
