
export type QueueFn<T, K> = (key: K, data: T) => void;
export type VisitFn<T, K> = (frame: T, add: QueueFn<T, K>) => Promise<void>;

export class Stack<D = any, K extends any = string> {
    #stack: D[];
    #ids: Set<K>;
    constructor();
    constructor(initialKey: K, initialData: D);
    constructor(initialKey?: K, initialData?: D) {
        const stack: D[] = [];
        const ids = new Set<K>();
        if (initialKey != null) {
            ids.add(initialKey);
            stack.push(initialData!);
        }

        this.#stack = stack;
        this.#ids = ids;
    }

    get length() {
        return this.#stack.length;
    }

    static async dfs<T, K>(
        stack: Stack<T, K>,
        visit: (
            frame: T,
            add: (key: K, data: T) => void
        ) => Promise<void>
    ) {
        const ids = stack.#ids;
        const frames = stack.#stack;
        const queuedFrames: T[] = [];

        const add = (key: K, data: T) => {
            if (!ids.has(key)) {
                queuedFrames.push(data);
            }
            ids.add(key);
        };

        while (frames.length) {
            const frame = frames.pop()!;
            await visit(frame, add);
            for (let i = frames.length; i < queuedFrames.length; i++) {
                frames.push(queuedFrames[i]!);
            }
            queuedFrames.length = 0;
        }
    }

    has(key: K) {
        return this.#ids.has(key);
    }

    clear() {
        this.#ids.clear();
        this.#stack.length = 0;
    }

    peek(): D | undefined {
        return this.#stack.at(-1);
    }
}
