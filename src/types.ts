

export type CoberturaCoverageNode = {
    lineRate: number;
    linesCovered: number;
    linesValid: number;
    packages: Map<string, CoberturaPackageNode>;
}

export type CoberturaPackageNode = {
    name: string;
    lineRate: number;
    classes: Map<string, CoberturaClassNode>;
}

export type CoberturaClassNode = {
    classId: string; // Use "name + filename" to identify the class
    fileName: string;
    name: string;
    lineRate: number;
    coveredLines: number;
    lines: CoberturaLineNode[];
}

type CoberturaLineNode = {
    lineNumber: number;
    lineHash: string;
    hits: number;
}

export interface RunDetails {
    exitCode: number;
}