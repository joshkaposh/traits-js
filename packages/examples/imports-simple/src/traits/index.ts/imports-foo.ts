import { trait } from 'traits-js';
import { Foo } from 'simple/traits';

export const ImportsFoo = trait<{
    importsFoo?(): void;
}, [typeof Foo]>({
    importsFoo() {
        // this.
    },
});
