import type { ParseResult } from "oxc-parser";

export type ParseFileResultResult = {
    result: ParseResult;
    path: string;
    packageJson: string | undefined,
    name: string;
    originalCode: string;
    originalRequest: string;
};

export type ParseFileResult = ParseFileResultResult | string[];
