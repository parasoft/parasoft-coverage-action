export type CoberturaCoverage = {
    lineRate: number;
    linesCovered: number;
    linesValid: number;
    packages: Map<string, CoberturaPackage>;
}

export type CoberturaPackage = {
    name: string;
    lineRate: number;
    classes: Map<string, CoberturaClass>;
}

export type CoberturaClass = {
    classId: string; // Use "name + filename" to identify the class
    fileName: string;
    name: string;
    lineRate: number;
    coveredLines: number;
    lines: CoberturaLine[];
}

type CoberturaLine = {
    lineNumber: number;
    lineHash: string;
    hits: number;
}
